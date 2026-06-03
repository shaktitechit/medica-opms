/**
 * @fileoverview Fleet: business rules and mongoose persistence helpers.
 * @module modules/fleet/driver.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');

const DRV_NF = 'Driver not found';
const LICENSE_TYPES = new Set(['LMV', 'HMV', 'MCWG', 'TRANSPORT', 'OTHER']);
const DRIVER_STATUSES = new Set(['available', 'assigned', 'on_trip', 'leave', 'inactive']);

const DRIVER_POPULATE = [
  { path: 'transport_agent', select: 'agent_code agent_name agent_type mobile status' },
  { path: 'assigned_vehicle', select: 'vehicle_no vehicle_type status' },
];

const DRIVER_CODE_PREFIX = 'DR';

async function nextDriverCode() {
  const rows = await getModels()
    .Driver.find({ driver_code: new RegExp(`^${DRIVER_CODE_PREFIX}\\d+$`, 'i') })
    .select('driver_code')
    .lean();
  let max = 0;
  for (const row of rows) {
    const m = String(row.driver_code || '').match(new RegExp(`^${DRIVER_CODE_PREFIX}(\\d+)$`, 'i'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${DRIVER_CODE_PREFIX}${String(max + 1).padStart(4, '0')}`;
}

const PATCHABLE_KEYS = Object.freeze([
  'name',
  'phone',
  'alternate_phone',
  'transport_agent',
  'assigned_vehicle',
  'license_no',
  'license_type',
  'license_expiry',
  'joining_date',
  'emergency_contact_name',
  'emergency_contact_phone',
  'status',
  'remarks',
  'is_active',
]);

function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  for (const k of PATCHABLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    let v = patch[k];
    if (k === 'name' && typeof v === 'string') v = v.trim();
    if (k === 'license_no' && typeof v === 'string') v = v.trim().toUpperCase();
    if (k === 'license_type' && v && !LICENSE_TYPES.has(v)) throw new ApiError(400, 'Invalid license_type');
    if (k === 'status' && !DRIVER_STATUSES.has(v)) throw new ApiError(400, 'Invalid status');
    if (k === 'license_expiry' || k === 'joining_date') v = v ? new Date(v) : undefined;
    if (k === 'assigned_vehicle' && (v === '' || v == null)) v = undefined;
    out[k] = v;
  }
  return out;
}

async function list(query = {}) {
  const q = {};
  if (query.transport_agent) q.transport_agent = query.transport_agent;
  const rows = await getModels()
    .Driver.find(q)
    .populate(DRIVER_POPULATE)
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().Driver.findById(id).populate(DRIVER_POPULATE).lean();
  if (!row) throw new ApiError(404, DRV_NF);
  return toPlain(row);
}

async function create(body, user) {
  if (!body.transport_agent) {
    throw new ApiError(400, 'transport_agent is required');
  }
  const driverCode = await nextDriverCode();

  const doc = await getModels().Driver.create({
    driver_code: driverCode,
    name: String(body.name || '').trim(),
    phone: String(body.phone || '').trim(),
    alternate_phone: body.alternate_phone != null ? String(body.alternate_phone).trim() : '',
    transport_agent: body.transport_agent,
    assigned_vehicle: body.assigned_vehicle || undefined,
    license_no: body.license_no != null ? String(body.license_no).trim().toUpperCase() : '',
    license_type: body.license_type && LICENSE_TYPES.has(body.license_type) ? body.license_type : undefined,
    license_expiry: body.license_expiry ? new Date(body.license_expiry) : undefined,
    joining_date: body.joining_date ? new Date(body.joining_date) : undefined,
    emergency_contact_name: body.emergency_contact_name || '',
    emergency_contact_phone: body.emergency_contact_phone || '',
    status: body.status && DRIVER_STATUSES.has(body.status) ? body.status : 'available',
    remarks: body.remarks != null ? String(body.remarks).trim() : '',
    is_active: body.is_active !== false,
    created_by: user?._id,
    updated_by: user?._id,
  });
  if (!doc.name || !doc.phone) throw new ApiError(400, 'name and phone are required');
  return get(doc._id);
}

async function update(id, patch, user) {
  await get(id);
  const next = sanitizePatch(patch);
  if (user?._id) next.updated_by = user._id;
  await getModels().Driver.findByIdAndUpdate(id, { $set: next }, { new: true });
  return get(id);
}

async function listDeleted() {
  const rows = await listDeletedLean(getModels().Driver, {});
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().Driver, id, { notFoundMessage: DRV_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'driver',
    entity_id: plain._id,
    action: 'deleted',
    message: `Driver ${plain.name} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().Driver, id, { notFoundMessage: DRV_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'driver',
    entity_id: plain._id,
    action: 'restored',
    message: `Driver ${plain.name} restored`,
  });
  return plain;
}

module.exports = { list, get, create, update, listDeleted, softDelete, restore };
