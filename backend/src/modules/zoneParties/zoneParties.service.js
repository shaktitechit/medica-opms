/**
 * @fileoverview ZoneParties: business rules and mongoose persistence helpers.
 * @module modules/zoneParties/zoneParties.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');

async function list(query = {}) {
  const { Zone } = getModels();
  const filter = { deletedAt: null };

  if (query.search) {
    filter.name = { $regex: String(query.search).trim(), $options: 'i' };
  }

  if (query.is_active !== undefined && query.is_active !== '') {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  } else if (query.status && query.status !== 'all') {
    if (query.status === 'active') {
      filter.is_active = { $ne: false };
    } else if (query.status === 'inactive') {
      filter.is_active = false;
    }
  }

  const limit = parseInt(query.limit, 10) || 100;
  const page = parseInt(query.page, 10) || 1;
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    Zone.countDocuments(filter),
    Zone.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .populate('parties')
      .populate('sales_persons')
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

async function get(id) {
  const { Zone } = getModels();
  const record = await Zone.findOne({ _id: id, deletedAt: null })
    .populate('parties')
    .populate('sales_persons')
    .lean();
  if (!record) throw new ApiError(404, 'Zone not found');
  return toPlain(record);
}

async function create(body, user) {
  const { Zone } = getModels();
  const name = String(body.name || '').trim();

  const dup = await Zone.findOne({ name, deletedAt: null }).lean();
  if (dup) throw new ApiError(409, `Zone named "${name}" already exists`);

  const doc = new Zone({
    name,
    description: body.description,
    is_active: body.is_active !== false,
    parties: body.parties || [],
    sales_persons: body.sales_persons || [],
    created_by: user?._id,
  });

  await doc.save();
  const res = doc.toObject();

  await activityService.create({
    actor: user?._id,
    entity_type: 'party',
    entity_id: doc._id,
    action: 'created',
    message: `Created zone: ${name}`,
  });

  return toPlain(res);
}

async function update(id, body, user) {
  const { Zone } = getModels();
  const record = await Zone.findOne({ _id: id, deletedAt: null });
  if (!record) throw new ApiError(404, 'Zone not found');

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError(400, 'name is required');

    const dup = await Zone.findOne({ name, _id: { $ne: id }, deletedAt: null }).lean();
    if (dup) throw new ApiError(409, `Zone named "${name}" already exists`);

    record.name = name;
  }

  if (body.description !== undefined) record.description = body.description;
  if (body.is_active !== undefined) record.is_active = body.is_active === true || body.is_active === 'true';
  if (body.parties !== undefined) record.parties = body.parties;
  if (body.sales_persons !== undefined) record.sales_persons = body.sales_persons;

  record.updated_by = user?._id;
  await record.save();

  await activityService.create({
    actor: user?._id,
    entity_type: 'party',
    entity_id: id,
    action: 'updated',
    message: `Updated zone: ${record.name}`,
  });

  return toPlain(record.toObject());
}

async function softDelete(id, user) {
  const { Zone } = getModels();
  const record = await Zone.findOne({ _id: id, deletedAt: null });
  if (!record) throw new ApiError(404, 'Zone not found');

  record.deletedAt = new Date();
  record.updated_by = user?._id;
  await record.save();

  await activityService.create({
    actor: user?._id,
    entity_type: 'party',
    entity_id: id,
    action: 'deleted',
    message: `Deleted zone: ${record.name}`,
  });

  return { success: true };
}

async function getParties(id) {
  const { Zone } = getModels();
  const record = await Zone.findOne({ _id: id, deletedAt: null }).populate('parties').lean();
  if (!record) throw new ApiError(404, 'Zone not found');
  return (record.parties || []).map(toPlain);
}

async function associateParties(id, partyIds, user) {
  if (!Array.isArray(partyIds)) throw new ApiError(400, 'partyIds must be an array of strings');
  const { Zone } = getModels();

  const record = await Zone.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { parties: partyIds, updated_by: user?._id } },
    { new: true }
  );
  if (!record) throw new ApiError(404, 'Zone not found');

  await activityService.create({
    actor: user?._id,
    entity_type: 'party',
    entity_id: id,
    action: 'updated',
    message: `Associated ${partyIds.length} parties to zone ${record.name}`,
  });

  return { success: true, count: partyIds.length };
}

async function getSalesPersons(id) {
  const { Zone } = getModels();
  const record = await Zone.findOne({ _id: id, deletedAt: null }).populate('sales_persons').lean();
  if (!record) throw new ApiError(404, 'Zone not found');
  return (record.sales_persons || []).map(toPlain);
}

async function associateSalesPersons(id, salesPersonIds, user) {
  if (!Array.isArray(salesPersonIds)) throw new ApiError(400, 'salesPersonIds must be an array of strings');
  const { Zone } = getModels();

  const record = await Zone.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { sales_persons: salesPersonIds, updated_by: user?._id } },
    { new: true }
  );
  if (!record) throw new ApiError(404, 'Zone not found');

  await activityService.create({
    actor: user?._id,
    entity_type: 'party',
    entity_id: id,
    action: 'updated',
    message: `Associated ${salesPersonIds.length} sales persons to zone ${record.name}`,
  });

  return { success: true, count: salesPersonIds.length };
}

module.exports = {
  list,
  get,
  create,
  update,
  softDelete,
  getParties,
  associateParties,
  getSalesPersons,
  associateSalesPersons,
};
