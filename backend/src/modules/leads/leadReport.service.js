const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { isLeadManager } = require('./lead.service');

/**
 * Get dashboard KPI counters for leads.
 */
async function getDashboardStats(query = {}, user) {
  const { Lead } = getModels();
  const q = { deletedAt: null };

  const canManageAll = isLeadManager(user);

  if (!canManageAll) {
    const userObjectId = (user && user._id && mongoose.Types.ObjectId.isValid(user._id))
      ? new mongoose.Types.ObjectId(user._id)
      : null;

    q.$or = [
      { assigned_to: userObjectId || user._id },
      { assigned_to: String(user._id) },
      { created_by: userObjectId || user._id },
      { created_by: String(user._id) },
    ];
  } else if (query.assigned_to && query.assigned_to !== 'all') {
    const assignedObjId = mongoose.Types.ObjectId.isValid(query.assigned_to)
      ? new mongoose.Types.ObjectId(query.assigned_to)
      : query.assigned_to;
    q.$or = [{ assigned_to: assignedObjId }, { assigned_to: String(query.assigned_to) }];
  }

  // Period / Date filter
  if (query.from || query.to) {
    q.createdAt = {};
    if (query.from) q.createdAt.$gte = new Date(`${query.from}T00:00:00.000Z`);
    if (query.to) q.createdAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
  } else if (query.startDate || query.endDate || query.start_date || query.end_date) {
    const s = query.startDate || query.start_date;
    const e = query.endDate || query.end_date;
    q.createdAt = {};
    if (s) q.createdAt.$gte = new Date(s);
    if (e) q.createdAt.$lte = new Date(e);
  } else if (query.years) {
    const yearList = String(query.years).split(',').map(Number).filter(Boolean);
    if (yearList.length > 0) {
      const monthList = query.months
        ? String(query.months).split(',').map(Number).filter(Boolean)
        : [];
      if (yearList.length === 1 && monthList.length > 0) {
        const yr = yearList[0];
        const minMonth = Math.min(...monthList) - 1;
        const maxMonth = Math.max(...monthList);
        q.createdAt = {
          $gte: new Date(Date.UTC(yr, minMonth, 1, 0, 0, 0, 0)),
          $lt: new Date(Date.UTC(yr, maxMonth, 1, 0, 0, 0, 0)),
        };
      } else {
        const minYr = Math.min(...yearList);
        const maxYr = Math.max(...yearList);
        q.createdAt = {
          $gte: new Date(Date.UTC(minYr, 0, 1, 0, 0, 0, 0)),
          $lt: new Date(Date.UTC(maxYr + 1, 0, 1, 0, 0, 0, 0)),
        };
      }
    }
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Query all matching leads once to compute counts, values, and quantities with 100% precision
  const allLeads = await Lead.find(q)
    .select('status estimated_value products.quantity next_follow_up_at')
    .lean();

  let totalLeads = allLeads.length;
  let newLeads = 0;
  let assignedLeads = 0;
  let contactedLeads = 0;
  let qualifiedLeads = 0;
  let quotationLeads = 0;
  let negotiationLeads = 0;
  let wonLeads = 0;
  let lostLeads = 0;
  let convertedLeads = 0;
  let followUpsToday = 0;
  let overdueFollowUps = 0;
  let totalPipelineValue = 0;
  let totalWonValue = 0;
  let totalPipelineQuantity = 0;
  let totalWonQuantity = 0;

  for (const lead of allLeads) {
    const st = lead.status;
    const estVal = Number(lead.estimated_value) || 0;
    const leadQty = Array.isArray(lead.products)
      ? lead.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
      : 0;

    if (st === 'new') newLeads++;
    else if (st === 'assigned') assignedLeads++;
    else if (st === 'contacted') contactedLeads++;
    else if (st === 'qualified') qualifiedLeads++;
    else if (st === 'quotation') quotationLeads++;
    else if (st === 'negotiation') negotiationLeads++;
    else if (st === 'won') wonLeads++;
    else if (st === 'lost') lostLeads++;
    else if (st === 'converted') convertedLeads++;

    if (lead.next_follow_up_at) {
      const followUpDate = new Date(lead.next_follow_up_at);
      if (followUpDate >= startOfToday && followUpDate <= endOfToday) {
        followUpsToday++;
      } else if (followUpDate < startOfToday && !['won', 'lost', 'converted'].includes(st)) {
        overdueFollowUps++;
      }
    }

    if (['new', 'assigned', 'contacted', 'qualified', 'follow_up', 'quotation', 'negotiation'].includes(st)) {
      totalPipelineValue += estVal;
      totalPipelineQuantity += leadQty;
    } else if (['won', 'converted'].includes(st)) {
      totalWonValue += estVal;
      totalWonQuantity += leadQty;
    }
  }

  return {
    totalLeads,
    newLeads,
    assignedLeads,
    contactedLeads,
    qualifiedLeads,
    quotationLeads,
    negotiationLeads,
    wonLeads,
    lostLeads,
    convertedLeads,
    followUpsToday,
    overdueFollowUps,
    totalPipelineValue,
    totalWonValue,
    totalPipelineQuantity,
    totalWonQuantity,
  };
}

/**
 * Get sales funnel metrics.
 */
async function getSalesFunnel(query = {}, user) {
  const { Lead } = getModels();
  const q = { deletedAt: null };

  const canManageAll = isLeadManager(user);

  if (!canManageAll) {
    const userObjectId = (user && user._id && mongoose.Types.ObjectId.isValid(user._id))
      ? new mongoose.Types.ObjectId(user._id)
      : null;

    q.$or = [
      { assigned_to: userObjectId || user._id },
      { assigned_to: String(user._id) },
      { created_by: userObjectId || user._id },
      { created_by: String(user._id) },
    ];
  } else if (query.assigned_to && query.assigned_to !== 'all') {
    const assignedObjId = mongoose.Types.ObjectId.isValid(query.assigned_to)
      ? new mongoose.Types.ObjectId(query.assigned_to)
      : query.assigned_to;
    q.$or = [{ assigned_to: assignedObjId }, { assigned_to: String(query.assigned_to) }];
  }

  const leads = await Lead.find(q).select('status estimated_value products.quantity').lean();
  const total = leads.length || 1;

  const stageDefs = [
    { key: 'new', label: 'New', statuses: ['new', 'assigned'] },
    { key: 'contacted', label: 'Contacted', statuses: ['contacted', 'follow_up'] },
    { key: 'qualified', label: 'Qualified', statuses: ['qualified'] },
    { key: 'quotation', label: 'Quotation', statuses: ['quotation'] },
    { key: 'negotiation', label: 'Negotiation', statuses: ['negotiation'] },
    { key: 'won', label: 'Won / Converted', statuses: ['won', 'converted'] },
  ];

  const stages = stageDefs.map((def) => {
    const matching = leads.filter((l) => def.statuses.includes(l.status));
    const count = matching.length;
    const estimatedValue = matching.reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);
    const quantity = matching.reduce(
      (sum, l) =>
        sum +
        (Array.isArray(l.products)
          ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
          : 0),
      0
    );
    const percentage = total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

    return {
      key: def.key,
      label: def.label,
      count,
      quantity,
      estimated_value: estimatedValue,
      percentage,
    };
  });

  return {
    total_leads: leads.length,
    stages,
  };
}

/**
 * Get sales performance breakdown by Sales Executive.
 */
async function getSalesPerformance(query = {}, user) {
  const { Lead, LeadFollowUp, User } = getModels();

  if (!isLeadManager(user)) {
    query.assigned_to = String(user._id);
  }

  const matchQ = { deletedAt: null };
  if (query.assigned_to && query.assigned_to !== 'all') {
    matchQ.assigned_to = new mongoose.Types.ObjectId(query.assigned_to);
  }

  const userFilter = {
    department: 'sales',
    is_active: true,
  };
  if (!isLeadManager(user)) {
    userFilter._id = user._id;
  }

  const salesUsers = await User.find(userFilter)
    .select('name email')
    .lean();

  const leads = await Lead.find(matchQ)
    .select('assigned_to status estimated_value next_follow_up_at products')
    .lean();

  const followUps = await LeadFollowUp.find({ deletedAt: null })
    .select('created_by status follow_up_date')
    .lean();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const performance = salesUsers.map((su) => {
    const uidStr = String(su._id);
    const userLeads = leads.filter((l) => l.assigned_to && String(l.assigned_to) === uidStr);
    const totalLeads = userLeads.length;

    const qualifiedLeads = userLeads.filter((l) =>
      ['qualified', 'quotation', 'negotiation', 'won', 'converted'].includes(l.status)
    ).length;

    const quotations = userLeads.filter((l) => l.status === 'quotation').length;
    const wonLeads = userLeads.filter((l) => ['won', 'converted'].includes(l.status)).length;
    const lostLeads = userLeads.filter((l) => l.status === 'lost').length;

    const conversionRate = totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(1)) : 0;

    const pipelineQty = userLeads
      .filter((l) =>
        ['new', 'assigned', 'contacted', 'qualified', 'follow_up', 'quotation', 'negotiation'].includes(
          l.status
        )
      )
      .reduce(
        (sum, l) =>
          sum +
          (Array.isArray(l.products)
            ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
            : 0),
        0
      );

    const wonQty = userLeads
      .filter((l) => ['won', 'converted'].includes(l.status))
      .reduce(
        (sum, l) =>
          sum +
          (Array.isArray(l.products)
            ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
            : 0),
        0
      );

    const lostQty = userLeads
      .filter((l) => l.status === 'lost')
      .reduce(
        (sum, l) =>
          sum +
          (Array.isArray(l.products)
            ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
            : 0),
        0
      );

    const pipelineValue = userLeads
      .filter((l) =>
        ['new', 'assigned', 'contacted', 'qualified', 'follow_up', 'quotation', 'negotiation'].includes(
          l.status
        )
      )
      .reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);

    const wonValue = userLeads
      .filter((l) => ['won', 'converted'].includes(l.status))
      .reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);

    const avgLeadValue = totalLeads > 0 ? Math.round((pipelineValue + wonValue) / totalLeads) : 0;

    const userFollowUps = followUps.filter((f) => String(f.created_by) === uidStr);
    const completedFollowups = userFollowUps.filter((f) => f.status === 'completed').length;
    const overdueFollowups = userLeads.filter(
      (l) =>
        l.next_follow_up_at &&
        new Date(l.next_follow_up_at) < startOfToday &&
        !['won', 'lost', 'converted'].includes(l.status)
    ).length;

    return {
      user_id: su._id,
      name: su.name,
      email: su.email,
      total_leads: totalLeads,
      qualified_leads: qualifiedLeads,
      quotations,
      won_leads: wonLeads,
      lost_leads: lostLeads,
      conversion_rate: conversionRate,
      pipeline_qty: pipelineQty,
      pipeline_quantity: pipelineQty,
      won_qty: wonQty,
      won_quantity: wonQty,
      lost_qty: lostQty,
      lost_quantity: lostQty,
      pipeline_value: pipelineValue,
      won_value: wonValue,
      avg_lead_value: avgLeadValue,
      completed_followups: completedFollowups,
      overdue_followups: overdueFollowups,
    };
  });

  return performance;
}

/**
 * Get lead performance breakdown by Lead Source.
 */
async function getSourcePerformance(query = {}, user) {
  const { Lead, LeadSource } = getModels();
  const q = { deletedAt: null };

  if (!isLeadManager(user)) {
    q.assigned_to = user._id;
  }

  const [leads, sources] = await Promise.all([
    Lead.find(q).select('source status estimated_value products').lean(),
    LeadSource.find({ deletedAt: null, is_active: true }).select('name').lean(),
  ]);

  const sourceMap = new Map();
  sources.forEach((s) => sourceMap.set(s.name, s.name));

  // Also include any ad-hoc sources already present in leads
  leads.forEach((l) => {
    if (l.source && !sourceMap.has(l.source)) {
      sourceMap.set(l.source, l.source);
    }
  });

  const report = Array.from(sourceMap.values()).map((srcName) => {
    const srcLeads = leads.filter((l) => l.source === srcName);
    const totalLeads = srcLeads.length;

    const qualifiedLeads = srcLeads.filter((l) =>
      ['qualified', 'quotation', 'negotiation', 'won', 'converted'].includes(l.status)
    ).length;

    const wonLeads = srcLeads.filter((l) => ['won', 'converted'].includes(l.status)).length;
    const lostLeads = srcLeads.filter((l) => l.status === 'lost').length;

    const conversionRate = totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(1)) : 0;

    const pipelineQty = srcLeads
      .filter((l) =>
        ['new', 'assigned', 'contacted', 'qualified', 'follow_up', 'quotation', 'negotiation'].includes(
          l.status
        )
      )
      .reduce(
        (sum, l) =>
          sum +
          (Array.isArray(l.products)
            ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
            : 0),
        0
      );

    const wonQty = srcLeads
      .filter((l) => ['won', 'converted'].includes(l.status))
      .reduce(
        (sum, l) =>
          sum +
          (Array.isArray(l.products)
            ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
            : 0),
        0
      );

    const lostQty = srcLeads
      .filter((l) => l.status === 'lost')
      .reduce(
        (sum, l) =>
          sum +
          (Array.isArray(l.products)
            ? l.products.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0)
            : 0),
        0
      );

    const pipelineValue = srcLeads
      .filter((l) =>
        ['new', 'assigned', 'contacted', 'qualified', 'follow_up', 'quotation', 'negotiation'].includes(
          l.status
        )
      )
      .reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);

    const wonValue = srcLeads
      .filter((l) => ['won', 'converted'].includes(l.status))
      .reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0);

    return {
      source: srcName,
      total_leads: totalLeads,
      qualified_leads: qualifiedLeads,
      won_leads: wonLeads,
      lost_leads: lostLeads,
      conversion_rate: conversionRate,
      pipeline_qty: pipelineQty,
      pipeline_quantity: pipelineQty,
      won_qty: wonQty,
      won_quantity: wonQty,
      lost_qty: lostQty,
      lost_quantity: lostQty,
      pipeline_value: pipelineValue,
      won_value: wonValue,
    };
  });

  // Sort by highest total leads
  report.sort((a, b) => b.total_leads - a.total_leads);

  return report;
}

module.exports = {
  getDashboardStats,
  getSalesFunnel,
  getSalesPerformance,
  getSourcePerformance,
};
