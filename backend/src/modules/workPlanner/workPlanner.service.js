/**
 * @fileoverview Work Planner: business rules and mongoose persistence.
 * @module modules/workPlanner/workPlanner.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const {
  EDITABLE_PLAN_STATUSES,
  TERMINAL_VISIT_STATUSES,
  startOfDay,
  endOfDay,
  isAdminDept,
} = require('./workPlanner.constants');

function userId(user) {
  return user?._id || user?.id;
}

function sameId(a, b) {
  return String(a) === String(b);
}

function isOwner(plan, user) {
  return sameId(plan.sales_user?._id || plan.sales_user, userId(user));
}

function assertCanView(plan, user) {
  if (isAdminDept(user) || isOwner(plan, user)) return;
  throw new ApiError(403, 'You do not have access to this work plan');
}

function assertCanEditStructure(plan, user) {
  const admin = isAdminDept(user);
  // Owner or admin may edit; non-owners who are not admin are blocked.
  if (!isOwner(plan, user) && !admin) {
    throw new ApiError(403, 'Only the plan owner can edit this work plan');
  }
  // Admin / super_admin may keep editing after submit/approve (for sales-user plans).
  if (admin) {
    if (plan.status === 'completed') {
      throw new ApiError(400, `Cannot edit a work plan in status "${plan.status}"`);
    }
    return;
  }
  // Sales owners may only edit draft / rejected plans.
  if (!EDITABLE_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot edit a work plan in status "${plan.status}"`);
  }
}

async function logActivity(user, planId, action, message, extra = {}) {
  await activityService.create({
    actor: userId(user),
    entity_type: 'work_plan',
    entity_id: planId,
    action,
    message,
    ...extra,
  });
}

async function loadPlanOrThrow(id) {
  const { WorkPlan } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null })
    .populate('sales_user', 'name email department')
    .populate('approved_by', 'name email')
    .lean();
  if (!plan) throw new ApiError(404, 'Work plan not found');
  return plan;
}

async function loadVisits(planId) {
  const { WorkPlanVisit } = getModels();
  const rows = await WorkPlanVisit.find({ work_plan: planId, deletedAt: null })
    .populate('party', 'party_name mobile email contact_person contacts billing_address shipping_address')
    .sort({ sequence: 1 })
    .lean();
  return rows.map(toPlain);
}

async function getWithVisits(id) {
  const plan = await loadPlanOrThrow(id);
  const visits = await loadVisits(id);
  return { ...toPlain(plan), visits };
}

async function renumberVisits(planId) {
  const { WorkPlanVisit } = getModels();
  const visits = await WorkPlanVisit.find({ work_plan: planId, deletedAt: null })
    .sort({ sequence: 1 })
    .lean();
  // Two-phase update avoids unique (work_plan, sequence) collisions while shifting.
  for (let i = 0; i < visits.length; i += 1) {
    await WorkPlanVisit.updateOne(
      { _id: visits[i]._id },
      { $set: { sequence: (i + 1) * 1000 } }
    );
  }
  for (let i = 0; i < visits.length; i += 1) {
    await WorkPlanVisit.updateOne({ _id: visits[i]._id }, { $set: { sequence: i + 1 } });
  }
}

async function maybeCompletePlan(planId, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan || plan.status !== 'approved') return;

  const openCount = await WorkPlanVisit.countDocuments({
    work_plan: planId,
    deletedAt: null,
    status: { $nin: TERMINAL_VISIT_STATUSES },
  });
  if (openCount > 0) return;

  const visitCount = await WorkPlanVisit.countDocuments({ work_plan: planId, deletedAt: null });
  if (visitCount === 0) return;

  plan.status = 'completed';
  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'status_changed', 'Work plan marked completed (all visits finished)');
}

async function list(query = {}, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const filter = { deletedAt: null };

  if (!isAdminDept(user)) {
    filter.sales_user = userId(user);
  } else if (query.sales_user) {
    filter.sales_user = query.sales_user;
  }

  if (query.status) filter.status = query.status;

  if (query.date) {
    filter.plan_date = {
      $gte: startOfDay(query.date),
      $lte: endOfDay(query.date),
    };
  } else if (query.from || query.to) {
    filter.plan_date = {};
    if (query.from) filter.plan_date.$gte = startOfDay(query.from);
    if (query.to) filter.plan_date.$lte = endOfDay(query.to);
  }

  if (query.party) {
    const planIds = await WorkPlanVisit.distinct('work_plan', {
      party: query.party,
      deletedAt: null,
    });
    filter._id = { $in: planIds };
  }

  const limit = Math.min(parseInt(query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    WorkPlan.countDocuments(filter),
    WorkPlan.find(filter)
      .populate('sales_user', 'name email department')
      .populate('approved_by', 'name email')
      .sort({ plan_date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const planIds = rows.map((r) => r._id);
  const visitCounts = await WorkPlanVisit.aggregate([
    { $match: { work_plan: { $in: planIds }, deletedAt: null } },
    { $group: { _id: '$work_plan', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(visitCounts.map((c) => [String(c._id), c.count]));

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 0,
    data: rows.map((r) => ({
      ...toPlain(r),
      visit_count: countMap.get(String(r._id)) || 0,
    })),
  };
}

async function get(id, user) {
  const plan = await loadPlanOrThrow(id);
  assertCanView(plan, user);
  const visits = await loadVisits(id);
  return { ...toPlain(plan), visits };
}

async function create(body, user) {
  const { WorkPlan } = getModels();
  const salesUserId = isAdminDept(user) && body.sales_user ? body.sales_user : userId(user);
  const planDate = startOfDay(body.plan_date);

  try {
    const doc = await WorkPlan.create({
      plan_date: planDate,
      sales_user: salesUserId,
      status: 'draft',
      remarks: body.remarks?.trim() || undefined,
      created_by: userId(user),
      updated_by: userId(user),
    });

    await logActivity(user, doc._id, 'created', `Work plan created for ${planDate.toISOString().slice(0, 10)}`);
    return get(doc._id, user);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, 'A work plan already exists for this sales user on the selected date');
    }
    throw err;
  }
}

async function update(id, body, user) {
  const { WorkPlan } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  assertCanEditStructure(plan, user);

  if (body.plan_date !== undefined) {
    plan.plan_date = startOfDay(body.plan_date);
  }
  if (body.remarks !== undefined) {
    plan.remarks = typeof body.remarks === 'string' ? body.remarks.trim() : body.remarks;
  }
  // Rejected plans return to draft when edited
  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.approved_by = undefined;
    plan.approved_at = undefined;
    plan.submitted_at = undefined;
  }

  plan.updated_by = userId(user);

  try {
    await plan.save();
  } catch (err) {
    if (err && err.code === 11000) {
      throw new ApiError(409, 'A work plan already exists for this sales user on the selected date');
    }
    throw err;
  }

  await logActivity(user, plan._id, 'updated', 'Work plan updated');
  return get(plan._id, user);
}

async function remove(id, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  if (!isAdminDept(user) && !isOwner(plan, user)) {
    throw new ApiError(403, 'Only the plan owner can delete this work plan');
  }
  if (plan.status !== 'draft' && !isAdminDept(user)) {
    throw new ApiError(400, 'Only draft work plans can be deleted');
  }

  const now = new Date();
  plan.deletedAt = now;
  plan.updated_by = userId(user);
  await plan.save();
  await WorkPlanVisit.updateMany({ work_plan: id, deletedAt: null }, { $set: { deletedAt: now } });

  await logActivity(user, plan._id, 'deleted', 'Work plan deleted');
  return toPlain(plan.toObject());
}

async function submit(id, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  if (!isOwner(plan, user) && !isAdminDept(user)) {
    throw new ApiError(403, 'Only the plan owner can submit this work plan');
  }
  if (!EDITABLE_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot submit a work plan in status "${plan.status}"`);
  }

  const visitCount = await WorkPlanVisit.countDocuments({ work_plan: id, deletedAt: null });
  if (visitCount < 1) {
    throw new ApiError(400, 'Work plan cannot be submitted without at least one visit');
  }

  plan.status = 'submitted';
  plan.submitted_at = new Date();
  plan.rejection_reason = undefined;
  plan.updated_by = userId(user);
  await plan.save();

  await logActivity(user, plan._id, 'submitted', 'Work plan submitted for approval');
  return get(plan._id, user);
}

async function approve(id, user) {
  if (!isAdminDept(user)) {
    throw new ApiError(403, 'Only admin can approve work plans');
  }
  const { WorkPlan } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  if (plan.status !== 'submitted') {
    throw new ApiError(400, 'Only submitted work plans can be approved');
  }

  plan.status = 'approved';
  plan.approved_by = userId(user);
  plan.approved_at = new Date();
  plan.rejection_reason = undefined;
  plan.updated_by = userId(user);
  await plan.save();

  await logActivity(user, plan._id, 'approved', 'Work plan approved');
  await notificationService.createForUser(plan.sales_user, {
    title: 'Work plan approved',
    message: `Your work plan for ${plan.plan_date.toISOString().slice(0, 10)} was approved.`,
    type: 'success',
    module: 'system',
    entity_type: 'work_plan',
    entity_id: plan._id,
  });

  return get(plan._id, user);
}

async function reject(id, body, user) {
  if (!isAdminDept(user)) {
    throw new ApiError(403, 'Only admin can reject work plans');
  }
  const { WorkPlan } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  if (plan.status !== 'submitted') {
    throw new ApiError(400, 'Only submitted work plans can be rejected');
  }

  plan.status = 'rejected';
  plan.rejection_reason = body.rejection_reason.trim();
  plan.approved_by = undefined;
  plan.approved_at = undefined;
  plan.updated_by = userId(user);
  await plan.save();

  await logActivity(user, plan._id, 'rejected', `Work plan rejected: ${plan.rejection_reason}`);
  await notificationService.createForUser(plan.sales_user, {
    title: 'Work plan rejected',
    message: `Your work plan for ${plan.plan_date.toISOString().slice(0, 10)} was rejected. Reason: ${plan.rejection_reason}`,
    type: 'warning',
    module: 'system',
    entity_type: 'work_plan',
    entity_id: plan._id,
  });

  return get(plan._id, user);
}

async function addVisit(planId, body, user) {
  const { WorkPlan, WorkPlanVisit, Party } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanEditStructure(plan, user);

  const party = await Party.findOne({ _id: body.party, deletedAt: null }).lean();
  if (!party) throw new ApiError(404, 'Party not found');

  const maxSeq = await WorkPlanVisit.findOne({ work_plan: planId, deletedAt: null })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  const sequence = body.sequence ? Number(body.sequence) : (maxSeq?.sequence || 0) + 1;

  const visit = await WorkPlanVisit.create({
    work_plan: planId,
    sequence,
    party: body.party,
    contact_person: body.contact_person?.trim() || party.contact_person || undefined,
    contact_number: body.contact_number?.trim() || party.mobile || undefined,
    address: body.address?.trim() || undefined,
    planned_start_time: body.planned_start_time ? new Date(body.planned_start_time) : undefined,
    planned_end_time: body.planned_end_time ? new Date(body.planned_end_time) : undefined,
    purpose: body.purpose?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    status: 'pending',
  });

  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.submitted_at = undefined;
    plan.updated_by = userId(user);
    await plan.save();
  }

  await renumberVisits(planId);
  await logActivity(user, planId, 'updated', `Visit added (sequence ${sequence})`);
  return getWithVisits(planId);
}

async function updateVisit(planId, visitId, body, user) {
  const { WorkPlan, WorkPlanVisit, Party } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  assertCanEditStructure(plan, user);

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');

  if (body.party !== undefined) {
    const party = await Party.findOne({ _id: body.party, deletedAt: null }).lean();
    if (!party) throw new ApiError(404, 'Party not found');
    visit.party = body.party;
  }
  if (body.sequence !== undefined) visit.sequence = Number(body.sequence);
  if (body.contact_person !== undefined) visit.contact_person = body.contact_person?.trim() || undefined;
  if (body.contact_number !== undefined) visit.contact_number = body.contact_number?.trim() || undefined;
  if (body.address !== undefined) visit.address = body.address?.trim() || undefined;
  if (body.planned_start_time !== undefined) {
    visit.planned_start_time = body.planned_start_time ? new Date(body.planned_start_time) : undefined;
  }
  if (body.planned_end_time !== undefined) {
    visit.planned_end_time = body.planned_end_time ? new Date(body.planned_end_time) : undefined;
  }
  if (body.purpose !== undefined) visit.purpose = body.purpose?.trim() || undefined;
  if (body.notes !== undefined) visit.notes = body.notes?.trim() || undefined;
  if (body.status !== undefined && isAdminDept(user)) visit.status = body.status;

  await visit.save();

  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.submitted_at = undefined;
    plan.updated_by = userId(user);
    await plan.save();
  }

  await renumberVisits(planId);
  await logActivity(user, planId, 'updated', `Visit updated (${visitId})`);
  return getWithVisits(planId);
}

async function removeVisit(planId, visitId, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanEditStructure(plan, user);

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');

  visit.deletedAt = new Date();
  await visit.save();
  await renumberVisits(planId);

  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.submitted_at = undefined;
    plan.updated_by = userId(user);
    await plan.save();
  }

  await logActivity(user, planId, 'updated', `Visit deleted (${visitId})`);
  return getWithVisits(planId);
}

async function checkIn(planId, visitId, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanView(plan, user);
  if (!isOwner(plan, user) && !isAdminDept(user)) {
    throw new ApiError(403, 'Only the plan owner can check in');
  }
  if (plan.status !== 'approved') {
    throw new ApiError(400, 'Visits can only be executed on approved work plans');
  }

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');
  if (!['pending', 'rescheduled'].includes(visit.status)) {
    throw new ApiError(400, `Cannot check in a visit in status "${visit.status}"`);
  }

  visit.status = 'checked_in';
  visit.actual_check_in = new Date();
  await visit.save();

  await logActivity(user, planId, 'status_changed', `Checked in to visit ${visit.sequence}`);
  return getWithVisits(planId);
}

async function checkOut(planId, visitId, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanView(plan, user);
  if (!isOwner(plan, user) && !isAdminDept(user)) {
    throw new ApiError(403, 'Only the plan owner can check out');
  }
  if (plan.status !== 'approved') {
    throw new ApiError(400, 'Visits can only be executed on approved work plans');
  }

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');
  if (visit.status !== 'checked_in') {
    throw new ApiError(400, 'Visit must be checked in before check out');
  }

  visit.actual_check_out = new Date();
  await visit.save();

  await logActivity(user, planId, 'status_changed', `Checked out from visit ${visit.sequence}`);
  return getWithVisits(planId);
}

async function completeVisit(planId, visitId, body, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanView(plan, user);
  if (!isOwner(plan, user) && !isAdminDept(user)) {
    throw new ApiError(403, 'Only the plan owner can complete visits');
  }
  if (plan.status !== 'approved') {
    throw new ApiError(400, 'Visits can only be completed on approved work plans');
  }

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');
  if (!['pending', 'checked_in'].includes(visit.status)) {
    throw new ApiError(400, `Cannot complete a visit in status "${visit.status}"`);
  }

  visit.status = 'completed';
  visit.outcome = body.outcome.trim();
  if (!visit.actual_check_out) visit.actual_check_out = new Date();
  if (!visit.actual_check_in) visit.actual_check_in = visit.actual_check_out;
  if (body.next_followup_date) {
    visit.next_followup_date = new Date(body.next_followup_date);
  }
  await visit.save();

  await logActivity(user, planId, 'status_changed', `Visit ${visit.sequence} completed`);
  await maybeCompletePlan(planId, user);
  return getWithVisits(planId);
}

async function stats(query = {}, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const filter = { deletedAt: null };

  if (!isAdminDept(user)) {
    filter.sales_user = userId(user);
  } else if (query.sales_user) {
    filter.sales_user = query.sales_user;
  }

  if (query.from || query.to) {
    filter.plan_date = {};
    if (query.from) filter.plan_date.$gte = startOfDay(query.from);
    if (query.to) filter.plan_date.$lte = endOfDay(query.to);
  }

  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [
    todayPlans,
    pendingApproval,
    approved,
    completed,
    rejected,
    statusGroups,
    visitAgg,
    monthlyTrend,
  ] = await Promise.all([
    WorkPlan.countDocuments({ ...filter, plan_date: { $gte: today, $lte: todayEnd } }),
    WorkPlan.countDocuments({ ...filter, status: 'submitted' }),
    WorkPlan.countDocuments({ ...filter, status: 'approved' }),
    WorkPlan.countDocuments({ ...filter, status: 'completed' }),
    WorkPlan.countDocuments({ ...filter, status: 'rejected' }),
    WorkPlan.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    WorkPlanVisit.aggregate([
      {
        $lookup: {
          from: 'workplans',
          localField: 'work_plan',
          foreignField: '_id',
          as: 'plan',
        },
      },
      { $unwind: '$plan' },
      {
        $match: {
          deletedAt: null,
          'plan.deletedAt': null,
          ...(filter.sales_user ? { 'plan.sales_user': filter.sales_user } : {}),
        },
      },
      {
        $group: {
          _id: '$work_plan',
          visit_count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          plans_with_visits: { $sum: 1 },
          total_visits: { $sum: '$visit_count' },
        },
      },
    ]),
    WorkPlan.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year: { $year: '$plan_date' },
            month: { $month: '$plan_date' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]),
  ]);

  const visitSummary = visitAgg[0] || { plans_with_visits: 0, total_visits: 0 };
  const averageVisits =
    visitSummary.plans_with_visits > 0
      ? Math.round((visitSummary.total_visits / visitSummary.plans_with_visits) * 10) / 10
      : 0;

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g._id, g.count]));

  return {
    today_plans: todayPlans,
    pending_approval: pendingApproval,
    approved,
    completed,
    rejected,
    average_visits: averageVisits,
    by_status: byStatus,
    monthly_trend: monthlyTrend.map((m) => ({
      year: m._id.year,
      month: m._id.month,
      count: m.count,
    })),
  };
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  submit,
  approve,
  reject,
  addVisit,
  updateVisit,
  removeVisit,
  checkIn,
  checkOut,
  completeVisit,
  stats,
};
