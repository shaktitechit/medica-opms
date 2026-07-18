/**
 * @fileoverview ProductSubgroups: business rules and mongoose persistence helpers.
 * @module modules/productSubgroups/productSubgroup.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');

async function list(query = {}) {
  const { ProductSubgroup } = getModels();
  const filter = { deletedAt: null };

  if (query.search) {
    filter.name = { $regex: String(query.search).trim(), $options: 'i' };
  }
  if (query.group) {
    filter.group = query.group;
  }
  if (query.is_active !== undefined && query.is_active !== '') {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  }

  const limit = parseInt(query.limit, 10) || 100;
  const page = parseInt(query.page, 10) || 1;
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    ProductSubgroup.countDocuments(filter),
    ProductSubgroup.find(filter)
      .populate('group', 'name')
      .sort({ name: 1 })
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

async function get(id) {
  const { ProductSubgroup } = getModels();
  const row = await ProductSubgroup.findOne({ _id: id, deletedAt: null }).populate('group', 'name').lean();
  if (!row) throw new ApiError(404, 'Product Subgroup not found');
  return toPlain(row);
}

async function create(body, user) {
  const { ProductGroup, ProductSubgroup } = getModels();
  const name = String(body.name).trim();

  // Validate group exists
  const groupDoc = await ProductGroup.findOne({ _id: body.group, deletedAt: null });
  if (!groupDoc) throw new ApiError(404, 'Product Group not found');

  // Unique validation per group
  const existing = await ProductSubgroup.findOne({
    name: { $regex: new RegExp(`^${name}$`, 'i') },
    group: body.group,
    deletedAt: null
  });
  if (existing) throw new ApiError(400, `Product Subgroup with name "${name}" already exists in this group`);

  const doc = await ProductSubgroup.create({
    name,
    group: body.group,
    description: body.description ? String(body.description).trim() : undefined,
    is_active: body.is_active !== false,
    is_featured: !!body.is_featured,
    created_by: user?._id,
  });

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_subgroup',
    entity_id: doc._id,
    action: 'created',
    message: `Product Subgroup "${name}" created under group "${groupDoc.name}".`,
  });

  return get(doc._id);
}

async function update(id, body, user) {
  const { ProductGroup, ProductSubgroup } = getModels();
  const doc = await ProductSubgroup.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Product Subgroup not found');

  const groupId = body.group !== undefined ? body.group : doc.group;
  if (body.group !== undefined) {
    const groupDoc = await ProductGroup.findOne({ _id: body.group, deletedAt: null });
    if (!groupDoc) throw new ApiError(404, 'Product Group not found');
    doc.group = body.group;
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, 'name cannot be empty');

    // Unique validation per group
    const existing = await ProductSubgroup.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      group: groupId,
      deletedAt: null
    });
    if (existing) throw new ApiError(400, `Product Subgroup with name "${name}" already exists in this group`);

    doc.name = name;
  }

  if (body.description !== undefined) {
    doc.description = body.description ? String(body.description).trim() : null;
  }
  if (body.is_active !== undefined) {
    doc.is_active = !!body.is_active;
  }
  if (body.is_featured !== undefined) {
    doc.is_featured = !!body.is_featured;
  }
  doc.updated_by = user?._id;

  await doc.save();

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_subgroup',
    entity_id: doc._id,
    action: 'updated',
    message: `Product Subgroup "${doc.name}" updated.`,
  });

  return get(doc._id);
}

async function softDelete(id, user) {
  const { ProductSubgroup } = getModels();
  const doc = await ProductSubgroup.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Product Subgroup not found');

  doc.deletedAt = new Date();
  doc.updated_by = user?._id;
  await doc.save();

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_subgroup',
    entity_id: doc._id,
    action: 'deleted',
    message: `Product Subgroup "${doc.name}" soft deleted.`,
  });

  return { success: true };
}

async function bulkCreate(bodies, user) {
  if (!Array.isArray(bodies)) throw new ApiError(400, 'Array of objects required');
  const results = [];
  for (const body of bodies) {
    try {
      const res = await create(body, user);
      results.push({ success: true, data: res });
    } catch (err) {
      results.push({ success: false, error: err.message, input: body });
    }
  }
  return results;
}

async function bulkDelete(ids, user) {
  if (!Array.isArray(ids)) throw new ApiError(400, 'Array of IDs required');
  const results = [];
  for (const id of ids) {
    try {
      await softDelete(id, user);
      results.push({ success: true, id });
    } catch (err) {
      results.push({ success: false, error: err.message, id });
    }
  }
  return results;
}

async function getProducts(id) {
  const { Product } = getModels();
  const rows = await Product.find({ product_subgroup: id, deletedAt: null })
    .populate('product_group')
    .populate('product_subgroup')
    .populate('brand')
    .populate('manufacturer')
    .lean();
  return rows.map(toPlain);
}

async function associateProducts(id, productIds, user) {
  if (!Array.isArray(productIds)) throw new ApiError(400, 'productIds must be an array of strings');
  const { Product } = getModels();

  await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { product_subgroup: id, updated_by: user?._id } }
  );

  return { success: true, count: productIds.length };
}

module.exports = {
  list,
  get,
  create,
  update,
  softDelete,
  bulkCreate,
  bulkDelete,
  getProducts,
  associateProducts,
};
