/**
 * @fileoverview Transport agents: business rules and mongoose persistence helpers.
 * @module modules/fleet/transportAgent.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');

const AGENT_NF = 'Transport agent not found';
const AGENT_TYPES = new Set(['internal_fleet', 'third_party', 'courier']);
const AGENT_STATUSES = new Set(['active', 'inactive', 'blacklisted']);

const PATCHABLE_KEYS = Object.freeze([
  'agent_name',
  'agent_type',
  'contact_person',
  'mobile',
  'alternate_mobile',
  'email',
  'gst_no',
  'pan_no',
  'payment_terms',
  'address',
  'service_areas',
  'status',
  'remarks',
  'is_active',
]);

async function nextAgentCode() {
  const count = await getModels().TransportAgent.countDocuments();
  return `TA${String(count + 1).padStart(4, '0')}`;
}

function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  for (const k of PATCHABLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    let v = patch[k];
    if (k === 'agent_name' && typeof v === 'string') v = v.trim();
    if (k === 'gst_no' && typeof v === 'string') v = v.trim().toUpperCase();
    if (k === 'pan_no' && typeof v === 'string') v = v.trim().toUpperCase();
    if (k === 'email' && typeof v === 'string') v = v.trim().toLowerCase();
    if (k === 'agent_type' && !AGENT_TYPES.has(v)) throw new ApiError(400, 'Invalid agent_type');
    if (k === 'status' && !AGENT_STATUSES.has(v)) throw new ApiError(400, 'Invalid status');
    out[k] = v;
  }
  return out;
}

async function list(query = {}) {
  const q = {};
  if (query.agent_type && AGENT_TYPES.has(query.agent_type)) q.agent_type = query.agent_type;
  if (query.status && AGENT_STATUSES.has(query.status)) q.status = query.status;
  if (query.is_active === 'true') q.is_active = true;
  if (query.is_active === 'false') q.is_active = false;
  const rows = await getModels().TransportAgent.find(q).sort({ createdAt: -1 }).lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().TransportAgent.findById(id).lean();
  if (!row) throw new ApiError(404, AGENT_NF);
  return toPlain(row);
}

async function create(body, user) {
  const agentName = String(body.agent_name || '').trim();
  if (!agentName) throw new ApiError(400, 'agent_name is required');

  const agentType = body.agent_type && AGENT_TYPES.has(body.agent_type) ? body.agent_type : 'third_party';
  const agentCode = await nextAgentCode();

  const doc = await getModels().TransportAgent.create({
    agent_code: agentCode,
    agent_name: agentName,
    agent_type: agentType,
    contact_person: body.contact_person != null ? String(body.contact_person).trim() : '',
    mobile: body.mobile != null ? String(body.mobile).trim() : '',
    alternate_mobile: body.alternate_mobile != null ? String(body.alternate_mobile).trim() : '',
    email: body.email != null ? String(body.email).trim().toLowerCase() : '',
    gst_no: body.gst_no != null ? String(body.gst_no).trim().toUpperCase() : '',
    pan_no: body.pan_no != null ? String(body.pan_no).trim().toUpperCase() : '',
    payment_terms: body.payment_terms != null ? String(body.payment_terms).trim() : '',
    address: body.address && typeof body.address === 'object' ? body.address : {},
    service_areas: Array.isArray(body.service_areas) ? body.service_areas : [],
    status: body.status && AGENT_STATUSES.has(body.status) ? body.status : 'active',
    remarks: body.remarks != null ? String(body.remarks).trim() : '',
    is_active: body.is_active !== false,
    created_by: user?._id,
    updated_by: user?._id,
  });

  return toPlain(doc.toObject());
}

async function update(id, patch, user) {
  await get(id);
  const next = sanitizePatch(patch);
  if (user?._id) next.updated_by = user._id;
  const doc = await getModels().TransportAgent.findByIdAndUpdate(id, { $set: next }, { new: true }).lean();
  return toPlain(doc);
}

async function listDeleted() {
  const rows = await listDeletedLean(getModels().TransportAgent, {});
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().TransportAgent, id, { notFoundMessage: AGENT_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'transport_agent',
    entity_id: plain._id,
    action: 'deleted',
    message: `Transport agent ${plain.agent_name} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().TransportAgent, id, { notFoundMessage: AGENT_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'transport_agent',
    entity_id: plain._id,
    action: 'restored',
    message: `Transport agent ${plain.agent_name} restored`,
  });
  return plain;
}

module.exports = { list, get, create, update, listDeleted, softDelete, restore };
