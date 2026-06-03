/**
 * @fileoverview Fleet: business rules and mongoose persistence helpers.
 * @module modules/fleet/vehicle.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');

const VEH_NF = 'Vehicle not found';
const VEHICLE_TYPES = new Set([
  'bike',
  'three_wheeler',
  'pickup',
  'mini_truck',
  'truck',
  'container',
  'other',
]);
const OWNERSHIP_TYPES = new Set(['owned', 'attached', 'rented', 'third_party']);
const VEHICLE_STATUSES = new Set(['available', 'assigned', 'in_transit', 'maintenance', 'inactive']);

const VEHICLE_POPULATE = [{ path: 'transport_agent', select: 'agent_code agent_name agent_type mobile status' }];

const PATCHABLE_KEYS = Object.freeze([
  'transport_agent',
  'vehicle_type',
  'ownership_type',
  'status',
  'make',
  'model',
  'capacity_kg',
  'capacity_cft',
  'insurance_expiry',
  'fitness_expiry',
  'pollution_expiry',
  'registration_expiry',
  'remarks',
  'is_active',
]);

function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  for (const k of PATCHABLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    let v = patch[k];
    if (k === 'vehicle_type' && !VEHICLE_TYPES.has(v)) throw new ApiError(400, 'Invalid vehicle_type');
    if (k === 'ownership_type' && !OWNERSHIP_TYPES.has(v)) throw new ApiError(400, 'Invalid ownership_type');
    if (k === 'status' && !VEHICLE_STATUSES.has(v)) throw new ApiError(400, 'Invalid status');
    if (k === 'capacity_kg' || k === 'capacity_cft') v = v === '' || v == null ? undefined : Number(v);
    if (k === 'insurance_expiry' || k === 'fitness_expiry' || k === 'pollution_expiry' || k === 'registration_expiry') {
      v = v ? new Date(v) : undefined;
    }
    if (k === 'transport_agent' && (v === '' || v == null)) v = undefined;
    out[k] = v;
  }
  return out;
}

async function list(query = {}) {
  const q = {};
  if (query.transport_agent) q.transport_agent = query.transport_agent;
  const rows = await getModels()
    .Vehicle.find(q)
    .populate(VEHICLE_POPULATE)
    .sort({ createdAt: -1 })
    .lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().Vehicle.findById(id).populate(VEHICLE_POPULATE).lean();
  if (!row) throw new ApiError(404, VEH_NF);
  return toPlain(row);
}

async function create(body, user) {
  const vehicleType =
    body.vehicle_type && VEHICLE_TYPES.has(body.vehicle_type) ? body.vehicle_type : 'pickup';
  const doc = await getModels().Vehicle.create({
    vehicle_no: String(body.vehicle_no || '').toUpperCase().trim(),
    transport_agent: body.transport_agent || undefined,
    vehicle_type: vehicleType,
    ownership_type:
      body.ownership_type && OWNERSHIP_TYPES.has(body.ownership_type) ? body.ownership_type : 'owned',
    status: body.status && VEHICLE_STATUSES.has(body.status) ? body.status : 'available',
    make: body.make != null ? String(body.make).trim() : '',
    model: body.model != null ? String(body.model).trim() : '',
    capacity_kg: body.capacity_kg != null && body.capacity_kg !== '' ? Number(body.capacity_kg) : undefined,
    capacity_cft: body.capacity_cft != null && body.capacity_cft !== '' ? Number(body.capacity_cft) : undefined,
    insurance_expiry: body.insurance_expiry ? new Date(body.insurance_expiry) : undefined,
    fitness_expiry: body.fitness_expiry ? new Date(body.fitness_expiry) : undefined,
    pollution_expiry: body.pollution_expiry ? new Date(body.pollution_expiry) : undefined,
    registration_expiry: body.registration_expiry ? new Date(body.registration_expiry) : undefined,
    remarks: body.remarks != null ? String(body.remarks).trim() : '',
    is_active: body.is_active !== false,
    created_by: user?._id,
    updated_by: user?._id,
  });
  const plain = toPlain(doc.toObject());
  if (plain.transport_agent) {
    return get(plain._id);
  }
  return plain;
}

async function update(id, patch, user) {
  await get(id);
  const next = sanitizePatch(patch);
  if (patch.vehicle_no !== undefined) {
    next.vehicle_no = String(patch.vehicle_no).toUpperCase().trim();
  }
  if (user?._id) next.updated_by = user._id;
  await getModels().Vehicle.findByIdAndUpdate(id, { $set: next }, { new: true });
  return get(id);
}

async function listDeleted() {
  const rows = await listDeletedLean(getModels().Vehicle, {});
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().Vehicle, id, { notFoundMessage: VEH_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'vehicle',
    entity_id: plain._id,
    action: 'deleted',
    message: `Vehicle ${plain.vehicle_no} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().Vehicle, id, { notFoundMessage: VEH_NF });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'vehicle',
    entity_id: plain._id,
    action: 'restored',
    message: `Vehicle ${plain.vehicle_no} restored`,
  });
  return plain;
}

module.exports = { list, get, create, update, listDeleted, softDelete, restore };
