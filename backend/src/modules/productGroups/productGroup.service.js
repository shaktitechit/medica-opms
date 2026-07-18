/**
 * @fileoverview ProductGroups: business rules and mongoose persistence helpers.
 * @module modules/productGroups/productGroup.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');

async function list(query = {}) {
  const { ProductGroup } = getModels();
  const filter = { deletedAt: null };

  if (query.search) {
    filter.name = { $regex: String(query.search).trim(), $options: 'i' };
  }

  // Accept either `is_active` or `status` (active|inactive|all), matching parties/products APIs.
  if (query.is_active !== undefined && query.is_active !== '') {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  } else if (query.status && query.status !== 'all') {
    if (query.status === 'active') {
      filter.is_active = { $ne: false };
    } else if (query.status === 'inactive') {
      filter.is_active = false;
    }
  }

  if (query.is_featured != null && query.is_featured !== '' && query.is_featured !== 'all') {
    const featuredRaw = String(query.is_featured).toLowerCase();
    if (featuredRaw === 'true' || featuredRaw === '1') {
      filter.is_featured = true;
    } else if (featuredRaw === 'false' || featuredRaw === '0') {
      filter.is_featured = { $ne: true };
    }
  }

  const limit = parseInt(query.limit, 10) || 100;
  const page = parseInt(query.page, 10) || 1;
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    ProductGroup.countDocuments(filter),
    ProductGroup.find(filter)
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
  const { ProductGroup } = getModels();
  const row = await ProductGroup.findOne({ _id: id, deletedAt: null }).lean();
  if (!row) throw new ApiError(404, 'Product Group not found');
  return toPlain(row);
}

async function create(body, user) {
  const { ProductGroup } = getModels();
  const name = String(body.name).trim();

  // Unique validation
  const existing = await ProductGroup.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, deletedAt: null });
  if (existing) throw new ApiError(400, `Product Group with name "${name}" already exists`);

  const doc = await ProductGroup.create({
    name,
    description: body.description ? String(body.description).trim() : undefined,
    is_active: body.is_active !== false,
    is_featured: !!body.is_featured,
    created_by: user?._id,
  });

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_group',
    entity_id: doc._id,
    action: 'created',
    message: `Product Group "${name}" created.`,
  });

  return toPlain(doc.toObject());
}

async function update(id, body, user) {
  const { ProductGroup } = getModels();
  const doc = await ProductGroup.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Product Group not found');

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, 'name cannot be empty');
    
    // Unique validation
    const existing = await ProductGroup.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      deletedAt: null
    });
    if (existing) throw new ApiError(400, `Product Group with name "${name}" already exists`);

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
    entity_type: 'product_group',
    entity_id: doc._id,
    action: 'updated',
    message: `Product Group "${doc.name}" updated.`,
  });

  return toPlain(doc.toObject());
}

async function softDelete(id, user) {
  const { ProductGroup } = getModels();
  const doc = await ProductGroup.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Product Group not found');

  doc.deletedAt = new Date();
  doc.updated_by = user?._id;
  await doc.save();

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_group',
    entity_id: doc._id,
    action: 'deleted',
    message: `Product Group "${doc.name}" soft deleted.`,
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
  const { findProductsLean, attachProductRefs } = require('../products/productRefs');
  const { Product, ProductGroup } = getModels();
  const group = await ProductGroup.findOne({ _id: id, deletedAt: null }).lean();

  const rows = await findProductsLean({ product_group: id, deletedAt: null });

  // Legacy rows may still store the group name as a plain string (not ObjectId).
  // Query those via the native collection to avoid Mongoose cast errors.
  if (group?.name) {
    const legacy = await Product.collection
      .find({ deletedAt: null, product_group: group.name })
      .toArray();
    await attachProductRefs(legacy);
    const seen = new Set(rows.map((r) => String(r._id)));
    for (const row of legacy) {
      if (!seen.has(String(row._id))) rows.push(row);
    }
  }

  return rows.map(toPlain);
}

async function associateProducts(id, productIds, user) {
  if (!Array.isArray(productIds)) throw new ApiError(400, 'productIds must be an array of strings');
  const { Product } = getModels();

  await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { product_group: id, updated_by: user?._id } }
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
