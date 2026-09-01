/**
 * @fileoverview Work Planner: business rules and mongoose persistence.
 * @module modules/workPlanner/workPlanner.service
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const {
  EDITABLE_PLAN_STATUSES,
  EDITABLE_EXPENSE_STATUSES,
  TERMINAL_VISIT_STATUSES,
  TRAVEL_SUB_CATEGORIES,
  startOfDay,
  endOfDay,
  isAdminDept,
  isExpenseAddWindowOpen,
  isExpenseReceiptRequired,
} = require('./workPlanner.constants');

function userId(user) {
  return user?._id || user?.id;
}

/** Aggregate $match needs ObjectId; req.user ids are strings (see toReqUser). */
function asObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function parseCsvInts(value) {
  if (value == null || value === '') return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  return parts
    .map((part) => parseInt(String(part).trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/** Date-range (`from`/`to`) or year+month (`years`, `months` 1–12) match on a date field. */
function planDatePeriodMatch(query = {}, datePath = 'plan_date') {
  if (query.from || query.to) {
    const range = {};
    if (query.from) range.$gte = startOfDay(query.from);
    if (query.to) range.$lte = endOfDay(query.to);
    return { [datePath]: range };
  }

  if (query.years == null && query.months == null) return {};

  const years = parseCsvInts(query.years);
  const months = parseCsvInts(query.months);
  if (years.length === 0 || months.length === 0) {
    return { $expr: { $eq: [0, 1] } };
  }

  const clauses = [
    { $in: [{ $year: `$${datePath}` }, years] },
    { $in: [{ $month: `$${datePath}` }, months] },
  ];
  return { $expr: { $and: clauses } };
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

function assertCanEditVisits(plan, user) {
  const admin = isAdminDept(user);
  if (!isOwner(plan, user) && !admin) {
    throw new ApiError(403, 'Only the plan owner can edit this work plan');
  }
  if (admin) {
    if (plan.status === 'completed') {
      throw new ApiError(400, `Cannot edit a work plan in status "${plan.status}"`);
    }
    return;
  }
  // Sales owners may edit visits on draft, rejected, or approved plans.
  if (!['draft', 'rejected', 'approved'].includes(plan.status)) {
    throw new ApiError(400, `Cannot edit visits for a work plan in status "${plan.status}"`);
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

async function loadExpenses(planId) {
  const { WorkPlanExpense } = getModels();
  const rows = await WorkPlanExpense.find({ work_plan: planId, deletedAt: null })
    .populate('receipt_attachment')
    .populate('start_reading_image')
    .populate('end_reading_image')
    .populate('approved_by', 'name email')
    .populate('created_by', 'name email')
    .sort({ expense_date: 1, createdAt: 1 })
    .lean();
  return rows.map(toPlain);
}

function buildExpenseTotals(expenses) {
  let expense_total = 0;
  let expense_approved_total = 0;
  const visit_expense_totals = {};

  for (const exp of expenses) {
    const amount = Number(exp.amount) || 0;
    expense_total += amount;
    if (exp.status === 'approved') expense_approved_total += amount;
    const visitKey = exp.work_plan_visit
      ? String(exp.work_plan_visit._id || exp.work_plan_visit)
      : null;
    if (visitKey) {
      visit_expense_totals[visitKey] = (visit_expense_totals[visitKey] || 0) + amount;
    }
  }

  return { expense_total, expense_approved_total, visit_expense_totals };
}

async function getWithVisits(id) {
  const plan = await loadPlanOrThrow(id);
  const [visits, works, expenses] = await Promise.all([loadVisits(id), loadWorks(id), loadExpenses(id)]);
  const totals = buildExpenseTotals(expenses);
  return { ...toPlain(plan), visits, works, expenses, ...totals };
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

async function maybeCompleteWorkPlan(planId, user) {
  const { WorkPlan, WorkPlanWork } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan || plan.status !== 'approved') return;
  if (!['Work From Home', 'Work From Office'].includes(plan.plan_type)) return;

  const totalCount = await WorkPlanWork.countDocuments({ work_plan: planId, deletedAt: null });
  if (totalCount === 0) return;

  const pendingCount = await WorkPlanWork.countDocuments({
    work_plan: planId,
    deletedAt: null,
    status: { $nin: ['completed', 'cancelled'] },
  });
  if (pendingCount > 0) return;

  plan.status = 'completed';
  plan.updated_by = userId(user);
  await plan.save();
  await logActivity(user, planId, 'status_changed', 'Work plan marked completed (all work tasks finished)');
}

async function list(query = {}, user) {
  const { WorkPlan, WorkPlanVisit, WorkPlanWork } = getModels();
  const filter = { deletedAt: null };

  if (!isAdminDept(user)) {
    filter.sales_user = userId(user);
  } else if (query.sales_user) {
    filter.sales_user = query.sales_user;
  }

  if (query.status) filter.status = query.status;
  if (query.plan_type && query.plan_type !== 'all') {
    if (query.plan_type === 'Visits') {
      filter.$or = [
        { plan_type: 'Visits' },
        { plan_type: { $exists: false } },
        { plan_type: null },
        { plan_type: '' },
      ];
    } else {
      filter.plan_type = query.plan_type;
    }
  }

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
  const [visitCounts, workCounts] = await Promise.all([
    WorkPlanVisit.aggregate([
      { $match: { work_plan: { $in: planIds }, deletedAt: null } },
      { $group: { _id: '$work_plan', count: { $sum: 1 } } },
    ]),
    WorkPlanWork.aggregate([
      { $match: { work_plan: { $in: planIds }, deletedAt: null } },
      { $group: { _id: '$work_plan', count: { $sum: 1 } } },
    ]),
  ]);
  const countMap = new Map(visitCounts.map((c) => [String(c._id), c.count]));
  const workCountMap = new Map(workCounts.map((c) => [String(c._id), c.count]));

  const includeVisits =
    query.include_visits === '1' ||
    query.include_visits === 1 ||
    query.include_visits === true ||
    query.include_visits === 'true';
  const includeWorks =
    query.include_works === '1' ||
    query.include_works === 1 ||
    query.include_works === true ||
    query.include_works === 'true';

  const visitsByPlan = new Map();
  if (includeVisits && planIds.length) {
    const allVisits = await WorkPlanVisit.find({
      work_plan: { $in: planIds },
      deletedAt: null,
    })
      .populate(
        'party',
        'party_name mobile email contact_person contacts billing_address shipping_address',
      )
      .sort({ sequence: 1 })
      .lean();
    for (const visit of allVisits) {
      const key = String(visit.work_plan);
      if (!visitsByPlan.has(key)) visitsByPlan.set(key, []);
      visitsByPlan.get(key).push(toPlain(visit));
    }
  }

  const worksByPlan = new Map();
  if (includeWorks && planIds.length) {
    const allWorks = await WorkPlanWork.find({
      work_plan: { $in: planIds },
      deletedAt: null,
    })
      .sort({ sequence: 1 })
      .lean();
    for (const work of allWorks) {
      const key = String(work.work_plan);
      if (!worksByPlan.has(key)) worksByPlan.set(key, []);
      worksByPlan.get(key).push(toPlain(work));
    }
  }

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 0,
    data: rows.map((r) => {
      const id = String(r._id);
      const visits = includeVisits ? visitsByPlan.get(id) || [] : undefined;
      const works = includeWorks ? worksByPlan.get(id) || [] : undefined;
      return {
        ...toPlain(r),
        visit_count: countMap.get(id) || (visits ? visits.length : 0),
        work_count: workCountMap.get(id) || (works ? works.length : 0),
        ...(includeVisits ? { visits } : {}),
        ...(includeWorks ? { works } : {}),
      };
    }),
  };
}

async function get(id, user) {
  const plan = await loadPlanOrThrow(id);
  assertCanView(plan, user);
  const [visits, works, expenses] = await Promise.all([loadVisits(id), loadWorks(id), loadExpenses(id)]);
  const totals = buildExpenseTotals(expenses);
  return { ...toPlain(plan), visits, works, expenses, ...totals };
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
      location: body.location?.trim() || undefined,
      plan_type: body.plan_type?.trim() || 'Visits',
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
  if (body.location !== undefined) {
    plan.location =
      typeof body.location === 'string' ? body.location.trim() : body.location;
  }
  if (body.plan_type !== undefined) {
    plan.plan_type =
      typeof body.plan_type === 'string' ? body.plan_type.trim() : body.plan_type;
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
  const { WorkPlan, WorkPlanVisit, WorkPlanWork, WorkPlanExpense } = getModels();
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
  await WorkPlanWork.updateMany({ work_plan: id, deletedAt: null }, { $set: { deletedAt: now } });
  await WorkPlanExpense.updateMany({ work_plan: id, deletedAt: null }, { $set: { deletedAt: now } });

  await logActivity(user, plan._id, 'deleted', 'Work plan deleted');
  return toPlain(plan.toObject());
}

async function submit(id, user) {
  const { WorkPlan, WorkPlanVisit, WorkPlanWork } = getModels();
  const plan = await WorkPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  if (!isOwner(plan, user) && !isAdminDept(user)) {
    throw new ApiError(403, 'Only the plan owner can submit this work plan');
  }
  if (!EDITABLE_PLAN_STATUSES.includes(plan.status)) {
    throw new ApiError(400, `Cannot submit a work plan in status "${plan.status}"`);
  }

  const planType = plan.plan_type || 'Visits';
  if (planType === 'Visits') {
    const visitCount = await WorkPlanVisit.countDocuments({ work_plan: id, deletedAt: null });
    if (visitCount < 1) {
      throw new ApiError(400, 'Work plan cannot be submitted without at least one visit');
    }
  } else if (planType === 'Work From Home' || planType === 'Work From Office') {
    const workCount = await WorkPlanWork.countDocuments({ work_plan: id, deletedAt: null });
    if (workCount < 1) {
      throw new ApiError(400, 'Work plan cannot be submitted without at least one work task');
    }
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
  assertCanEditVisits(plan, user);

  const partyType = body.party_type || (body.party ? 'existing' : '');
  let partyDoc = null;
  if (partyType === 'existing') {
    partyDoc = await Party.findOne({ _id: body.party, deletedAt: null }).lean();
    if (!partyDoc) throw new ApiError(404, 'Party not found');
  }

  const maxSeq = await WorkPlanVisit.findOne({ work_plan: planId, deletedAt: null })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  const sequence = body.sequence ? Number(body.sequence) : (maxSeq?.sequence || 0) + 1;

  const partyName =
    body.party_name?.trim() ||
    partyDoc?.party_name ||
    undefined;

  const visit = await WorkPlanVisit.create({
    work_plan: planId,
    sequence,
    party_type: partyType,
    party: partyType === 'existing' ? body.party : undefined,
    party_name: partyName,
    contact_person: body.contact_person?.trim() || undefined,
    contact_number: body.contact_number?.trim() || undefined,
    contact_email: body.contact_email?.trim()?.toLowerCase() || undefined,
    contacts: body.contacts,
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

  assertCanEditVisits(plan, user);

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');

  const admin = isAdminDept(user);
  if (!admin && !['pending', 'rescheduled', 'checked_in'].includes(visit.status)) {
    throw new ApiError(400, `Cannot edit a visit in status "${visit.status}"`);
  }

  const nextPartyType =
    body.party_type !== undefined
      ? String(body.party_type)
      : visit.party_type || (visit.party ? 'existing' : 'new_party');

  if (body.party_type !== undefined) visit.party_type = nextPartyType;

  if (nextPartyType === 'existing') {
    const partyId = body.party !== undefined ? body.party : visit.party;
    if (!partyId) throw new ApiError(400, 'party is required for existing party visits');
    const partyDoc = await Party.findOne({ _id: partyId, deletedAt: null }).lean();
    if (!partyDoc) throw new ApiError(404, 'Party not found');
    visit.party = partyId;
    if (body.party_name === undefined && !visit.party_name) {
      visit.party_name = partyDoc.party_name;
    }
  } else {
    visit.party = undefined;
  }

  if (body.party_name !== undefined) visit.party_name = body.party_name?.trim() || undefined;
  if (body.contact_person !== undefined) visit.contact_person = body.contact_person?.trim() || undefined;
  if (body.contact_number !== undefined) visit.contact_number = body.contact_number?.trim() || undefined;
  if (body.contact_email !== undefined) {
    visit.contact_email = body.contact_email?.trim()?.toLowerCase() || undefined;
  }
  if (body.contacts !== undefined) visit.contacts = body.contacts;
  if (body.sequence !== undefined) visit.sequence = Number(body.sequence);
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
  assertCanEditVisits(plan, user);

  const visit = await WorkPlanVisit.findOne({ _id: visitId, work_plan: planId, deletedAt: null });
  if (!visit) throw new ApiError(404, 'Visit not found');

  const admin = isAdminDept(user);
  if (!admin && !['pending', 'rescheduled'].includes(visit.status)) {
    throw new ApiError(400, `Cannot delete a visit in status "${visit.status}"`);
  }

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
  visit.meeting_with_doctor = body.meeting_with_doctor;
  visit.meeting_with_purchase = body.meeting_with_purchase;
  visit.meeting_with_finance = body.meeting_with_finance;
  visit.meeting_with_engineer = body.meeting_with_engineer;
  visit.new_product_introduced = body.new_product_introduced;
  visit.order_received = body.order_received;
  if (!visit.actual_check_out) visit.actual_check_out = new Date();
  if (!visit.actual_check_in) visit.actual_check_in = visit.actual_check_out;
  await visit.save();

  await logActivity(user, planId, 'status_changed', `Visit ${visit.sequence} completed`);
  await maybeCompletePlan(planId, user);
  return getWithVisits(planId);
}

async function stats(query = {}, user) {
  const { WorkPlan, WorkPlanVisit, WorkPlanWork, WorkPlanExpense } = getModels();
  const filter = { deletedAt: null, status: { $ne: 'draft' } };

  if (!isAdminDept(user)) {
    filter.sales_user = userId(user);
  } else if (query.sales_user) {
    filter.sales_user = query.sales_user;
  }

  Object.assign(filter, planDatePeriodMatch(query));

  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const nestedPlanDateMatch = planDatePeriodMatch(query, 'plan.plan_date');

  // Mongoose casts string ids on find/count; aggregation $match does not.
  const salesUserOid = filter.sales_user ? asObjectId(filter.sales_user) : null;
  const salesUserMatch = salesUserOid ? { 'plan.sales_user': salesUserOid } : {};
  const planNotDraftMatch = { 'plan.status': { $ne: 'draft' } };
  const planAggMatch = {
    ...filter,
    ...(salesUserOid ? { sales_user: salesUserOid } : {}),
  };
  const todayFilter = {
    deletedAt: null,
    status: { $ne: 'draft' },
    plan_date: { $gte: today, $lte: todayEnd },
    ...(filter.sales_user ? { sales_user: filter.sales_user } : {}),
  };

  const [
    totalPlans,
    todayPlans,
    pendingApproval,
    approved,
    completed,
    rejected,
    statusGroups,
    visitAgg,
    workAgg,
    typeGroups,
    monthlyTrend,
    expenseAgg,
    expenseMonthlyTrend,
  ] = await Promise.all([
    WorkPlan.countDocuments(filter),
    WorkPlan.countDocuments(todayFilter),
    WorkPlan.countDocuments({ ...filter, status: 'submitted' }),
    WorkPlan.countDocuments({ ...filter, status: 'approved' }),
    WorkPlan.countDocuments({ ...filter, status: 'completed' }),
    WorkPlan.countDocuments({ ...filter, status: 'rejected' }),
    WorkPlan.aggregate([
      { $match: planAggMatch },
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
          ...nestedPlanDateMatch,
          ...planNotDraftMatch,
          ...salesUserMatch,
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
    WorkPlanWork.aggregate([
      {
        $lookup: {
          from: WorkPlan.collection.name,
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
          ...nestedPlanDateMatch,
          ...planNotDraftMatch,
          ...salesUserMatch,
        },
      },
      {
        $group: {
          _id: '$work_plan',
          work_count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          plans_with_works: { $sum: 1 },
          total_works: { $sum: '$work_count' },
        },
      },
    ]),
    WorkPlan.aggregate([
      { $match: planAggMatch },
      {
        $group: {
          _id: { $ifNull: ['$plan_type', 'Visits'] },
          count: { $sum: 1 },
        },
      },
    ]),
    WorkPlan.aggregate([
      { $match: planAggMatch },
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
    WorkPlanExpense.aggregate([
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
          ...nestedPlanDateMatch,
          ...planNotDraftMatch,
          ...salesUserMatch,
        },
      },
      {
        $group: {
          _id: null,
          expense_total: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0],
            },
          },
          expense_pending_approval: {
            $sum: {
              $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0],
            },
          },
          expense_approved_count: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, 1, 0],
            },
          },
        },
      },
    ]),
    WorkPlanExpense.aggregate([
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
          status: 'approved',
          'plan.deletedAt': null,
          ...nestedPlanDateMatch,
          ...planNotDraftMatch,
          ...salesUserMatch,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$expense_date' },
            month: { $month: '$expense_date' },
          },
          amount: { $sum: '$amount' },
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

  const workSummary = workAgg[0] || { plans_with_works: 0, total_works: 0 };
  const averageWorks =
    workSummary.plans_with_works > 0
      ? Math.round((workSummary.total_works / workSummary.plans_with_works) * 10) / 10
      : 0;

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g._id, g.count]));
  const byPlanType = Object.fromEntries(
    typeGroups.map((g) => [g._id || 'Visits', g.count])
  );
  const expenseSummary = expenseAgg[0] || {
    expense_total: 0,
    expense_pending_approval: 0,
    expense_approved_count: 0,
  };

  return {
    total_plans: totalPlans,
    today_plans: todayPlans,
    pending_approval: pendingApproval,
    approved,
    completed,
    rejected,
    average_visits: averageVisits,
    average_works: averageWorks,
    total_visits: visitSummary.total_visits || 0,
    total_works: workSummary.total_works || 0,
    by_status: byStatus,
    by_plan_type: byPlanType,
    monthly_trend: monthlyTrend.map((m) => ({
      year: m._id.year,
      month: m._id.month,
      count: m.count,
    })),
    expense_total: expenseSummary.expense_total || 0,
    expense_pending_approval: expenseSummary.expense_pending_approval || 0,
    expense_approved_count: expenseSummary.expense_approved_count || 0,
    expense_monthly_trend: expenseMonthlyTrend.map((m) => ({
      year: m._id.year,
      month: m._id.month,
      amount: m.amount,
      count: m.count,
    })),
  };
}

function assertCanManageExpense(plan, user) {
  if (!isOwner(plan, user) && !isAdminDept(user)) {
    throw new ApiError(403, 'Only the plan owner or admin can manage expenses');
  }
}

function assertCanEditExpense(expense, plan, user) {
  assertCanManageExpense(plan, user);
  const admin = isAdminDept(user);
  if (admin) {
    if (expense.status === 'approved') {
      throw new ApiError(400, 'Cannot edit an approved expense');
    }
    return;
  }
  if (!EDITABLE_EXPENSE_STATUSES.includes(expense.status)) {
    throw new ApiError(400, `Cannot edit an expense in status "${expense.status}"`);
  }
}

async function resolveExpenseVisit(planId, visitId) {
  if (!visitId) return null;
  const { WorkPlanVisit } = getModels();
  const visit = await WorkPlanVisit.findOne({
    _id: visitId,
    work_plan: planId,
    deletedAt: null,
  }).lean();
  if (!visit) throw new ApiError(400, 'work_plan_visit must belong to this work plan');
  return visit._id;
}

function applyExpenseFields(expense, body, { isCreate = false } = {}) {
  if (isCreate || body.expense_date !== undefined) {
    expense.expense_date = startOfDay(body.expense_date);
  }
  if (isCreate || body.category !== undefined) {
    expense.category = String(body.category).trim();
  }
  if (isCreate || body.category !== undefined || body.sub_category !== undefined) {
    if (expense.category === 'Travel') {
      const sub = String(body.sub_category || expense.sub_category || '').trim();
      if (!TRAVEL_SUB_CATEGORIES.includes(sub)) {
        throw new ApiError(
          400,
          `sub_category must be one of: ${TRAVEL_SUB_CATEGORIES.join(', ')} when category is Travel`,
        );
      }
      expense.sub_category = sub;
    } else {
      expense.sub_category = undefined;
    }
  }
  if (isCreate || body.amount !== undefined) {
    expense.amount = Number(body.amount);
  }
  if (isCreate || body.payment_mode !== undefined) {
    expense.payment_mode = String(body.payment_mode).trim();
  }
  if (body.vendor_name !== undefined) {
    expense.vendor_name =
      typeof body.vendor_name === 'string' ? body.vendor_name.trim() : body.vendor_name;
  }
  if (body.bill_number !== undefined) {
    expense.bill_number =
      typeof body.bill_number === 'string' ? body.bill_number.trim() : body.bill_number;
  }
  if (body.bill_date !== undefined) {
    expense.bill_date =
      body.bill_date === null || body.bill_date === ''
        ? undefined
        : startOfDay(body.bill_date);
  }
  if (body.description !== undefined) {
    expense.description =
      typeof body.description === 'string' ? body.description.trim() : body.description;
  }
  if (body.receipt_attachment !== undefined) {
    expense.receipt_attachment =
      body.receipt_attachment === null || body.receipt_attachment === ''
        ? null
        : body.receipt_attachment;
  }

  const isPrivateBike =
    expense.category === 'Travel' && expense.sub_category === 'Private Bike';

  if (isPrivateBike) {
    if (isCreate || body.start_reading !== undefined) {
      expense.start_reading = Number(body.start_reading);
    }
    if (isCreate || body.closing_reading !== undefined) {
      expense.closing_reading = Number(body.closing_reading);
    }
    if (body.start_reading_image !== undefined) {
      expense.start_reading_image =
        body.start_reading_image === null || body.start_reading_image === ''
          ? null
          : body.start_reading_image;
    }
    if (body.end_reading_image !== undefined) {
      expense.end_reading_image =
        body.end_reading_image === null || body.end_reading_image === ''
          ? null
          : body.end_reading_image;
    }
  } else if (
    isCreate ||
    body.category !== undefined ||
    body.sub_category !== undefined
  ) {
    expense.start_reading = undefined;
    expense.closing_reading = undefined;
    expense.start_reading_image = null;
    expense.end_reading_image = null;
  }
}

function assertPrivateBikeExpense(expense) {
  if (expense.category !== 'Travel' || expense.sub_category !== 'Private Bike') {
    return;
  }
  const start = Number(expense.start_reading);
  const closing = Number(expense.closing_reading);
  if (!Number.isFinite(start) || start < 0) {
    throw new ApiError(400, 'start_reading is required for Private Bike expenses');
  }
  if (!Number.isFinite(closing) || closing < 0) {
    throw new ApiError(400, 'closing_reading is required for Private Bike expenses');
  }
  if (closing < start) {
    throw new ApiError(400, 'closing_reading must be greater than or equal to start_reading');
  }
}

async function listAllExpenses(query = {}, user) {
  const { WorkPlan, WorkPlanExpense } = getModels();
  const planFilter = { deletedAt: null };

  if (!isAdminDept(user)) {
    planFilter.sales_user = userId(user);
  } else if (query.sales_user) {
    planFilter.sales_user = query.sales_user;
  }

  const planIds = await WorkPlan.find(planFilter).distinct('_id');

  const filter = {
    deletedAt: null,
    work_plan: { $in: planIds },
  };

  if (query.status) {
    // Admin review list never surfaces sales drafts.
    if (isAdminDept(user) && query.status === 'draft') {
      filter.status = { $in: [] };
    } else {
      filter.status = query.status;
    }
  } else if (isAdminDept(user)) {
    filter.status = { $ne: 'draft' };
  }

  if (query.from || query.to) {
    filter.expense_date = {};
    if (query.from) filter.expense_date.$gte = startOfDay(query.from);
    if (query.to) filter.expense_date.$lte = endOfDay(query.to);
  }

  const limit = Math.min(parseInt(query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    WorkPlanExpense.countDocuments(filter),
    WorkPlanExpense.find(filter)
      .populate({
        path: 'work_plan',
        select: 'plan_date sales_user location status',
        populate: { path: 'sales_user', select: 'name email department' },
      })
      .populate({
        path: 'work_plan_visit',
        select: 'sequence party_type party party_name contact_person',
        populate: { path: 'party', select: 'party_name' },
      })
      .populate('receipt_attachment')
      .populate('start_reading_image')
      .populate('end_reading_image')
      .populate('approved_by', 'name email')
      .populate('created_by', 'name email')
      .sort({ expense_date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 0,
    data: rows.map(toPlain),
  };
}

async function listExpenses(planId, user) {
  const plan = await loadPlanOrThrow(planId);
  assertCanView(plan, user);
  const expenses = await loadExpenses(planId);
  const totals = buildExpenseTotals(expenses);
  return { expenses, ...totals };
}

function assertSalesExpenseReceipt(expense, user) {
  return; // Document upload is optional
}

async function addExpense(planId, body, user) {
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanManageExpense(plan, user);

  if (!isAdminDept(user) && !isExpenseAddWindowOpen(plan.plan_date)) {
    throw new ApiError(
      400,
      'Expenses can only be added from the work plan day through the next 2 days (3 days total). Earlier or later entries are not allowed.',
    );
  }

  const visitId = await resolveExpenseVisit(planId, body.work_plan_visit || null);

  const expense = new WorkPlanExpense({
    work_plan: planId,
    work_plan_visit: visitId,
    status: 'draft',
    created_by: userId(user),
    updated_by: userId(user),
  });
  applyExpenseFields(expense, body, { isCreate: true });
  assertPrivateBikeExpense(expense);
  assertSalesExpenseReceipt(expense, user);
  await expense.save();

  await logActivity(
    user,
    planId,
    'created',
    `Expense created (${expense.category}, ${expense.amount})`,
  );
  return getWithVisits(planId);
}

async function updateExpense(planId, expenseId, body, user) {
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  const expense = await WorkPlanExpense.findOne({
    _id: expenseId,
    work_plan: planId,
    deletedAt: null,
  });
  if (!expense) throw new ApiError(404, 'Expense not found');
  assertCanEditExpense(expense, plan, user);

  if (body.work_plan_visit !== undefined) {
    expense.work_plan_visit = await resolveExpenseVisit(
      planId,
      body.work_plan_visit || null,
    );
  }
  applyExpenseFields(expense, body, { isCreate: false });

  if (expense.status === 'rejected') {
    expense.status = 'draft';
    expense.rejection_reason = undefined;
    expense.approved_by = undefined;
    expense.approved_at = undefined;
  }

  assertPrivateBikeExpense(expense);
  assertSalesExpenseReceipt(expense, user);
  expense.updated_by = userId(user);
  await expense.save();

  await logActivity(
    user,
    planId,
    'updated',
    `Expense updated (${expense.category}, ${expense.amount})`,
  );
  return getWithVisits(planId);
}

async function removeExpense(planId, expenseId, user) {
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  const expense = await WorkPlanExpense.findOne({
    _id: expenseId,
    work_plan: planId,
    deletedAt: null,
  });
  if (!expense) throw new ApiError(404, 'Expense not found');
  assertCanManageExpense(plan, user);

  if (!isAdminDept(user) && !EDITABLE_EXPENSE_STATUSES.includes(expense.status)) {
    throw new ApiError(400, 'Only draft or rejected expenses can be deleted');
  }
  if (isAdminDept(user) && expense.status === 'approved') {
    throw new ApiError(400, 'Cannot delete an approved expense');
  }

  expense.deletedAt = new Date();
  expense.updated_by = userId(user);
  await expense.save();

  await logActivity(user, planId, 'deleted', `Expense deleted (${expense.category}, ${expense.amount})`);
  return getWithVisits(planId);
}

async function submitExpense(planId, expenseId, user) {
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanManageExpense(plan, user);

  const expense = await WorkPlanExpense.findOne({
    _id: expenseId,
    work_plan: planId,
    deletedAt: null,
  });
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (!EDITABLE_EXPENSE_STATUSES.includes(expense.status)) {
    throw new ApiError(400, `Cannot submit an expense in status "${expense.status}"`);
  }

  expense.status = 'submitted';
  expense.rejection_reason = undefined;
  expense.updated_by = userId(user);
  await expense.save();

  await logActivity(
    user,
    planId,
    'submitted',
    `Expense submitted for approval (${expense.category}, ${expense.amount})`,
  );
  return getWithVisits(planId);
}

async function approveExpense(planId, expenseId, user) {
  if (!isAdminDept(user)) {
    throw new ApiError(403, 'Only admin can approve expenses');
  }
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  const expense = await WorkPlanExpense.findOne({
    _id: expenseId,
    work_plan: planId,
    deletedAt: null,
  });
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status !== 'submitted') {
    throw new ApiError(400, 'Only submitted expenses can be approved');
  }

  expense.status = 'approved';
  expense.approved_by = userId(user);
  expense.approved_at = new Date();
  expense.rejection_reason = undefined;
  expense.updated_by = userId(user);
  await expense.save();

  await logActivity(
    user,
    planId,
    'approved',
    `Expense approved (${expense.category}, ${expense.amount})`,
  );
  await notificationService.createForUser(plan.sales_user, {
    title: 'Expense approved',
    message: `Your expense of ${expense.amount} (${expense.category}) was approved.`,
    type: 'success',
    module: 'system',
    entity_type: 'work_plan',
    entity_id: plan._id,
  });

  return getWithVisits(planId);
}

async function rejectExpense(planId, expenseId, body, user) {
  if (!isAdminDept(user)) {
    throw new ApiError(403, 'Only admin can reject expenses');
  }
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  const expense = await WorkPlanExpense.findOne({
    _id: expenseId,
    work_plan: planId,
    deletedAt: null,
  });
  if (!expense) throw new ApiError(404, 'Expense not found');
  if (expense.status !== 'submitted') {
    throw new ApiError(400, 'Only submitted expenses can be rejected');
  }

  expense.status = 'rejected';
  expense.rejection_reason = body.rejection_reason.trim();
  expense.approved_by = userId(user);
  expense.approved_at = new Date();
  expense.updated_by = userId(user);
  await expense.save();

  await logActivity(
    user,
    planId,
    'rejected',
    `Expense rejected: ${expense.rejection_reason}`,
  );
  await notificationService.createForUser(plan.sales_user, {
    title: 'Expense rejected',
    message: `Your expense of ${expense.amount} (${expense.category}) was rejected. Reason: ${expense.rejection_reason}`,
    type: 'warning',
    module: 'system',
    entity_type: 'work_plan',
    entity_id: plan._id,
  });

  return getWithVisits(planId);
}

async function submitAllExpenses(planId, user) {
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanManageExpense(plan, user);

  const result = await WorkPlanExpense.updateMany(
    {
      work_plan: planId,
      deletedAt: null,
      status: { $in: [...EDITABLE_EXPENSE_STATUSES] },
    },
    {
      $set: {
        status: 'submitted',
        updated_by: userId(user),
      },
      $unset: { rejection_reason: 1 },
    },
  );

  const count = result.modifiedCount || result.nModified || 0;
  if (count < 1) {
    throw new ApiError(400, 'No draft or rejected expenses to submit');
  }

  await logActivity(
    user,
    planId,
    'submitted',
    `All day expenses submitted for approval (${count})`,
  );
  return getWithVisits(planId);
}

async function approveAllExpenses(planId, user) {
  if (!isAdminDept(user)) {
    throw new ApiError(403, 'Only admin can approve expenses');
  }
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  const now = new Date();
  const result = await WorkPlanExpense.updateMany(
    {
      work_plan: planId,
      deletedAt: null,
      status: 'submitted',
    },
    {
      $set: {
        status: 'approved',
        approved_by: userId(user),
        approved_at: now,
        updated_by: userId(user),
      },
      $unset: { rejection_reason: 1 },
    },
  );

  const count = result.modifiedCount || result.nModified || 0;
  if (count < 1) {
    throw new ApiError(400, 'No submitted expenses to approve');
  }

  await logActivity(
    user,
    planId,
    'approved',
    `All day expenses approved (${count})`,
  );
  await notificationService.createForUser(plan.sales_user, {
    title: 'Expenses approved',
    message: `${count} expense(s) on your work plan for ${plan.plan_date.toISOString().slice(0, 10)} were approved.`,
    type: 'success',
    module: 'system',
    entity_type: 'work_plan',
    entity_id: plan._id,
  });

  return getWithVisits(planId);
}

async function rejectAllExpenses(planId, body, user) {
  if (!isAdminDept(user)) {
    throw new ApiError(403, 'Only admin can reject expenses');
  }
  const { WorkPlan, WorkPlanExpense } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');

  const reason = body.rejection_reason.trim();
  const result = await WorkPlanExpense.updateMany(
    {
      work_plan: planId,
      deletedAt: null,
      status: 'submitted',
    },
    {
      $set: {
        status: 'rejected',
        rejection_reason: reason,
        approved_by: userId(user),
        approved_at: new Date(),
        updated_by: userId(user),
      },
    },
  );

  const count = result.modifiedCount || result.nModified || 0;
  if (count < 1) {
    throw new ApiError(400, 'No submitted expenses to reject');
  }

  await logActivity(
    user,
    planId,
    'rejected',
    `All day expenses rejected (${count}): ${reason}`,
  );
  await notificationService.createForUser(plan.sales_user, {
    title: 'Expenses rejected',
    message: `${count} expense(s) on your work plan for ${plan.plan_date.toISOString().slice(0, 10)} were rejected. Reason: ${reason}`,
    type: 'warning',
    module: 'system',
    entity_type: 'work_plan',
    entity_id: plan._id,
  });

  return getWithVisits(planId);
}

/**
 * From a completed visit, find-or-create the sales user's plan on `plan_date`
 * (copying location + sales user), then create a NEW pending visit (never move
 * or clone the completed visit's execution status).
 */
async function scheduleNextVisit(planId, visitId, body, user) {
  const { WorkPlan, WorkPlanVisit } = getModels();
  const sourcePlan = await loadPlanOrThrow(planId);
  assertCanView(sourcePlan, user);

  const sourceVisit = await WorkPlanVisit.findOne({
    _id: visitId,
    work_plan: planId,
    deletedAt: null,
  }).lean();
  if (!sourceVisit) throw new ApiError(404, 'Visit not found');
  if (sourceVisit.status !== 'completed') {
    throw new ApiError(400, 'Next visit can only be planned from a completed visit');
  }

  const salesUserId = sourcePlan.sales_user?._id || sourcePlan.sales_user;
  if (!isAdminDept(user) && !sameId(salesUserId, userId(user))) {
    throw new ApiError(403, 'Only the plan owner or admin can schedule the next visit');
  }

  const planDate = startOfDay(body.plan_date);
  const sourcePlanDate = startOfDay(sourcePlan.plan_date);
  if (planDate.getTime() === sourcePlanDate.getTime()) {
    throw new ApiError(400, 'Choose a different date than the current work plan');
  }

  let target = await WorkPlan.findOne({
    sales_user: salesUserId,
    plan_date: planDate,
    deletedAt: null,
  });

  let created = false;
  if (!target) {
    target = await WorkPlan.create({
      plan_date: planDate,
      sales_user: salesUserId,
      status: 'draft',
      location: sourcePlan.location || undefined,
      created_by: userId(user),
      updated_by: userId(user),
    });
    created = true;
    await logActivity(
      user,
      target._id,
      'created',
      `Draft work plan created for next visit on ${planDate.toISOString().slice(0, 10)}`,
    );
  } else if (target.status === 'completed') {
    target.status = 'draft';
    target.updated_by = userId(user);
    if (!target.location && sourcePlan.location) {
      target.location = sourcePlan.location;
    }
    await target.save();
  } else if (!target.location && sourcePlan.location) {
    target.location = sourcePlan.location;
    target.updated_by = userId(user);
    await target.save();
  }

  const maxSeq = await WorkPlanVisit.findOne({ work_plan: target._id, deletedAt: null })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  const sequence = (maxSeq?.sequence || 0) + 1;

  // Brand-new visit row — copy party/contact identity only; never execution/completion fields.
  const newVisit = await WorkPlanVisit.create({
    work_plan: target._id,
    sequence,
    party_type: sourceVisit.party_type || (sourceVisit.party ? 'existing' : 'new_party'),
    party: sourceVisit.party || undefined,
    party_name: sourceVisit.party_name || undefined,
    contact_person: sourceVisit.contact_person || undefined,
    contact_number: sourceVisit.contact_number || undefined,
    contact_email: sourceVisit.contact_email || undefined,
    purpose: sourceVisit.purpose || undefined,
    notes: sourceVisit.notes || undefined,
    status: 'pending',
    actual_check_in: null,
    actual_check_out: null,
    outcome: null,
    next_followup_date: null,
  });

  // Belt-and-suspenders: completed source must never leak onto the new row.
  if (newVisit.status !== 'pending') {
    newVisit.status = 'pending';
    newVisit.actual_check_in = undefined;
    newVisit.actual_check_out = undefined;
    newVisit.outcome = undefined;
    newVisit.next_followup_date = undefined;
    await newVisit.save();
  }

  await renumberVisits(target._id);
  await logActivity(
    user,
    target._id,
    'updated',
    `New pending visit created from plan ${planId} visit ${visitId}`,
  );

  const result = await getWithVisits(target._id);
  return {
    ...result,
    _meta: {
      created,
      reused: !created,
      new_visit_id: String(newVisit._id),
      new_visit_status: 'pending',
    },
  };
}

async function loadWorks(planId) {
  const { WorkPlanWork } = getModels();
  const rows = await WorkPlanWork.find({ work_plan: planId, deletedAt: null })
    .sort({ sequence: 1 })
    .lean();
  return rows.map(toPlain);
}

async function renumberWorks(planId) {
  const { WorkPlanWork } = getModels();
  const works = await WorkPlanWork.find({ work_plan: planId, deletedAt: null })
    .sort({ sequence: 1 })
    .lean();
  for (let i = 0; i < works.length; i += 1) {
    await WorkPlanWork.updateOne(
      { _id: works[i]._id },
      { $set: { sequence: i + 1 } }
    );
  }
}

async function addWork(planId, body, user) {
  const { WorkPlan, WorkPlanWork } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanEditVisits(plan, user);

  const maxSeq = await WorkPlanWork.findOne({ work_plan: planId, deletedAt: null })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  const sequence = body.sequence ? Number(body.sequence) : (maxSeq?.sequence || 0) + 1;

  await WorkPlanWork.create({
    work_plan: planId,
    sequence,
    title: body.title.trim(),
    description: body.description?.trim() || undefined,
    planned_start_time: body.planned_start_time ? new Date(body.planned_start_time) : undefined,
    planned_end_time: body.planned_end_time ? new Date(body.planned_end_time) : undefined,
    status: body.status || 'pending',
  });

  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.submitted_at = undefined;
    plan.updated_by = userId(user);
    await plan.save();
  }

  await renumberWorks(planId);
  await logActivity(user, planId, 'updated', `Work task added (sequence ${sequence})`);
  return getWithVisits(planId);
}

async function updateWork(planId, workId, body, user) {
  const { WorkPlan, WorkPlanWork } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanEditVisits(plan, user);

  const work = await WorkPlanWork.findOne({ _id: workId, work_plan: planId, deletedAt: null });
  if (!work) throw new ApiError(404, 'Work task not found');

  if (body.title !== undefined) work.title = body.title.trim();
  if (body.description !== undefined) work.description = body.description?.trim() || undefined;
  if (body.planned_start_time !== undefined) {
    work.planned_start_time = body.planned_start_time ? new Date(body.planned_start_time) : undefined;
  }
  if (body.planned_end_time !== undefined) {
    work.planned_end_time = body.planned_end_time ? new Date(body.planned_end_time) : undefined;
  }
  if (body.status !== undefined) work.status = body.status;
  if (body.completion_remarks !== undefined) {
    work.completion_remarks = body.completion_remarks?.trim() || undefined;
  }
  if (body.sequence !== undefined) work.sequence = Number(body.sequence);

  await work.save();

  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.submitted_at = undefined;
    plan.updated_by = userId(user);
    await plan.save();
  }

  await renumberWorks(planId);
  await logActivity(user, planId, 'updated', `Work task updated (sequence ${work.sequence})`);
  await maybeCompleteWorkPlan(planId, user);
  return getWithVisits(planId);
}

async function removeWork(planId, workId, user) {
  const { WorkPlan, WorkPlanWork } = getModels();
  const plan = await WorkPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw new ApiError(404, 'Work plan not found');
  assertCanEditVisits(plan, user);

  const work = await WorkPlanWork.findOne({ _id: workId, work_plan: planId, deletedAt: null });
  if (!work) throw new ApiError(404, 'Work task not found');

  work.deletedAt = new Date();
  await work.save();

  if (plan.status === 'rejected') {
    plan.status = 'draft';
    plan.rejection_reason = undefined;
    plan.submitted_at = undefined;
    plan.updated_by = userId(user);
    await plan.save();
  }

  await renumberWorks(planId);
  await logActivity(user, planId, 'updated', `Work task removed (ID: ${workId})`);
  return getWithVisits(planId);
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
  scheduleNextVisit,
  listAllExpenses,
  listExpenses,
  addExpense,
  updateExpense,
  removeExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  submitAllExpenses,
  approveAllExpenses,
  rejectAllExpenses,
  stats,
  loadWorks,
  addWork,
  updateWork,
  removeWork,
};
