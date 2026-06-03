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
  'gst_no',
  'drug_license_no',
  'billing_address',
  'shipping_address',
  'district',
  'state',
  'payment_terms',
  'legacy_customer',
  'is_active',
]);

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
      out[k] = v;
    }
  }
  return out;
}

async function list() {
  const rows = await getModels().Party.find().sort({ createdAt: -1 }).lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().Party.findById(id).lean();
  if (!row) throw new ApiError(404, nf);
  return toPlain(row);
}

async function create(body, user) {
  const gst = body.gst_no != null ? String(body.gst_no).trim().toUpperCase() : '';
  const payload = {
    party_type: body.party_type && PARTY_TYPES.has(body.party_type) ? body.party_type : 'customer',
    party_name: String(body.party_name).trim(),
    contact_person: body.contact_person != null ? String(body.contact_person).trim() : '',
    mobile: String(body.mobile).trim(),
    email: body.email != null ? String(body.email).trim().toLowerCase() : '',
    gst_no: gst,
    drug_license_no: body.drug_license_no != null ? String(body.drug_license_no).trim() : '',
    billing_address: body.billing_address && typeof body.billing_address === 'object' ? body.billing_address : {},
    shipping_address: body.shipping_address && typeof body.shipping_address === 'object' ? body.shipping_address : {},
    district: body.district != null ? String(body.district).trim() : '',
    state: body.state != null ? String(body.state).trim() : '',
    payment_terms: body.payment_terms != null ? String(body.payment_terms).trim() : '',
    legacy_customer: body.legacy_customer || undefined,
    is_active: body.is_active !== false,
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

    const payload = {
      party_type: type,
      party_name: name,
      contact_person: item.contact_person != null ? String(item.contact_person).trim() : '',
      mobile: item.mobile != null ? String(item.mobile).trim() : '',
      email: item.email != null ? String(item.email).trim().toLowerCase() : '',
      gst_no: gst,
      drug_license_no: item.drug_license_no != null ? String(item.drug_license_no).trim() : '',
      billing_address: item.billing_address && typeof item.billing_address === 'object' ? item.billing_address : {},
      shipping_address: item.shipping_address && typeof item.shipping_address === 'object' ? item.shipping_address : {},
      district: item.district != null ? String(item.district).trim() : '',
      state: item.state != null ? String(item.state).trim() : '',
      payment_terms: item.payment_terms != null ? String(item.payment_terms).trim() : '',
      legacy_customer: item.legacy_customer || undefined,
      is_active: item.is_active !== false,
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

module.exports = {
  list,
  get,
  create,
  update,
  listDeleted,
  softDelete,
  restore,
  bulkCreate,
};

