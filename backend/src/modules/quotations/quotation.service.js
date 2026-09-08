/**
 * @fileoverview Quotation Service - Generates, lists, updates, and deletes quotations.
 * @module modules/quotations/quotation.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');
const emailHelper = require('../messages/helpers/email.helper');
const microsoftGraph = require('../../config/microsoftGraph');
const { logger } = require('../../config/logger');

/**
 * Checks whether user has permission to manage quotations (Admin, Super Admin, Finance only).
 */
function isQuotationManager(user) {
  if (!user) return false;
  const dept = user.department || '';
  const role = user.role || '';
  return (
    dept === 'admin' ||
    dept === 'super_admin' ||
    dept === 'finance' ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'finance'
  );
}

/**
 * Converts a positive number to Indian currency words format (Lakhs / Crores).
 * @param {number} num
 * @returns {string}
 */
function numberToIndianWords(num) {
  if (num == null || isNaN(num)) return '';
  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero Rupees Only';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 20) return units[n];
    const rem = n % 10;
    return tens[Math.floor(n / 10)] + (rem ? ' ' + units[rem] : '');
  }

  function convertThreeDigits(n) {
    let str = '';
    if (Math.floor(n / 100) > 0) {
      str += units[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n > 0) {
      str += convertTwoDigits(n);
    }
    return str.trim();
  }

  let crore = Math.floor(n / 10000000);
  let rem = n % 10000000;
  let lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  let thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  let hundred = rem;

  let result = '';
  if (crore > 0) {
    result += (crore < 100 ? convertTwoDigits(crore) : convertThreeDigits(crore)) + ' Crore ';
  }
  if (lakh > 0) {
    result += convertTwoDigits(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    result += convertTwoDigits(thousand) + ' Thousand ';
  }
  if (hundred > 0) {
    result += convertThreeDigits(hundred) + ' ';
  }

  const paise = Math.round((Math.abs(num) - n) * 100);
  let str = result.trim() + ' Rupees';
  if (paise > 0) {
    str += ' and ' + convertTwoDigits(paise) + ' Paise';
  }
  return str + ' Only';
}

/**
 * Generate sequential quotation number (e.g., QT-20260901-0001).
 */
async function generateQuotationNo() {
  const { LeadQuotation } = getModels();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `QT-${yyyy}${mm}${dd}-`;

  const latestDocs = await LeadQuotation.collection
    .find({ quotation_no: { $regex: `^${datePrefix}\\d+` } })
    .sort({ quotation_no: -1 })
    .limit(1)
    .toArray();

  let nextSeq = 1;
  if (latestDocs && latestDocs.length > 0 && latestDocs[0].quotation_no) {
    const match = String(latestDocs[0].quotation_no).match(/-(\d+)$/);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed) && parsed >= nextSeq) {
        nextSeq = parsed + 1;
      }
    }
  }

  let candidate = `${datePrefix}${String(nextSeq).padStart(4, '0')}`;
  let exists = await LeadQuotation.collection.findOne({ quotation_no: candidate });
  while (exists) {
    nextSeq += 1;
    candidate = `${datePrefix}${String(nextSeq).padStart(4, '0')}`;
    exists = await LeadQuotation.collection.findOne({ quotation_no: candidate });
  }

  return candidate;
}

/**
 * Generate sequential reference number (e.g., Q-1001, Q-1002...).
 */
async function generateRefNo() {
  const { LeadQuotation } = getModels();

  const allDocs = await LeadQuotation.collection
    .find({ deletedAt: null }, { projection: { ref_no: 1, quotation_no: 1 } })
    .toArray();

  let maxSeq = 1000;
  if (allDocs && allDocs.length > 0) {
    for (const doc of allDocs) {
      const ref = doc.ref_no || doc.quotation_no || '';
      const matches = String(ref).match(/(\d+)/g);
      if (matches && matches.length > 0) {
        const num = parseInt(matches[matches.length - 1], 10);
        if (!Number.isNaN(num) && num < 1000000 && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  let candidate = `Q-${maxSeq + 1}`;
  let exists = await LeadQuotation.collection.findOne({ ref_no: candidate });
  while (exists) {
    maxSeq += 1;
    candidate = `Q-${maxSeq + 1}`;
    exists = await LeadQuotation.collection.findOne({ ref_no: candidate });
  }

  return candidate;
}

/**
 * Get default terms & conditions template.
 */
function getDefaultTermsAndConditions(company) {
  const companyName = company?.legal_name || company?.trade_name || 'the Company';
  const gstin = company?.gstin || '';
  const bankName = company?.bank_name || ' ';
  const branchName = company?.branch_name || ' ';
  const accNo = company?.account_number || ' ';
  const ifsc = company?.ifsc_code || ' ';
  const accName = company?.account_name || ' ';

  return [
    `VALIDITY OF OFFER: The price quoted for this Proposal is valid for 15 days from such communication to Customer and thereafter the same shall be subject to reconfirmation by ${companyName}.`,
    'Taxes are Extra in above offer.',
    'PAYMENT TERMS: The payment terms applicable are as follows:\n' +
    'a) Advance amount of 70% of the total contract value along with GST Taxes to be paid by Customer along with the Purchase Order.\n' +
    'b) 20% of the total contract value to be paid by Customer on readiness of materials before dispatch.\n' +
    'c) Remaining 10% of the total contract value to be paid by Customer within three (3) days from installation and commissioning and submission of invoice thereof.',
    'COST & SCOPE: The price given above is Exclusive of taxes, I&C, Freight FOR Site G Floor. Any change in scope of work or addition to the bill of materials and/or ratings or any variation, whatsoever, shall be charged extra to Customer at actual. Un-loading at Site Floor in Customer Scope.',
    'DELIVERY & INSTALLATION: The delivery date will be 4-6 Weeks from the date of acceptance of Purchase Order & will be installed by Company Technical Team.',
    'WARRANTY: The Machine Carries a One (1) years’ warranty from the date of Installation or 14 Months from the date of Billing whichever is Earlier. Warranty terms is as per company norms if the machine is relocated from original place of installation.',
    'AFTER SALE SERVICE: Machine service after sale will be provided directly by company engineer or you can call on Toll free number 1800-120-9500. Note ** NIBP Module is Optional in 4008 Sng.',
    'No Consumable Material Coming along with Machine as a part of billing and will be billed extra if required.',
    `GST No: ${gstin}`,
    'PRICE VALIDITY TERMS for the Supply of Dialysis Equipment/Services:\n' +
    '1. Validity Period: Prices quoted are valid for 15 days from the date of submission.\n' +
    "2. Old Prices: Prices quoted outside of this 15 day validity period will not be considered for the finalization of the proposal without the supplier's explicit consent.",
    `BANK DETAILS:\nName - ${accName}.\nBank - ${bankName}, ${branchName}\nA/c No. – ${accNo}\nIFSC - ${ifsc}`,
    'All Installation material to be used as per guidelines from Fresenius Medical Care INDIA Limited.',
  ];
}

/**
 * Retrieve default quotation terms & conditions directly from CompanyInfo.
 */
async function getDefaultTerms() {
  const { TermsAndConditions, TermsText, CompanyInfo } = getModels();

  // 1. Try fetching from TermsAndConditions & TermsText
  const activeDefaultTerms = await TermsAndConditions.findOne({
    type: 'quotation',
    is_default: true,
    is_active: true,
    deletedAt: null,
  });

  if (activeDefaultTerms) {
    const textDocs = await TermsText.find({
      terms_and_conditions_id: activeDefaultTerms._id,
      is_active: true,
      deletedAt: null,
    })
      .sort({ sequence: 1, createdAt: 1 })
      .lean();

    if (textDocs.length > 0) {
      return textDocs.map((t) => t.text);
    }
  }

  // 2. Fallback to CompanyInfo quotation_terms
  let company = await CompanyInfo.findOne({ is_default: true });
  if (!company) {
    company = await CompanyInfo.create({ is_default: true });
  }

  if (Array.isArray(company.quotation_terms) && company.quotation_terms.length > 0) {
    return company.quotation_terms;
  }

  const terms = getDefaultTermsAndConditions(company);
  company.quotation_terms = terms;
  await company.save();
  return terms;
}

/**
 * Recalculate quotation line totals and financial summary.
 */
function computeTotals(items) {
  let subtotal = 0;
  let totalGst = 0;

  const computedItems = (items || []).map((item) => {
    const qty = Number(item.quantity) || 1;
    const rate = Number(item.rate) || 0;
    const taxableAmount = Math.round(qty * rate * 100) / 100;
    const gstRate = Number(item.gst_rate) || 0;

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;
    let totalGstAmount = 0;

    if (item.igst_rate && Number(item.igst_rate) > 0) {
      igstRate = Number(item.igst_rate);
      igstAmount = Math.round(((taxableAmount * igstRate) / 100) * 100) / 100;
      totalGstAmount = igstAmount;
    } else {
      const halfRate = gstRate / 2;
      cgstRate = halfRate;
      sgstRate = halfRate;
      cgstAmount = Math.round(((taxableAmount * halfRate) / 100) * 100) / 100;
      sgstAmount = Math.round(((taxableAmount * halfRate) / 100) * 100) / 100;
      totalGstAmount = Math.round((cgstAmount + sgstAmount) * 100) / 100;
    }

    const lineTotal = Math.round((taxableAmount + totalGstAmount) * 100) / 100;

    subtotal += taxableAmount;
    totalGst += totalGstAmount;

    return {
      ...item,
      quantity: qty,
      rate,
      taxable_amount: taxableAmount,
      gst_rate: gstRate,
      cgst_rate: cgstRate,
      cgst_amount: cgstAmount,
      sgst_rate: sgstRate,
      sgst_amount: sgstAmount,
      igst_rate: igstRate,
      igst_amount: igstAmount,
      total_gst_amount: totalGstAmount,
      line_total: lineTotal,
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  totalGst = Math.round(totalGst * 100) / 100;
  const rawGrandTotal = subtotal + totalGst;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = Math.round((grandTotal - rawGrandTotal) * 100) / 100;
  const amountInWords = numberToIndianWords(grandTotal);

  return {
    items: computedItems,
    subtotal,
    total_gst: totalGst,
    round_off: roundOff,
    grand_total: grandTotal,
    amount_in_words: amountInWords,
  };
}

/**
 * Mirror quotation line rates onto the lead's product pricing and estimated value.
 */
function applyQuotationPricingToLead(lead, items) {
  const existingProducts = Array.isArray(lead.products) ? lead.products : [];

  const nextProducts = (items || [])
    .filter((item) => String(item.product_name || '').trim())
    .map((item) => {
      const itemProductId = item.product ? String(item.product) : '';
      const itemName = String(item.product_name || '').trim().toLowerCase();
      const existing = existingProducts.find((p) => {
        const pId = p.product ? String(p.product) : '';
        if (itemProductId && pId && itemProductId === pId) return true;
        return String(p.product_name || '').trim().toLowerCase() === itemName;
      });

      return {
        product: item.product || existing?.product || undefined,
        product_name: String(item.product_name).trim(),
        quantity: Number(item.quantity) || 1,
        target_price: Number(item.rate) || 0,
        unit: item.unit || existing?.unit || 'pcs',
        remarks: existing?.remarks || item.description || '',
      };
    });

  const estimatedValue =
    Math.round(
      nextProducts.reduce(
        (sum, p) => sum + Number(p.quantity || 0) * Number(p.target_price || 0),
        0
      ) * 100
    ) / 100;

  lead.products = nextProducts;
  lead.estimated_value = estimatedValue;
  return estimatedValue;
}

/**
 * Keep the parent lead in the quotation pipeline stage (unless already closed).
 */
function advanceLeadToQuotationStatus(lead) {
  if (!lead || ['won', 'lost', 'converted'].includes(lead.status)) {
    return false;
  }
  if (['new', 'assigned', 'follow_up'].includes(lead.status)) {
    lead.status = 'quotation';
    return true;
  }
  return false;
}

/**
 * Build visibility filter for quotation queries.
 * - Super admin: sees all non-draft quotations + self-created draft quotations.
 * - Admin, Finance, and other roles: sees ONLY quotations where user is Creator OR assigned Signatory (and draft if creator).
 */
function buildQuotationVisibilityFilter(user) {
  if (!user || !user._id) return {};

  const userEmail = (user.email || '').toLowerCase().trim();

  if (user.department === 'super_admin') {
    return {
      $or: [
        { status: { $ne: 'draft' } },
        { created_by: user._id },
      ],
    };
  }

  return {
    $or: [
      { created_by: user._id },
      {
        status: { $ne: 'draft' },
        $or: [
          { signatory_user: user._id },
          ...(userEmail ? [{ signatory_email: new RegExp(`^${userEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }] : []),
        ],
      },
    ],
  };
}

/**
 * List all quotations with filtering and pagination.
 */
async function listAll(query = {}, user) {
  const { LeadQuotation } = getModels();
  const filter = { deletedAt: null };
  const conditions = [];

  const visibilityFilter = buildQuotationVisibilityFilter(user);
  if (Object.keys(visibilityFilter).length > 0) {
    conditions.push(visibilityFilter);
  }

  if (query.lead) {
    filter.lead = query.lead;
  }
  if (query.status) {
    filter.status = query.status;
  }
  if (query.search && String(query.search).trim()) {
    const searchRegex = new RegExp(String(query.search).trim(), 'i');
    conditions.push({
      $or: [
        { quotation_no: searchRegex },
        { ref_no: searchRegex },
        { customer_name: searchRegex },
        { subject: searchRegex },
      ],
    });
  }

  if (conditions.length > 0) {
    filter.$and = conditions;
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit, 10) || 50);
  const skip = (page - 1) * limit;

  const [total, quotations] = await Promise.all([
    LeadQuotation.countDocuments(filter),
    LeadQuotation.find(filter)
      .populate('lead', 'lead_no organization_name first_name last_name status')
      .populate('created_by', 'name email department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    quotations,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * List quotations for a lead.
 */
async function listByLead(leadId, user) {
  const { Lead, LeadQuotation } = getModels();

  const lead = await Lead.findOne({ _id: leadId, deletedAt: null });
  if (!lead) throw new ApiError(404, 'Lead not found');

  const filter = {
    lead: leadId,
    deletedAt: null,
  };

  const visibilityFilter = buildQuotationVisibilityFilter(user);
  if (Object.keys(visibilityFilter).length > 0) {
    filter.$and = [visibilityFilter];
  }

  const quotations = await LeadQuotation.find(filter)
    .populate('created_by', 'name email department')
    .sort({ createdAt: -1 })
    .lean();

  return quotations;
}

/**
 * Create a new quotation. Supports overloaded signatures:
 * - create(leadId, body, user)
 * - create(body, user)
 */
async function create(leadIdOrBody, bodyOrUser, userParam) {
  let leadId;
  let body;
  let user;

  if (userParam !== undefined) {
    // 3-argument call: create(leadId, body, user)
    leadId = leadIdOrBody ? String(leadIdOrBody) : undefined;
    body = bodyOrUser || {};
    user = userParam;
    if (!leadId && (body.lead || body.leadId)) {
      leadId = String(body.lead || body.leadId);
    }
  } else {
    // 2-argument call: create(body, user)
    body = leadIdOrBody || {};
    user = bodyOrUser;
    leadId = body.lead || body.leadId ? String(body.lead || body.leadId) : undefined;
  }

  const { Lead, LeadQuotation, CompanyInfo, User } = getModels();

  let lead = null;
  if (leadId) {
    lead = await Lead.findOne({ _id: leadId, deletedAt: null });
    if (!lead) throw new ApiError(404, 'Lead not found');

    if (['lost'].includes(lead.status)) {
      throw new ApiError(400, `Cannot create quotation for a lead in '${lead.status}' status`);
    }
  }

  if (!isQuotationManager(user)) {
    throw new ApiError(403, 'Only administrators can create quotations');
  }

  // Resolve assigned user (must be admin, super_admin, or finance; excluding sales)
  let assignedUser = null;
  if (lead && lead.assigned_to) {
    const leadUser = await User.findById(lead.assigned_to).lean();
    if (leadUser && ['admin', 'super_admin', 'finance'].includes(leadUser.department)) {
      assignedUser = leadUser;
    }
  }
  if (!assignedUser) {
    assignedUser = await User.findOne({ department: { $in: ['admin', 'super_admin', 'finance'] }, is_active: true }).lean();
  }
  const defaultSignatory = assignedUser || user;

  const company = await CompanyInfo.findOne({ is_default: true }).lean();

  const quotationNo = body.quotation_no || (await generateQuotationNo());
  const refNo = body.ref_no || (await generateRefNo());

  const validityDays = Number(body.validity_days) || 15;
  const quotationDate = body.quotation_date ? new Date(body.quotation_date) : new Date();
  const validUntil = body.valid_until
    ? new Date(body.valid_until)
    : new Date(quotationDate.getTime() + validityDays * 24 * 60 * 60 * 1000);

  const { items, subtotal, total_gst, round_off, grand_total, amount_in_words } = computeTotals(
    body.items && body.items.length > 0
      ? body.items
      : [
        {
          product_name: lead?.requirements || body.subject || 'Medical Equipment / Supplies',
          hsn_code: '9018',
          quantity: 1,
          unit: 'Nos',
          rate: lead?.estimated_value || 0,
          gst_rate: 5,
        },
      ]
  );

  const defaultTerms = await getDefaultTerms();

  const quotationPayload = {
    quotation_no: quotationNo,
    ref_no: refNo,
    customer_ref: body.customer_ref || body.customerRef || '',
    lead: lead ? lead._id : null,
    party_id: body.party_id || (lead ? (lead.party_id || null) : null),
    quotation_date: quotationDate,
    valid_until: validUntil,
    validity_days: validityDays,
    subject: body.subject || `Offer For ${items[0]?.product_name || 'Medical Equipment'}`,
    customer_name: body.customer_name || (lead ? (lead.organization_name || lead.party_name || `M/s. ${lead.first_name} ${lead.last_name}`.trim()) : 'Customer'),
    kind_attn: body.kind_attn || (lead ? `${lead.first_name} ${lead.last_name}`.trim() : ''),
    phone: body.phone || lead?.phone || '',
    cell: body.cell || lead?.mobile || lead?.phone || '',
    email: body.email || lead?.email || '',
    gstin: body.gstin || lead?.gstin || '',
    address: body.address || {
      address_line_1: lead?.address?.street || '',
      city: lead?.address?.city || '',
      state: lead?.address?.state || '',
      pincode: lead?.address?.pincode || '',
      country: lead?.address?.country || 'India',
    },
    items,
    subtotal,
    total_gst,
    round_off,
    grand_total,
    amount_in_words,
    terms_and_conditions: Array.isArray(body.terms_and_conditions)
      ? body.terms_and_conditions
      : [],
    company_name: body.company_name || company?.legal_name || company?.trade_name || '',
    company_regd_address:
      body.company_regd_address ||
      (company?.address
        ? `${company.address}, ${company.city} - ${company.pincode}`
        : ''),
    company_phone: body.company_phone || company?.phone || '',
    company_email: body.company_email || company?.email || '',
    company_gstin: body.company_gstin || company?.gstin || '',
    bank_name: body.bank_name || company?.bank_name || '',
    account_name: body.account_name || company?.account_name || '',
    account_number: body.account_number || company?.account_number || '',
    ifsc_code: body.ifsc_code || company?.ifsc_code || '',
    branch_name: body.branch_name || company?.branch_name || '',
    account_type: body.account_type || company?.account_type || '',
    signatory_name: body.signatory_name || defaultSignatory?.name || '',
    signatory_phone: body.signatory_phone || defaultSignatory?.phone || '',
    signatory_email: body.signatory_email || defaultSignatory?.email || '',
    signatory_designation: body.signatory_designation || (defaultSignatory?.department ? (defaultSignatory.department.charAt(0).toUpperCase() + defaultSignatory.department.slice(1)) : 'Authorized Signatory'),
    signatory_user: body.signatory_user || defaultSignatory?._id || null,
    approval_status: body.approval_status || 'pending_approval',
    status: body.status || 'draft',
    created_by: user._id,
    updated_by: user._id,
  };

  let quotation;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      quotation = await LeadQuotation.create(quotationPayload);
      break;
    } catch (err) {
      const isDup =
        err &&
        (err.code === 11000 || err.code === '11000') &&
        String(err.message || '').includes('quotation_no');
      if (!isDup || attempt === maxAttempts - 1) {
        throw err;
      }
      quotationPayload.quotation_no = await generateQuotationNo();
    }
  }

  if (lead) {
    applyQuotationPricingToLead(lead, items);
    advanceLeadToQuotationStatus(lead);
    lead.last_activity_at = new Date();
    await lead.save();

    // Log activity
    await activityService.create({
      entity_type: 'lead',
      entity_id: lead._id,
      action: 'generated',
      actor: user._id,
      message: `Generated Quotation #${quotation.quotation_no} (Ref: ${quotation.ref_no}) for ₹${quotation.grand_total.toLocaleString('en-IN')}`,
      new_value: {
        quotation_id: quotation._id,
        quotation_no: quotation.quotation_no,
        grand_total: quotation.grand_total,
        estimated_value: lead.estimated_value,
      },
    });
  }

  return quotation;
}

/**
 * Get quotation by id.
 */
async function getById(id, user) {
  const { LeadQuotation } = getModels();
  const quotation = await LeadQuotation.findOne({ _id: id, deletedAt: null })
    .populate('lead')
    .populate('created_by', 'name email department')
    .lean();

  if (!quotation) throw new ApiError(404, 'Quotation not found');
  return quotation;
}

/**
 * Update quotation.
 */
async function update(id, body, user) {
  const { Lead, LeadQuotation } = getModels();
  const quotation = await LeadQuotation.findOne({ _id: id, deletedAt: null });
  if (!quotation) throw new ApiError(404, 'Quotation not found');

  if (!isQuotationManager(user)) {
    throw new ApiError(403, 'Only administrators can edit quotations');
  }

  // After approval, only the assigned signatory or super admin can edit the quotation
  const isSignatoryUser =
    (quotation.signatory_user && String(quotation.signatory_user) === String(user._id)) ||
    (quotation.signatory_email && quotation.signatory_email.toLowerCase() === (user.email || '').toLowerCase()) ||
    user.department === 'super_admin';

  if (quotation.approval_status === 'approved' || quotation.status === 'approved' || quotation.status === 'sent' || quotation.status === 'accepted') {
    if (!isSignatoryUser) {
      throw new ApiError(
        403,
        `Only assigned signatory (${quotation.signatory_name || 'Signatory'}) can edit an approved quotation`
      );
    }
  }

  const previousStatus = quotation.status;

  if (body.items) {
    const computed = computeTotals(body.items);
    quotation.items = computed.items;
    quotation.subtotal = computed.subtotal;
    quotation.total_gst = computed.total_gst;
    quotation.round_off = computed.round_off;
    quotation.grand_total = computed.grand_total;
    quotation.amount_in_words = computed.amount_in_words;
  }

  const allowedFields = [
    'ref_no',
    'customer_ref',
    'party_id',
    'lead',
    'subject',
    'customer_name',
    'kind_attn',
    'phone',
    'cell',
    'email',
    'gstin',
    'address',
    'quotation_date',
    'valid_until',
    'validity_days',
    'terms_and_conditions',
    'company_name',
    'company_regd_address',
    'company_phone',
    'company_email',
    'company_gstin',
    'bank_name',
    'account_name',
    'account_number',
    'ifsc_code',
    'branch_name',
    'account_type',
    'signatory_name',
    'signatory_phone',
    'signatory_email',
    'signatory_designation',
    'signatory_user',
    'approval_status',
    'status',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      quotation[field] = body[field];
    }
  }

  quotation.updated_by = user._id;
  await quotation.save();

  const lead = await Lead.findOne({ _id: quotation.lead, deletedAt: null });
  if (lead && !['won', 'lost', 'converted'].includes(lead.status)) {
    if (body.items) {
      applyQuotationPricingToLead(lead, quotation.items);
    }
    advanceLeadToQuotationStatus(lead);
    lead.last_activity_at = new Date();
    await lead.save();
  }

  let message = `Updated Quotation #${quotation.quotation_no} (Ref: ${quotation.ref_no})`;
  let actionType = 'updated';

  if (body.status && body.status !== previousStatus) {
    actionType = 'status_changed';
    message = `Quotation #${quotation.quotation_no} marked as '${body.status.toUpperCase()}'`;
  }

  await activityService.create({
    entity_type: 'lead',
    entity_id: quotation.lead,
    action: actionType,
    actor: user._id,
    message,
    new_value: {
      quotation_id: quotation._id,
      quotation_no: quotation.quotation_no,
      grand_total: quotation.grand_total,
      status: quotation.status,
    },
  });

  return quotation;
}

/**
 * Submit quotation for signatory approval (transitions from draft to pending_approval).
 */
async function submitForApproval(id, user) {
  const { LeadQuotation } = getModels();
  const quotation = await LeadQuotation.findOne({ _id: id, deletedAt: null })
    .populate('created_by', 'name email department')
    .populate('signatory_user', 'name email department');
  if (!quotation) throw new ApiError(404, 'Quotation not found');

  quotation.approval_status = 'pending_approval';
  quotation.status = 'pending_approval';
  quotation.updated_by = user._id;
  await quotation.save();

  await activityService.create({
    entity_type: 'lead',
    entity_id: quotation.lead,
    action: 'submitted_for_approval',
    actor: user._id,
    message: `Submitted Quotation #${quotation.quotation_no} for signatory approval`,
    new_value: {
      quotation_id: quotation._id,
      quotation_no: quotation.quotation_no,
      status: 'pending_approval',
    },
  });

  // Send email notification to assigned signatory
  const signatoryEmail = quotation.signatory_email || quotation.signatory_user?.email;
  if (signatoryEmail) {
    const creatorName = quotation.created_by?.name || user.name || user.email || 'Quotation Creator';
    const subject = `[Approval Required] Quotation #${quotation.quotation_no} (Ref: ${quotation.ref_no || 'N/A'})`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #2563eb; margin-top: 0;">Quotation Awaiting Your Signatory Approval</h2>
        <p>Dear <strong>${quotation.signatory_name || 'Authorized Signatory'}</strong>,</p>
        <p>Quotation <strong>#${quotation.quotation_no}</strong> (Ref: <strong>${quotation.ref_no || 'N/A'}</strong>) for <strong>${quotation.customer_name || 'Customer'}</strong> has been submitted for your signatory approval by <strong>${creatorName}</strong>.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p style="margin: 4px 0;"><strong>Quotation #:</strong> ${quotation.quotation_no}</p>
          <p style="margin: 4px 0;"><strong>Customer:</strong> ${quotation.customer_name || 'N/A'}</p>
          <p style="margin: 4px 0;"><strong>Subject:</strong> ${quotation.subject || 'Medical Equipment Proposal'}</p>
          <p style="margin: 4px 0;"><strong>Grand Total:</strong> ₹${(quotation.grand_total || 0).toLocaleString('en-IN')}</p>
        </div>
        <p>Please log in to the Medica OPMS Portal to review and approve or reject this proposal.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">This is an automated notification from Medica OPMS sent via Microsoft Graph API.</p>
      </div>
    `;
    try {
      await emailHelper.sendEmail(signatoryEmail, subject, `Quotation #${quotation.quotation_no} submitted for your approval by ${creatorName}`, htmlBody, [], [], microsoftGraph.senderEmail);
    } catch (emailErr) {
      logger.error(`[Quotation Service] Failed to send signatory approval email: ${emailErr.message}`);
    }
  }

  return quotation;
}

/**
 * Delete quotation (soft delete).
 */
async function remove(id, user) {
  const { LeadQuotation } = getModels();
  const quotation = await LeadQuotation.findOne({ _id: id, deletedAt: null });
  if (!quotation) throw new ApiError(404, 'Quotation not found');

  if (!isQuotationManager(user)) {
    throw new ApiError(403, 'Only administrators can delete quotations');
  }

  quotation.deletedAt = new Date();
  quotation.updated_by = user._id;
  await quotation.save();

  await activityService.create({
    entity_type: 'lead',
    entity_id: quotation.lead,
    action: 'deleted',
    actor: user._id,
    message: `Deleted Quotation #${quotation.quotation_no}`,
    new_value: {
      quotation_id: quotation._id,
      quotation_no: quotation.quotation_no,
    },
  });

  return { success: true };
}

/**
 * Approve quotation by assigned signatory.
 */
async function approve(id, user) {
  const { LeadQuotation } = getModels();
  const quotation = await LeadQuotation.findOne({ _id: id, deletedAt: null })
    .populate('created_by', 'name email department')
    .populate('signatory_user', 'name email department');
  if (!quotation) throw new ApiError(404, 'Quotation not found');

  const isSignatoryUser =
    (quotation.signatory_user && String(quotation.signatory_user._id || quotation.signatory_user) === String(user._id)) ||
    (quotation.signatory_email && quotation.signatory_email.toLowerCase() === (user.email || '').toLowerCase()) ||
    user.department === 'super_admin';

  if (!isSignatoryUser) {
    throw new ApiError(
      403,
      `Only assigned signatory (${quotation.signatory_name || 'Signatory'}) can approve this quotation`
    );
  }

  quotation.approval_status = 'approved';
  quotation.approved_at = new Date();
  quotation.approved_by = user._id;
  quotation.status = 'approved';
  quotation.updated_by = user._id;
  await quotation.save();

  await activityService.create({
    entity_type: 'lead',
    entity_id: quotation.lead,
    action: 'approved',
    actor: user._id,
    message: `Signatory ${user.name || user.email} approved Quotation #${quotation.quotation_no}`,
    new_value: {
      quotation_id: quotation._id,
      quotation_no: quotation.quotation_no,
      approval_status: 'approved',
    },
  });

  // Send email notification to creator from MICROSOFT_GRAPH_SENDER_EMAIL
  const creatorEmail = quotation.created_by?.email;
  if (creatorEmail) {
    const signatoryName = user.name || quotation.signatory_name || 'Authorized Signatory';
    const creatorName = quotation.created_by?.name || 'Creator';
    const subject = `[Approved] Quotation #${quotation.quotation_no} (Ref: ${quotation.ref_no || 'N/A'}) Approved by Signatory`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #059669; margin-top: 0;">Quotation Approved</h2>
        <p>Dear <strong>${creatorName}</strong>,</p>
        <p>Quotation <strong>#${quotation.quotation_no}</strong> (Ref: <strong>${quotation.ref_no || 'N/A'}</strong>) for <strong>${quotation.customer_name || 'Customer'}</strong> has been <strong>APPROVED</strong> by signatory <strong>${signatoryName}</strong>.</p>
        <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
          <p style="margin: 4px 0;"><strong>Quotation #:</strong> ${quotation.quotation_no}</p>
          <p style="margin: 4px 0;"><strong>Customer:</strong> ${quotation.customer_name || 'N/A'}</p>
          <p style="margin: 4px 0;"><strong>Grand Total:</strong> ₹${(quotation.grand_total || 0).toLocaleString('en-IN')}</p>
          <p style="margin: 4px 0;"><strong>Approved Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <p>You can now send the proposal email to the client from the portal.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">This is an automated notification from Medica OPMS sent via Microsoft Graph API.</p>
      </div>
    `;
    try {
      await emailHelper.sendEmail(creatorEmail, subject, `Quotation #${quotation.quotation_no} approved by ${signatoryName}`, htmlBody, [], [], microsoftGraph.senderEmail);
    } catch (emailErr) {
      logger.error(`[Quotation Service] Failed to send quotation approval notification to creator: ${emailErr.message}`);
    }
  }

  return quotation;
}

/**
 * Reject quotation by assigned signatory.
 */
async function reject(id, reason, user) {
  const { LeadQuotation } = getModels();
  const quotation = await LeadQuotation.findOne({ _id: id, deletedAt: null })
    .populate('created_by', 'name email department')
    .populate('signatory_user', 'name email department');
  if (!quotation) throw new ApiError(404, 'Quotation not found');

  const isSignatoryUser =
    (quotation.signatory_user && String(quotation.signatory_user._id || quotation.signatory_user) === String(user._id)) ||
    (quotation.signatory_email && quotation.signatory_email.toLowerCase() === (user.email || '').toLowerCase()) ||
    user.department === 'super_admin';

  if (!isSignatoryUser) {
    throw new ApiError(
      403,
      `Only assigned signatory (${quotation.signatory_name || 'Signatory'}) can reject this quotation`
    );
  }

  quotation.approval_status = 'rejected';
  quotation.status = 'rejected';
  quotation.rejection_reason = reason || 'Rejected by signatory';
  quotation.updated_by = user._id;
  await quotation.save();

  await activityService.create({
    entity_type: 'lead',
    entity_id: quotation.lead,
    action: 'rejected',
    actor: user._id,
    message: `Signatory ${user.name || user.email} rejected Quotation #${quotation.quotation_no}. Reason: ${reason || 'N/A'}`,
    new_value: {
      quotation_id: quotation._id,
      quotation_no: quotation.quotation_no,
      approval_status: 'rejected',
    },
  });

  // Send email notification to creator from MICROSOFT_GRAPH_SENDER_EMAIL
  const creatorEmail = quotation.created_by?.email;
  if (creatorEmail) {
    const signatoryName = user.name || quotation.signatory_name || 'Authorized Signatory';
    const creatorName = quotation.created_by?.name || 'Creator';
    const subject = `[Rejected] Quotation #${quotation.quotation_no} (Ref: ${quotation.ref_no || 'N/A'}) Rejected by Signatory`;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #dc2626; margin-top: 0;">Quotation Rejected</h2>
        <p>Dear <strong>${creatorName}</strong>,</p>
        <p>Quotation <strong>#${quotation.quotation_no}</strong> (Ref: <strong>${quotation.ref_no || 'N/A'}</strong>) for <strong>${quotation.customer_name || 'Customer'}</strong> has been <strong>REJECTED</strong> by signatory <strong>${signatoryName}</strong>.</p>
        <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
          <p style="margin: 4px 0;"><strong>Quotation #:</strong> ${quotation.quotation_no}</p>
          <p style="margin: 4px 0;"><strong>Rejection Reason:</strong> ${reason || 'Rejected by signatory'}</p>
        </div>
        <p>Please review and update the quotation draft before resubmitting for approval.</p>
        <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">This is an automated notification from Medica OPMS sent via Microsoft Graph API.</p>
      </div>
    `;
    try {
      await emailHelper.sendEmail(creatorEmail, subject, `Quotation #${quotation.quotation_no} rejected by ${signatoryName}`, htmlBody, [], [], microsoftGraph.senderEmail);
    } catch (emailErr) {
      logger.error(`[Quotation Service] Failed to send quotation rejection notification to creator: ${emailErr.message}`);
    }
  }

  return quotation;
}

module.exports = {
  create,
  listAll,
  listByLead,
  list: listByLead, // alias for backwards compatibility
  getById,
  update,
  remove,
  submitForApproval,
  approve,
  reject,
  getDefaultTerms,
  generateQuotationNo,
  numberToIndianWords,
  getDefaultTermsAndConditions,
  isQuotationManager,
};
