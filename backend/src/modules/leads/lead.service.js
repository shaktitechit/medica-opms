/**
 * @fileoverview Lead Management: business rules, transactions and persistence helpers.
 * @module modules/leads/lead.service
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { generateLeadNo } = require('../../utils/generateLeadNo');
const { generateOrderNo } = require('../../utils/generateOrderNo');
const {
  restoreSoftDeletedById,
  softDeleteActiveById,
  listDeletedLean,
} = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const notificationService = require('../notifications/notification.service');
const { ALLOWED_STATUS_TRANSITIONS } = require('./lead.constants');

const LEAD_POPULATE = [
  { path: 'assigned_to', select: 'name email phone department' },
  { path: 'assigned_by', select: 'name email department' },
  { path: 'created_by', select: 'name email department' },
  { path: 'updated_by', select: 'name email department' },
  { path: 'party_id', select: 'party_name mobile email district state billing_address' },
  { path: 'source_id', select: 'name code' },
  { path: 'lost_info.lost_reason_id', select: 'name code' },
  { path: 'conversion.party_id', select: 'party_name mobile email' },
  { path: 'conversion.order_id', select: 'order_no grand_total status lifecycle_status' },
  { path: 'products.product', select: 'product_name sku base_price unit' },
];

/**
 * Checks whether user has permission to manage all leads or is restricted to their assigned leads.
 */
function isLeadManager(user) {
  if (!user) return false;
  const codes = new Set(user.permissionCodes || []);
  return (
    codes.has('*') ||
    codes.has('leads:manage') ||
    user.department === 'admin' ||
    user.department === 'super_admin'
  );
}

/**
 * Duplicate check across existing active Leads and Parties.
 */
async function checkDuplicates({ phone, email, company_name } = {}) {
  const { Lead, Party } = getModels();
  const phoneClean = phone ? String(phone).trim() : '';
  const emailClean = email ? String(email).trim().toLowerCase() : '';
  const companyClean = company_name ? String(company_name).trim() : '';

  const leadOrConditions = [];
  const partyOrConditions = [];

  if (phoneClean) {
    leadOrConditions.push({ phone: phoneClean }, { 'contacts.phone': phoneClean });
    partyOrConditions.push({ mobile: phoneClean }, { 'contacts.phone': phoneClean });
  }
  if (emailClean) {
    leadOrConditions.push({ email: emailClean }, { 'contacts.email': emailClean });
    partyOrConditions.push({ email: emailClean }, { 'contacts.email': emailClean });
  }
  if (companyClean) {
    leadOrConditions.push({
      company_name: { $regex: new RegExp(`^${companyClean}$`, 'i') },
    });
    partyOrConditions.push({
      party_name: { $regex: new RegExp(`^${companyClean}$`, 'i') },
    });
  }

  let matchingLeads = [];
  let matchingParties = [];

  if (leadOrConditions.length > 0) {
    matchingLeads = await Lead.find({
      deletedAt: null,
      $or: leadOrConditions,
    })
      .select('lead_no name company_name phone email status priority assigned_to')
      .populate('assigned_to', 'name email')
      .limit(10)
      .lean();
  }

  if (partyOrConditions.length > 0) {
    matchingParties = await Party.find({
      deletedAt: null,
      $or: partyOrConditions,
    })
      .select('party_name party_type mobile email district state gst_no')
      .limit(10)
      .lean();
  }

  const hasDuplicates = matchingLeads.length > 0 || matchingParties.length > 0;

  return {
    has_duplicates: hasDuplicates,
    matching_leads: matchingLeads.map(toPlain),
    matching_parties: matchingParties.map(toPlain),
  };
}

/**
 * List leads with server-side pagination, filters and sorting.
 */
async function list(query = {}, user) {
  const { Lead } = getModels();
  const andConditions = [{ deletedAt: null }];

  const canManageAll = isLeadManager(user);

  // Scoping for sales users vs managers
  if (!canManageAll) {
    const userObjectId = mongoose.Types.ObjectId.isValid(user._id)
      ? new mongoose.Types.ObjectId(user._id)
      : user._id;

    if (query.scope === 'unassigned') {
      andConditions.push({ assigned_to: null });
    } else {
      andConditions.push({
        $or: [
          { assigned_to: userObjectId },
          { assigned_to: String(user._id) },
          { created_by: userObjectId },
          { created_by: String(user._id) },
        ],
      });
    }
  } else if (query.assigned_to) {
    if (query.assigned_to === 'unassigned') {
      andConditions.push({ assigned_to: null });
    } else {
      const assignedObjId = mongoose.Types.ObjectId.isValid(query.assigned_to)
        ? new mongoose.Types.ObjectId(query.assigned_to)
        : query.assigned_to;
      andConditions.push({
        $or: [{ assigned_to: assignedObjId }, { assigned_to: String(query.assigned_to) }],
      });
    }
  }

  if (query.status && query.status !== 'all') {
    if (query.status.includes(',')) {
      andConditions.push({ status: { $in: query.status.split(',').map((s) => s.trim()) } });
    } else {
      andConditions.push({ status: query.status });
    }
  }

  if (query.priority && query.priority !== 'all') {
    andConditions.push({ priority: query.priority });
  }

  if (query.source && query.source !== 'all') {
    andConditions.push({ source: query.source });
  }

  if (query.city) {
    andConditions.push({ 'billing_address.city': { $regex: String(query.city).trim(), $options: 'i' } });
  }

  if (query.state) {
    andConditions.push({ 'billing_address.state': { $regex: String(query.state).trim(), $options: 'i' } });
  }

  if (query.min_value !== undefined && query.min_value !== '') {
    andConditions.push({ estimated_value: { $gte: Number(query.min_value) } });
  }

  if (query.max_value !== undefined && query.max_value !== '') {
    andConditions.push({ estimated_value: { $lte: Number(query.max_value) } });
  }

  if (query.from_date || query.to_date) {
    const dateRange = {};
    if (query.from_date) {
      const from = new Date(query.from_date);
      from.setHours(0, 0, 0, 0);
      dateRange.$gte = from;
    }
    if (query.to_date) {
      const to = new Date(query.to_date);
      to.setHours(23, 59, 59, 999);
      dateRange.$lte = to;
    }
    andConditions.push({ createdAt: dateRange });
  }

  if (query.follow_up_filter) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (query.follow_up_filter === 'today') {
      andConditions.push({ next_follow_up_at: { $gte: startOfToday, $lte: endOfToday } });
    } else if (query.follow_up_filter === 'overdue') {
      andConditions.push({
        next_follow_up_at: { $lt: startOfToday },
        status: { $nin: ['won', 'lost', 'converted'] },
      });
    } else if (query.follow_up_filter === 'upcoming') {
      andConditions.push({ next_follow_up_at: { $gt: endOfToday } });
    }
  }

  if (query.search) {
    const rx = new RegExp(String(query.search).trim(), 'i');
    andConditions.push({
      $or: [
        { lead_no: rx },
        { name: rx },
        { company_name: rx },
        { phone: rx },
        { email: rx },
        { requirement: rx },
      ],
    });
  }

  const q = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

  const paginate = query.paginate !== 'false';
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = paginate ? Math.min(500, Math.max(1, parseInt(query.limit || '20', 10))) : 0;
  const skip = (page - 1) * limit;

  let sort = { createdAt: -1 };
  if (query.sortBy) {
    const order = query.sortOrder === 'asc' ? 1 : -1;
    sort = { [query.sortBy]: order };
  }

  if (!paginate) {
    const items = await Lead.find(q).populate(LEAD_POPULATE).sort(sort).lean();
    return {
      items: items.map(toPlain),
      total: items.length,
      page: 1,
      limit: items.length,
      totalPages: 1,
    };
  }

  const [items, total] = await Promise.all([
    Lead.find(q).populate(LEAD_POPULATE).sort(sort).skip(skip).limit(limit).lean(),
    Lead.countDocuments(q),
  ]);

  return {
    items: items.map(toPlain),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get single lead by ID with populated references.
 */
async function get(id, user) {
  const { Lead } = getModels();
  const row = await Lead.findOne({ _id: id, deletedAt: null }).populate(LEAD_POPULATE).lean();
  if (!row) throw new ApiError(404, 'Lead not found');

  if (!isLeadManager(user)) {
    const assignedId = row.assigned_to?._id ? String(row.assigned_to._id) : (row.assigned_to ? String(row.assigned_to) : null);
    const createdById = row.created_by?._id ? String(row.created_by._id) : (row.created_by ? String(row.created_by) : null);
    if (assignedId && assignedId !== String(user._id) && createdById !== String(user._id)) {
      throw new ApiError(403, 'You do not have permission to view this lead');
    }
  }

  return toPlain(row);
}

/**
 * Create a new lead.
 */
async function create(body, user) {
  const { Lead } = getModels();

  const assigned_to = isLeadManager(user)
    ? (body.assigned_to || undefined)
    : user._id;
  const status = body.status || (assigned_to ? 'assigned' : 'new');
  const assigned_at = assigned_to ? new Date() : undefined;
  const assigned_by = assigned_to ? user._id : undefined;

  let doc = null;
  let attempts = 0;
  while (!doc && attempts < 5) {
    attempts++;
    const lead_no = await generateLeadNo(new Date());
    try {
      doc = await Lead.create({
        company_id: body.company_id || user.company_id,
        lead_no,
        name: String(body.name).trim(),
        company_name: body.company_name ? String(body.company_name).trim() : '',
        email: body.email ? String(body.email).trim().toLowerCase() : '',
        phone: body.phone ? String(body.phone).trim() : '',
        alternate_phone: body.alternate_phone ? String(body.alternate_phone).trim() : '',
        contacts: Array.isArray(body.contacts) ? body.contacts : [],
        industry: body.industry ? String(body.industry).trim() : '',
        designation: body.designation ? String(body.designation).trim() : '',
        billing_address: body.billing_address || {},
        requirement: body.requirement ? String(body.requirement).trim() : '',
        estimated_value: Number(body.estimated_value || 0),
        expected_closing_date: body.expected_closing_date ? new Date(body.expected_closing_date) : undefined,
        source: String(body.source).trim(),
        source_id: body.source_id || undefined,
        status,
        priority: body.priority || 'medium',
        assigned_to,
        assigned_by,
        assigned_at,
        party_id: body.party_id || undefined,
        contact_person_id: body.contact_person_id || undefined,
        products: Array.isArray(body.products) ? body.products : [],
        notes: body.notes ? String(body.notes).trim() : '',
        tags: Array.isArray(body.tags) ? body.tags : [],
        qualification: body.qualification || undefined,
        created_by: user._id,
        updated_by: user._id,
        last_activity_at: new Date(),
      });
    } catch (err) {
      if (err.code === 11000 && attempts < 5) {
        continue;
      }
      throw err;
    }
  }

  const plain = toPlain(doc.toObject());

  // Log activity
  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: plain._id,
    action: 'created',
    message: `Lead #${plain.lead_no} (${plain.name}) created`,
    new_value: plain,
  });

  // Notify assigned sales user if assigned immediately
  if (plain.assigned_to && String(plain.assigned_to) !== String(user._id)) {
    await notificationService.createForUser(plain.assigned_to, {
      title: 'New Lead Assigned',
      message: `You have been assigned Lead #${plain.lead_no} (${plain.name} - ${plain.company_name || 'Individual'})`,
      type: 'info',
      module: 'lead',
      entity_type: 'lead',
      entity_id: plain._id,
    });
  }

  return plain;
}

/**
 * Update lead details.
 */
async function update(id, body, user) {
  const { Lead } = getModels();
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (!isLeadManager(user)) {
    if (['won', 'lost', 'converted'].includes(lead.status)) {
      throw new ApiError(400, 'Cannot edit a closed (won/lost/converted) lead');
    }
    const assignedId = lead.assigned_to ? String(lead.assigned_to) : null;
    const createdById = lead.created_by ? String(lead.created_by) : null;
    if (assignedId && assignedId !== String(user._id) && createdById !== String(user._id)) {
      throw new ApiError(403, 'You do not have permission to update this lead');
    }
  }

  const allowedUpdates = [
    'name',
    'company_name',
    'email',
    'phone',
    'alternate_phone',
    'contacts',
    'industry',
    'designation',
    'billing_address',
    'requirement',
    'estimated_value',
    'expected_closing_date',
    'source',
    'source_id',
    'priority',
    'status',
    'assigned_to',
    'lost_info',
    'next_follow_up_at',
    'party_id',
    'contact_person_id',
    'products',
    'notes',
    'tags',
    'qualification',
  ];

  for (const field of allowedUpdates) {
    if (body[field] !== undefined) {
      lead[field] = body[field];
    }
  }

  lead.updated_by = user._id;
  lead.last_activity_at = new Date();
  await lead.save();

  const populated = await Lead.findById(id).populate(LEAD_POPULATE).lean();
  const plain = toPlain(populated);

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'updated',
    message: `Lead #${lead.lead_no} updated`,
    new_value: plain,
  });

  return plain;
}

/**
 * Assign or reassign lead to a sales user.
 */
async function assign(id, { assigned_to, notes }, user) {
  const { Lead, User } = getModels();
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (!isLeadManager(user)) {
    throw new ApiError(403, 'Only managers and administrators can assign/reassign leads');
  }

  const targetUser = await User.findById(assigned_to).lean();
  if (!targetUser) throw new ApiError(404, 'Target sales user not found');

  const oldAssignee = lead.assigned_to;
  lead.assigned_to = assigned_to;
  lead.assigned_by = user._id;
  lead.assigned_at = new Date();
  lead.last_activity_at = new Date();
  lead.updated_by = user._id;

  if (lead.status === 'new') {
    lead.status = 'assigned';
  }

  await lead.save();

  const isReassignment = Boolean(oldAssignee && String(oldAssignee) !== String(assigned_to));
  const actionName = isReassignment ? 'reassigned' : 'assigned';
  const actionMsg = isReassignment
    ? `Lead #${lead.lead_no} reassigned to ${targetUser.name}`
    : `Lead #${lead.lead_no} assigned to ${targetUser.name}`;

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: actionName,
    message: notes ? `${actionMsg}. Note: ${notes}` : actionMsg,
    old_value: { assigned_to: oldAssignee },
    new_value: { assigned_to },
  });

  // Notify new assignee
  if (String(assigned_to) !== String(user._id)) {
    await notificationService.createForUser(assigned_to, {
      title: isReassignment ? 'Lead Reassigned to You' : 'New Lead Assigned',
      message: `Lead #${lead.lead_no} (${lead.name}) has been ${actionName} to you`,
      type: 'info',
      module: 'lead',
      entity_type: 'lead',
      entity_id: lead._id,
    });
  }

  const populated = await Lead.findById(id).populate(LEAD_POPULATE).lean();
  return toPlain(populated);
}

/**
 * Change lead status with state transition enforcement.
 */
async function changeStatus(id, { status, remarks }, user) {
  const { Lead } = getModels();
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const canManage = isLeadManager(user);
  if (!canManage) {
    const assignedId = lead.assigned_to ? String(lead.assigned_to) : null;
    const createdById = lead.created_by ? String(lead.created_by) : null;
    if (assignedId && assignedId !== String(user._id) && createdById !== String(user._id)) {
      throw new ApiError(403, 'You do not have permission to change this lead status');
    }
  }

  const currentStatus = lead.status;
  if (currentStatus === status) {
    return toPlain(await Lead.findById(id).populate(LEAD_POPULATE).lean());
  }

  // Validate transitions unless user has override privileges
  if (!canManage) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(
        400,
        `Cannot transition lead status from '${currentStatus}' to '${status}'. Allowed: ${allowed.join(', ') || 'None'}`
      );
    }
  }

  lead.status = status;
  lead.last_activity_at = new Date();
  lead.updated_by = user._id;

  if (status === 'contacted' && !lead.last_contacted_at) {
    lead.last_contacted_at = new Date();
  }

  await lead.save();

  const msg = `Status changed: ${currentStatus} → ${status}${remarks ? `. (${remarks})` : ''}`;
  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'status_changed',
    message: msg,
    old_value: { status: currentStatus },
    new_value: { status },
  });

  const populated = await Lead.findById(id).populate(LEAD_POPULATE).lean();
  return toPlain(populated);
}

/**
 * Record qualification details for a lead.
 */
async function qualify(id, qualificationData = {}, user) {
  const { Lead } = getModels();
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (['won', 'lost', 'converted'].includes(lead.status)) {
    throw new ApiError(400, 'Cannot modify qualification for a closed (won/lost/converted) lead');
  }

  lead.qualification = {
    requirement_confirmed: Boolean(qualificationData.requirement_confirmed),
    budget_available: Boolean(qualificationData.budget_available),
    decision_maker_known: Boolean(qualificationData.decision_maker_known),
    purchase_timeline: qualificationData.purchase_timeline ? String(qualificationData.purchase_timeline).trim() : '',
    competition: qualificationData.competition ? String(qualificationData.competition).trim() : '',
    qualification_notes: qualificationData.qualification_notes ? String(qualificationData.qualification_notes).trim() : '',
    qualified_at: new Date(),
    qualified_by: user._id,
  };

  if (lead.status === 'new' || lead.status === 'assigned' || lead.status === 'contacted') {
    lead.status = 'qualified';
  }

  lead.last_activity_at = new Date();
  lead.updated_by = user._id;
  await lead.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'status_changed',
    message: `Lead #${lead.lead_no} qualified by ${user.name}`,
    new_value: lead.qualification,
  });

  const populated = await Lead.findById(id).populate(LEAD_POPULATE).lean();
  return toPlain(populated);
}

/**
 * Mark lead as lost with required reason and remarks.
 */
async function markLost(id, { lost_reason, lost_remarks, lost_reason_id }, user) {
  const { Lead } = getModels();
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (lead.status === 'won' || lead.status === 'converted') {
    throw new ApiError(400, 'Cannot mark a won or converted lead as lost');
  }

  lead.status = 'lost';
  lead.lost_info = {
    lost_reason: String(lost_reason).trim(),
    lost_reason_id: lost_reason_id || undefined,
    lost_remarks: lost_remarks ? String(lost_remarks).trim() : '',
    lost_at: new Date(),
    lost_by: user._id,
  };
  lead.last_activity_at = new Date();
  lead.updated_by = user._id;

  await lead.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'status_changed',
    message: `Lead marked as Lost. Reason: ${lost_reason}${lost_remarks ? ` (${lost_remarks})` : ''}`,
    new_value: lead.lost_info,
  });

  const populated = await Lead.findById(id).populate(LEAD_POPULATE).lean();
  return toPlain(populated);
}

/**
 * Convert lead into a Customer (Party), or Customer + Order.
 */
async function convert(id, body = {}, user) {
  const { Lead, Party, Order, Product } = getModels();
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  if (!isLeadManager(user)) {
    const assignedId = lead.assigned_to ? String(lead.assigned_to) : null;
    const createdById = lead.created_by ? String(lead.created_by) : null;
    if (assignedId && assignedId !== String(user._id) && createdById !== String(user._id)) {
      throw new ApiError(403, 'You do not have permission to convert this lead');
    }
  }

  if (lead.status === 'converted') {
    throw new ApiError(400, 'Lead is already converted');
  }

  if (lead.status === 'lost') {
    throw new ApiError(400, 'Cannot convert a lost lead');
  }

  const conversionType = body.conversion_type || 'existing_customer';
  let targetPartyId = lead.party_id || body.party_id;
  let createdOrder = null;

  // 1. If New Customer, create Party record
  if (conversionType === 'new_customer' || (!targetPartyId && conversionType !== 'existing_customer')) {
    const partyData = body.party_data || {};
    const partyName = partyData.party_name || body.party_name || lead.company_name || lead.name;

    const contactsList = Array.isArray(partyData.contacts) && partyData.contacts.length > 0
      ? partyData.contacts
      : Array.isArray(lead.contacts) && lead.contacts.length > 0
      ? lead.contacts
      : [
          {
            name: lead.name,
            phone: lead.phone || '',
            email: lead.email || '',
            designation: lead.designation || '',
            is_primary: true,
          },
        ];

    const billingAddr = partyData.billing_address || body.billing_address || lead.billing_address || {};
    const shippingAddr = partyData.shipping_address || body.shipping_address || billingAddr;

    const newParty = await Party.create({
      company_id: lead.company_id || user.company_id,
      party_type: partyData.party_type || 'customer',
      party_name: partyName,
      contact_person: lead.name,
      mobile: lead.phone || (contactsList[0] && contactsList[0].phone) || '',
      email: lead.email || (contactsList[0] && contactsList[0].email) || '',
      contacts: contactsList,
      gst_no: (partyData.gst_no || body.gst_no) ? String(partyData.gst_no || body.gst_no).toUpperCase().trim() : undefined,
      drug_license_no: partyData.drug_license_no || body.drug_license_no || undefined,
      district: partyData.district || billingAddr.city || '',
      state: partyData.state || billingAddr.state || '',
      payment_terms: partyData.payment_terms || body.payment_terms || 'Advance',
      billing_address: billingAddr,
      shipping_address: shippingAddr,
      created_by: user._id,
      is_active: true,
    });
    targetPartyId = newParty._id;

    await activityService.create({
      actor: user._id,
      entity_type: 'party',
      entity_id: newParty._id,
      action: 'created',
      message: `Party '${newParty.party_name}' created from Lead #${lead.lead_no}`,
    });
  }

  // 2. If Order creation requested alongside conversion
  if (conversionType === 'order' || body.create_order) {
    if (!targetPartyId) {
      throw new ApiError(400, 'A valid customer party is required to create an order');
    }

    const orderNo = await generateOrderNo(targetPartyId, new Date());
    const items = [];
    let subtotal = 0;
    let totalTax = 0;

    const sourceItems = Array.isArray(body.order_items) && body.order_items.length > 0
      ? body.order_items
      : Array.isArray(lead.products) ? lead.products : [];

    if (sourceItems.length > 0) {
      for (const prodItem of sourceItems) {
        let pName = prodItem.product_name || 'Product';
        const rateType = prodItem.applied_rate_type || 'SR';
        let unitPrice = 0;
        let gstPct = 18;
        const qty = Number(prodItem.quantity || prodItem.ordered_quantity || 1);

        let productId = prodItem.product || prodItem.productId;
        let pDoc = null;

        if (productId) {
          pDoc = await Product.findById(productId).lean();
        }
        if (!pDoc && pName) {
          pDoc = await Product.findOne({ product_name: pName, deletedAt: null }).lean();
        }
        if (!pDoc) {
          // Fallback to any active product if not specified
          pDoc = await Product.findOne({ deletedAt: null }).lean();
        }

        if (pDoc) {
          productId = pDoc._id;
          pName = pDoc.product_name || pName;
          if (rateType === 'SR') {
            unitPrice = Number(pDoc.base_price || 0);
          } else if (rateType === 'SRA') {
            unitPrice = Number(pDoc.minimum_sale_rate || pDoc.base_price || 0);
          } else if (rateType === 'CR') {
            unitPrice = Number(pDoc.mrp || pDoc.base_price || 0);
          } else {
            unitPrice = Number(pDoc.base_price || 0);
          }

          if (pDoc.gst_percent !== undefined) {
            gstPct = Number(pDoc.gst_percent);
          }
        }

        if (!productId) {
          continue;
        }

        const gross = unitPrice * qty;
        const taxable = gross;
        const gst = (taxable * gstPct) / 100;
        const total = taxable + gst;

        subtotal += taxable;
        totalTax += gst;

        items.push({
          product: productId,
          product_name: pName,
          sku: pDoc?.sku || prodItem.sku || undefined,
          unit: pDoc?.unit || prodItem.unit || 'pcs',
          ordered_quantity: qty,
          unit_price: unitPrice,
          applied_rate_type: rateType,
          discount_percent: 0,
          discount_amount: 0,
          gst_percent: gstPct,
          taxable_amount: taxable,
          gst_amount: gst,
          total_amount: total,
          remarks: prodItem.remarks || undefined,
          line_status: 'active',
        });
      }
    }

    if (items.length === 0) {
      throw new ApiError(400, 'Order must contain at least one valid product from the catalog');
    }

    const grandTotal = subtotal + totalTax;
    const orderData = body.order_data || {};

    createdOrder = await Order.create({
      company_id: lead.company_id || user.company_id,
      order_no: orderNo,
      order_date: orderData.order_date ? new Date(orderData.order_date) : new Date(),
      expected_delivery_date: orderData.delivery_date ? new Date(orderData.delivery_date) : undefined,
      party: targetPartyId,
      lead: lead._id,
      assigned_sales_user: lead.assigned_to || user._id,
      current_assignee: lead.assigned_to || user._id,
      current_department: 'sales',
      pending_with_role: 'sales',
      order_items: items,
      subtotal,
      taxable_amount: subtotal,
      gst_amount: totalTax,
      grand_total: grandTotal,
      remarks: orderData.remarks || body.notes || undefined,
      status: 'submitted',
      lifecycle_status: 'draft',
      workflow_stage: 'sales',
      current_action: 'submitted',
      created_by: user._id,
    });

    await activityService.create({
      actor: user._id,
      entity_type: 'order',
      entity_id: createdOrder._id,
      action: 'generated',
      message: `Order #${createdOrder.order_no} submitted upon conversion of Lead #${lead.lead_no}`,
    });
  }

  lead.party_id = targetPartyId;
  lead.status = 'converted';
  lead.conversion = {
    converted_at: new Date(),
    converted_by: user._id,
    conversion_type: conversionType,
    party_id: targetPartyId,
    order_id: createdOrder ? createdOrder._id : undefined,
    quotation_id: body.quotation_id || undefined,
    notes: body.notes ? String(body.notes).trim() : '',
  };
  lead.last_activity_at = new Date();
  lead.updated_by = user._id;

  await lead.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: lead._id,
    action: 'status_changed',
    message: `Lead #${lead.lead_no} converted to Customer (${conversionType})`,
    new_value: lead.conversion,
  });

  const populated = await Lead.findById(id).populate(LEAD_POPULATE).lean();
  return toPlain(populated);
}

/**
 * Get aggregated chronological timeline for a lead.
 */
async function getTimeline(id) {
  const { ActivityLog, Attachment } = getModels();

  const [activities, attachments, followUps] = await Promise.all([
    ActivityLog.find({ entity_type: 'lead', entity_id: id })
      .populate('actor', 'name email department')
      .sort({ createdAt: -1 })
      .lean(),
    Attachment.find({ entity_type: 'lead', entity_id: id, deletedAt: null })
      .populate('uploaded_by', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
    getModels().LeadFollowUp.find({ lead: id, deletedAt: null })
      .populate('created_by', 'name email')
      .populate('completed_by', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const timeline = [];

  for (const act of activities) {
    timeline.push({
      _id: act._id,
      kind: 'activity',
      action: act.action,
      message: act.message,
      actor: act.actor ? toPlain(act.actor) : null,
      timestamp: act.createdAt,
      details: act.new_value,
    });
  }

  for (const att of attachments) {
    timeline.push({
      _id: att._id,
      kind: 'attachment',
      action: 'file_attached',
      message: `Attachment added: ${att.original_name}`,
      actor: att.uploaded_by ? toPlain(att.uploaded_by) : null,
      timestamp: att.createdAt,
      attachment: toPlain(att),
    });
  }

  for (const fu of followUps) {
    timeline.push({
      _id: fu._id,
      kind: 'follow_up',
      action: fu.status === 'completed' ? 'followup_completed' : 'followup_scheduled',
      message: `Follow-up (${fu.type}): ${fu.notes || 'No notes'}${fu.outcome ? ` | Outcome: ${fu.outcome}` : ''}`,
      actor: fu.completed_by ? toPlain(fu.completed_by) : fu.created_by ? toPlain(fu.created_by) : null,
      timestamp: fu.completed_at || fu.follow_up_date || fu.createdAt,
      followUp: toPlain(fu),
    });
  }

  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return timeline;
}

/**
 * Soft delete lead.
 */
async function remove(id, user) {
  const { Lead } = getModels();
  const doc = await softDeleteActiveById(Lead, id, {
    notFoundMessage: 'Lead not found',
  });
  const plain = toPlain(doc.toObject());

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: plain._id,
    action: 'deleted',
    message: `Lead #${plain.lead_no} deleted`,
  });

  return plain;
}

/**
 * Restore soft deleted lead.
 */
async function restore(id, user) {
  const { Lead } = getModels();
  const doc = await restoreSoftDeletedById(Lead, id, {
    notFoundMessage: 'Lead not found',
  });
  const plain = toPlain(doc.toObject());

  await activityService.create({
    actor: user._id,
    entity_type: 'lead',
    entity_id: plain._id,
    action: 'restored',
    message: `Lead #${plain.lead_no} restored`,
  });

  return plain;
}

/**
 * Bulk delete leads.
 */
async function bulkDelete(ids, user) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { count: 0, deletedIds: [] };
  }

  const { Lead } = getModels();
  const docs = await Lead.find({
    _id: { $in: ids },
    deletedAt: null,
  });

  const deletedIds = [];
  const deletedNames = [];

  for (const doc of docs) {
    await doc.softDelete();
    deletedIds.push(doc._id.toString());
    deletedNames.push(doc.lead_no || doc.name);
  }

  if (deletedIds.length > 0 && user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'lead',
      entity_id: deletedIds[0],
      action: 'deleted',
      message: `Bulk soft-deleted ${deletedIds.length} leads: ${deletedNames.join(', ')}`,
    });
  }

  return {
    count: deletedIds.length,
    deletedIds,
  };
}

module.exports = {
  isLeadManager,
  checkDuplicates,
  list,
  get,
  create,
  update,
  assign,
  changeStatus,
  qualify,
  markLost,
  convert,
  getTimeline,
  remove,
  restore,
  bulkDelete,
};
