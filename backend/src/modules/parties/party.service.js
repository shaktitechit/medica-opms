/**
 * @fileoverview Parties CRUD + soft-delete (OPMS counterparties).
 * @module modules/parties/party.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const { PARTY_TYPES } = require('./party.validation');

const nf = 'Party not found';

const PATCHABLE_KEYS = Object.freeze([
  'party_type',
  'party_name',
  'contact_person',
  'mobile',
  'email',
  'contacts',
  'gst_no',
  'drug_license_no',
  'billing_address',
  'shipping_address',
  'district',
  'state',
  'payment_terms',
  'legacy_customer',
  'is_active',
  'sra',
]);

function sanitizeContacts(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      name: c.name != null ? String(c.name).trim() : '',
      department: c.department != null ? String(c.department).trim() : '',
      phone: c.phone != null ? String(c.phone).trim() : '',
      email: c.email != null ? String(c.email).trim().toLowerCase() : '',
      alternate_phone: c.alternate_phone != null ? String(c.alternate_phone).trim() : '',
    }))
    .filter(
      (c) => c.name || c.department || c.phone || c.email || c.alternate_phone
    );
}

function primaryContactFields(contacts) {
  const primary = contacts[0];
  if (!primary) {
    return { contact_person: '', mobile: '', email: '' };
  }
  return {
    contact_person: primary.name || '',
    mobile: primary.phone || '',
    email: primary.email || '',
  };
}

function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  for (const k of PATCHABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      let v = patch[k];
      if (k === 'gst_no' && typeof v === 'string') v = v.trim().toUpperCase();
      if (k === 'email' && typeof v === 'string') v = v.trim().toLowerCase();
      if (k === 'party_name' && typeof v === 'string') v = v.trim();
      if (k === 'party_type') {
        if (!PARTY_TYPES.has(v)) throw new ApiError(400, 'Invalid party_type');
      }
      if (k === 'contacts') {
        v = sanitizeContacts(v);
        Object.assign(out, primaryContactFields(v));
        out.contacts = v;
        continue;
      }
      out[k] = v;
    }
  }
  return out;
}

async function list(query = {}) {
  const { Party } = getModels();

  const paginate = query.paginate === 'true';
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.max(Number(query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const mongoFilter = { deletedAt: null };

  if (query.search && String(query.search).trim()) {
    const s = String(query.search).trim();
    mongoFilter.$or = [
      { party_name: { $regex: s, $options: 'i' } },
      { contact_person: { $regex: s, $options: 'i' } },
      { mobile: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { gst_no: { $regex: s, $options: 'i' } },
      { 'contacts.name': { $regex: s, $options: 'i' } },
      { 'contacts.department': { $regex: s, $options: 'i' } },
      { 'contacts.phone': { $regex: s, $options: 'i' } },
      { 'contacts.email': { $regex: s, $options: 'i' } },
      { 'contacts.alternate_phone': { $regex: s, $options: 'i' } },
    ];
  }

  if (query.type && query.type !== 'all') {
    mongoFilter.party_type = query.type;
  }

  if (query.status && query.status !== 'all') {
    if (query.status === 'active') {
      mongoFilter.is_active = { $ne: false };
    } else if (query.status === 'inactive') {
      mongoFilter.is_active = false;
    }
  }

  if (paginate) {
    const [total, rows] = await Promise.all([
      Party.countDocuments(mongoFilter),
      Party.find(mongoFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data: rows.map(toPlain),
    };
  }

  const rows = await Party.find(mongoFilter).sort({ createdAt: -1 }).lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().Party.findById(id).lean();
  if (!row) throw new ApiError(404, nf);
  return toPlain(row);
}

async function create(body, user) {
  const gst = body.gst_no != null ? String(body.gst_no).trim().toUpperCase() : '';
  const contacts = sanitizeContacts(body.contacts);
  const primary = primaryContactFields(contacts);
  const payload = {
    party_type: body.party_type && PARTY_TYPES.has(body.party_type) ? body.party_type : 'customer',
    party_name: String(body.party_name).trim(),
    contact_person:
      contacts.length > 0
        ? primary.contact_person
        : body.contact_person != null
          ? String(body.contact_person).trim()
          : '',
    mobile:
      contacts.length > 0
        ? primary.mobile
        : body.mobile != null
          ? String(body.mobile).trim()
          : '',
    email:
      contacts.length > 0
        ? primary.email
        : body.email != null
          ? String(body.email).trim().toLowerCase()
          : '',
    contacts,
    gst_no: gst,
    drug_license_no: body.drug_license_no != null ? String(body.drug_license_no).trim() : '',
    billing_address: body.billing_address && typeof body.billing_address === 'object' ? body.billing_address : {},
    shipping_address: body.shipping_address && typeof body.shipping_address === 'object' ? body.shipping_address : {},
    district: body.district != null ? String(body.district).trim() : '',
    state: body.state != null ? String(body.state).trim() : '',
    payment_terms: body.payment_terms != null ? String(body.payment_terms).trim() : '',
    legacy_customer: body.legacy_customer || undefined,
    is_active: body.is_active !== false,
    sra: Boolean(body.sra),
    created_by: user._id,
  };

  const doc = await getModels().Party.create(payload);
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'party',
    entity_id: plain._id,
    action: 'created',
    message: `Party ${plain.party_name} created`,
  });
  return plain;
}

async function update(id, patch, user) {
  const doc = await getModels().Party.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, nf);

  const sanitized = sanitizePatch(patch);
  if (Object.keys(sanitized).length === 0) {
    throw new ApiError(400, 'No valid fields to patch');
  }
  doc.set(sanitized);
  await doc.save();

  await activityService.create({
    actor: user._id,
    entity_type: 'party',
    entity_id: id,
    action: 'updated',
    message: 'Party updated',
  });
  return toPlain(doc.toObject());
}

async function listDeleted() {
  const rows = await listDeletedLean(getModels().Party, {});
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().Party, id, { notFoundMessage: nf });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'party',
    entity_id: plain._id,
    action: 'deleted',
    message: `Party ${plain.party_name} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().Party, id, { notFoundMessage: nf });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'party',
    entity_id: plain._id,
    action: 'restored',
    message: `Party ${plain.party_name} restored`,
  });
  return plain;
}

async function bulkCreate(items, user) {
  if (!Array.isArray(items)) {
    throw new ApiError(400, 'Payload must be an array of parties');
  }

  const { Party } = getModels();
  const createdParties = [];

  for (const item of items) {
    const name = item.party_name != null ? String(item.party_name).trim() : '';
    if (!name) continue;

    const gst = item.gst_no != null ? String(item.gst_no).trim().toUpperCase() : '';
    const type = item.party_type && PARTY_TYPES.has(item.party_type) ? item.party_type : 'customer';

    const contacts = sanitizeContacts(item.contacts);
    const primary = primaryContactFields(contacts);
    const payload = {
      party_type: type,
      party_name: name,
      contact_person:
        contacts.length > 0
          ? primary.contact_person
          : item.contact_person != null
            ? String(item.contact_person).trim()
            : '',
      mobile:
        contacts.length > 0
          ? primary.mobile
          : item.mobile != null
            ? String(item.mobile).trim()
            : '',
      email:
        contacts.length > 0
          ? primary.email
          : item.email != null
            ? String(item.email).trim().toLowerCase()
            : '',
      contacts,
      gst_no: gst,
      drug_license_no: item.drug_license_no != null ? String(item.drug_license_no).trim() : '',
      billing_address: item.billing_address && typeof item.billing_address === 'object' ? item.billing_address : {},
      shipping_address: item.shipping_address && typeof item.shipping_address === 'object' ? item.shipping_address : {},
      district: item.district != null ? String(item.district).trim() : '',
      state: item.state != null ? String(item.state).trim() : '',
      payment_terms: item.payment_terms != null ? String(item.payment_terms).trim() : '',
      legacy_customer: item.legacy_customer || undefined,
      is_active: item.is_active !== false,
      sra: Boolean(item.sra),
    };

    if (user) {
      payload.created_by = user._id;
    }

    const doc = await Party.create(payload);
    createdParties.push(toPlain(doc.toObject()));
  }

  if (createdParties.length > 0 && user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'party',
      entity_id: createdParties[0]._id,
      action: 'created',
      message: `Bulk uploaded ${createdParties.length} parties`,
    });
  }

  return createdParties;
}

async function bulkDelete(ids, user) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { count: 0, deletedIds: [] };
  }

  const { Party } = getModels();

  const docs = await Party.find({
    _id: { $in: ids },
    deletedAt: null,
  });

  const deletedIds = [];
  const deletedNames = [];

  for (const doc of docs) {
    await doc.softDelete();
    deletedIds.push(doc._id.toString());
    deletedNames.push(doc.party_name);
  }

  if (deletedIds.length > 0 && user) {
    await activityService.create({
      actor: user._id,
      entity_type: "party",
      entity_id: deletedIds[0],
      action: "deleted",
      message: `Bulk soft-deleted ${deletedIds.length} parties: ${deletedNames.join(", ")}`,
    });
  }

  return {
    count: deletedIds.length,
    deletedIds,
  };
}

module.exports = {
  list,
  get,
  create,
  update,
  listDeleted,
  softDelete,
  restore,
  bulkCreate,
  bulkDelete,
};

