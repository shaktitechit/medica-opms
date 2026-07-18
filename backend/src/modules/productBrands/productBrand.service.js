/**
 * @fileoverview ProductBrands: business rules and mongoose persistence helpers.
 * @module modules/productBrands/productBrand.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const activityService = require('../activity/activity.service');

async function list(query = {}) {
  const { ProductBrand } = getModels();
  const filter = { deletedAt: null };

  if (query.search) {
    filter.name = { $regex: String(query.search).trim(), $options: 'i' };
  }
  if (query.is_active !== undefined && query.is_active !== '') {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  }

  const limit = parseInt(query.limit, 10) || 100;
  const page = parseInt(query.page, 10) || 1;
  const skip = (page - 1) * limit;

  const [total, rows] = await Promise.all([
    ProductBrand.countDocuments(filter),
    ProductBrand.find(filter)
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
  const { ProductBrand } = getModels();
  const row = await ProductBrand.findOne({ _id: id, deletedAt: null }).lean();
  if (!row) throw new ApiError(404, 'Product Brand not found');
  return toPlain(row);
}

async function create(body, user) {
  const { ProductBrand } = getModels();
  const name = String(body.name).trim();

  // Unique validation
  const existing = await ProductBrand.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, deletedAt: null });
  if (existing) throw new ApiError(400, `Product Brand with name "${name}" already exists`);

  const doc = await ProductBrand.create({
    name,
    description: body.description ? String(body.description).trim() : undefined,
    is_active: body.is_active !== false,
    is_featured: !!body.is_featured,
    created_by: user?._id,
  });

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_brand',
    entity_id: doc._id,
    action: 'created',
    message: `Product Brand "${name}" created.`,
  });

  return toPlain(doc.toObject());
}

async function update(id, body, user) {
  const { ProductBrand } = getModels();
  const doc = await ProductBrand.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Product Brand not found');

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, 'name cannot be empty');

    // Unique validation
    const existing = await ProductBrand.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      deletedAt: null
    });
    if (existing) throw new ApiError(400, `Product Brand with name "${name}" already exists`);

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
    entity_type: 'product_brand',
    entity_id: doc._id,
    action: 'updated',
    message: `Product Brand "${doc.name}" updated.`,
  });

  return toPlain(doc.toObject());
}

async function softDelete(id, user) {
  const { ProductBrand } = getModels();
  const doc = await ProductBrand.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Product Brand not found');

  doc.deletedAt = new Date();
  doc.updated_by = user?._id;
  await doc.save();

  await activityService.create({
    actor: user?._id,
    entity_type: 'product_brand',
    entity_id: doc._id,
    action: 'deleted',
    message: `Product Brand "${doc.name}" soft deleted.`,
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
  const rows = await Product.find({ brand: id, deletedAt: null })
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
    { $set: { brand: id, updated_by: user?._id } }
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
