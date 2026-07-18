/**
 * @fileoverview Products: business rules and mongoose persistence helpers.
 * @module modules/products/product.service
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const { isObjectId, findProductsLean } = require('./productRefs');

const nf = 'Product not found';
const { PRODUCT_UNITS } = require('./product.validation');

const PATCHABLE_KEYS = Object.freeze([
  'product_name',
  'generic_name',
  'aliases',
  'sku',
  'product_group',
  'product_subgroup',
  'brand',
  'manufacturer',
  'unit',
  'base_price',
  'minimum_sale_rate',
  'mrp',
  'gst_percent',
  'warranty_months',
  'description',
  'tags',
  'is_active',
  'is_featured',
]);

function coerceNonNegNumber(raw, label) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${label} must be a non-negative number`);
  return n;
}

function coerceNonNegInt(raw, label) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new ApiError(400, `${label} must be a non-negative integer`);
  }
  return n;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRefInput(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object') {
    if (val._id != null) return String(val._id);
    if (val.name != null && String(val.name).trim()) return String(val.name).trim();
    return null;
  }
  const s = String(val).trim();
  return s || null;
}

/**
 * Resolve name/ObjectId inputs to Product* ObjectIds.
 * @param {object} payload
 * @param {object|null} user
 * @param {object|null} [existing] current product doc (for subgroup → group fallback)
 */
async function resolveProductRefs(payload, user, existing = null) {
  const { ProductGroup, ProductSubgroup, ProductBrand, ProductManufacturer } = getModels();

  const fields = [
    { key: 'product_group', model: ProductGroup },
    { key: 'brand', model: ProductBrand },
    { key: 'manufacturer', model: ProductManufacturer },
  ];

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field.key)) continue;
    const normalized = normalizeRefInput(payload[field.key]);
    if (normalized == null) {
      payload[field.key] = null;
      continue;
    }
    if (isObjectId(normalized)) {
      payload[field.key] = normalized;
      continue;
    }
    let doc = await field.model.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
      deletedAt: null,
    });
    if (!doc) {
      doc = await field.model.create({ name: normalized, created_by: user?._id });
    }
    payload[field.key] = doc._id;
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'product_subgroup')) return;

  const normalizedSub = normalizeRefInput(payload.product_subgroup);
  if (normalizedSub == null) {
    payload.product_subgroup = null;
    return;
  }
  if (isObjectId(normalizedSub)) {
    payload.product_subgroup = normalizedSub;
    return;
  }

  // Prefer group from this patch; else keep the product's existing group.
  const groupRef =
    payload.product_group != null
      ? payload.product_group
      : existing?.product_group != null
        ? existing.product_group
        : null;

  if (!groupRef) {
    // No group context — match by name alone, or clear.
    const alone = await ProductSubgroup.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(normalizedSub)}$`, 'i') },
      deletedAt: null,
    });
    payload.product_subgroup = alone?._id || null;
    return;
  }

  let subgroup = await ProductSubgroup.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(normalizedSub)}$`, 'i') },
    group: groupRef,
    deletedAt: null,
  });
  if (!subgroup) {
    subgroup = await ProductSubgroup.create({
      name: normalizedSub,
      group: groupRef,
      created_by: user?._id,
    });
  }
  payload.product_subgroup = subgroup._id;
}

/** Allowlisted PATCH aligned with mongoRegistry Product schema. */
function sanitizePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};

  for (const k of PATCHABLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    const v = patch[k];

    if (k === 'product_name') {
      const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
      if (!s) throw new ApiError(400, 'product_name cannot be empty');
      out[k] = s;
      continue;
    }

    if (k === 'generic_name' || k === 'product_group' || k === 'product_subgroup' || k === 'brand' || k === 'manufacturer') {
      if (v === null || v === '') {
        out[k] = null;
        continue;
      }
      // Keep string names/ids, or {_id}/{name} objects for resolveProductRefs.
      if (typeof v === 'object') {
        out[k] = v;
        continue;
      }
      out[k] = typeof v === 'string' ? v.trim() : String(v).trim();
      continue;
    }

    if (k === 'sku') {
      if (v === null) {
        out[k] = null;
        continue;
      }
      const s = typeof v === 'string' ? v.trim().toUpperCase() : String(v ?? '').trim().toUpperCase();
      out[k] = s || null;
      continue;
    }

    if (k === 'description') {
      if (v === null || v === '') {
        out[k] = '';
        continue;
      }
      out[k] = typeof v === 'string' ? v.trim() : String(v).trim();
      continue;
    }

    if (k === 'unit') {
      const u = typeof v === 'string' ? v.trim() : String(v ?? '').trim();
      if (!PRODUCT_UNITS.has(u)) throw new ApiError(400, 'Invalid unit');
      out[k] = u;
      continue;
    }

    if (k === 'base_price' || k === 'minimum_sale_rate' || k === 'mrp') {
      if (v === null || v === '') continue;
      out[k] = coerceNonNegNumber(v, k);
      continue;
    }

    if (k === 'gst_percent') {
      const g = coerceNonNegNumber(v, 'gst_percent');
      if (g > 100) throw new ApiError(400, 'gst_percent cannot exceed 100');
      out[k] = g;
      continue;
    }

    if (k === 'warranty_months') {
      if (v === null || v === '') continue;
      out[k] = coerceNonNegInt(v, 'warranty_months');
      continue;
    }

    if (k === 'aliases' || k === 'tags') {
      if (!Array.isArray(v)) {
        throw new ApiError(400, `${k} must be an array`);
      }
      out[k] = v.map(item => String(item ?? '').trim().toLowerCase()).filter(Boolean);
      continue;
    }

    if (k === 'is_active' || k === 'is_featured') {
      out[k] = Boolean(v);
    }
  }

  return out;
}

async function list(query = {}) {
  const { Product, ProductGroup, ProductBrand, ProductManufacturer } = getModels();

  const paginate = query.paginate === 'true';
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.max(Number(query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const mongoFilter = { deletedAt: null };

  if (query.search && String(query.search).trim()) {
    const s = String(query.search).trim();
    const [matchingGroups, matchingBrands, matchingMfrs] = await Promise.all([
      ProductGroup.find({ name: { $regex: s, $options: 'i' } }, '_id'),
      ProductBrand.find({ name: { $regex: s, $options: 'i' } }, '_id'),
      ProductManufacturer.find({ name: { $regex: s, $options: 'i' } }, '_id'),
    ]);

    mongoFilter.$or = [
      { product_name: { $regex: s, $options: 'i' } },
      { generic_name: { $regex: s, $options: 'i' } },
      { sku: { $regex: s, $options: 'i' } },
      { product_group: { $in: matchingGroups.map(g => g._id) } },
      { brand: { $in: matchingBrands.map(b => b._id) } },
      { manufacturer: { $in: matchingMfrs.map(m => m._id) } }
    ];
  }

  if (query.group && query.group !== 'all') {
    const groupDoc = await ProductGroup.findOne({ name: { $regex: new RegExp(`^${query.group.trim()}$`, 'i') } });
    if (groupDoc) {
      mongoFilter.product_group = groupDoc._id;
    } else {
      mongoFilter.product_group = new mongoose.Types.ObjectId();
    }
  }

  if (query.status && query.status !== 'all') {
    if (query.status === 'active') {
      mongoFilter.is_active = { $ne: false };
    } else if (query.status === 'inactive') {
      mongoFilter.is_active = false;
    }
  }

  if (query.is_featured != null && query.is_featured !== '' && query.is_featured !== 'all') {
    const featuredRaw = String(query.is_featured).toLowerCase();
    if (featuredRaw === 'true' || featuredRaw === '1') {
      mongoFilter.is_featured = true;
    } else if (featuredRaw === 'false' || featuredRaw === '0') {
      mongoFilter.is_featured = { $ne: true };
    }
  }

  if (paginate) {
    const [total, rows, distinctGroupIds] = await Promise.all([
      Product.countDocuments(mongoFilter),
      findProductsLean(mongoFilter, {
        sort: { createdAt: -1 },
        skip,
        limit,
      }),
      Product.distinct('product_group', { deletedAt: null }),
    ]);

    const validGroupIds = [];
    const legacyGroupNames = [];
    for (const id of distinctGroupIds) {
      if (id == null || id === '') continue;
      if (isObjectId(id)) validGroupIds.push(id);
      else legacyGroupNames.push(String(id));
    }

    let groupsList = [];
    if (validGroupIds.length) {
      try {
        groupsList = await ProductGroup.find(
          { _id: { $in: validGroupIds }, deletedAt: null },
          'name',
        ).lean();
      } catch {
        groupsList = [];
      }
    }
    const groups = [...groupsList.map((g) => g.name), ...legacyGroupNames];

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      groups: groups.filter(Boolean).sort(),
      data: rows.map(toPlain),
    };
  }

  const rows = await findProductsLean(mongoFilter, { sort: { createdAt: -1 } });
  return rows.map(toPlain);
}

async function get(id) {
  const rows = await findProductsLean({ _id: id, deletedAt: null });
  const row = rows[0];
  if (!row) throw new ApiError(404, nf);
  return toPlain(row);
}

async function create(body, user) {
  const skuTrim = body.sku != null ? String(body.sku).trim().toUpperCase() : '';
  const gstPercent = Number(body.gst_percent ?? 18);
  if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 100) {
    throw new ApiError(400, 'Invalid GST percent');
  }

  const basePrice = Number(body.base_price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new ApiError(400, 'Invalid base_price');
  }

  const minSaleRate = Number(body.minimum_sale_rate);
  if (!Number.isFinite(minSaleRate) || minSaleRate < 0) {
    throw new ApiError(400, 'Invalid minimum_sale_rate');
  }

  const unitRaw = body.unit != null && String(body.unit).trim() ? String(body.unit).trim() : 'pcs';
  if (!PRODUCT_UNITS.has(unitRaw)) throw new ApiError(400, 'Invalid unit');

  const payload = {
    product_name: String(body.product_name).trim(),
    generic_name: body.generic_name != null ? String(body.generic_name).trim() : '',
    aliases: Array.isArray(body.aliases) ? body.aliases.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean) : [],
    sku: skuTrim || undefined,
    product_group: body.product_group,
    product_subgroup: body.product_subgroup,
    brand: body.brand,
    manufacturer: body.manufacturer,
    unit: unitRaw,
    base_price: basePrice,
    minimum_sale_rate: minSaleRate,
    gst_percent: gstPercent,
    is_active: body.is_active !== false,
    is_featured: body.is_featured === true,
  };

  const desc = body.description != null ? String(body.description).trim() : '';
  if (desc) payload.description = desc;

  const mrp = body.mrp;
  if (mrp !== undefined && mrp !== null && mrp !== '') payload.mrp = coerceNonNegNumber(mrp, 'mrp');

  const wm = body.warranty_months;
  if (wm !== undefined && wm !== null && wm !== '') {
    payload.warranty_months = coerceNonNegInt(wm, 'warranty_months');
  }

  if (Array.isArray(body.tags)) {
    payload.tags = body.tags.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
  }

  if (user) {
    payload.created_by = user._id;
  }

  await resolveProductRefs(payload, user);

  const doc = await getModels().Product.create(payload);
  const [populatedDoc] = await findProductsLean({ _id: doc._id });
  const plain = toPlain(populatedDoc);

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain._id,
      action: 'created',
      message: `Product ${plain.product_name}`,
    });
  }
  return plain;
}

async function update(id, patch, user) {
  const doc = await getModels().Product.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, nf);

  const sanitized = sanitizePatch(patch);
  if (Object.keys(sanitized).length === 0) {
    throw new ApiError(400, 'No valid fields to patch');
  }

  await resolveProductRefs(sanitized, user, doc);

  if (user) {
    sanitized.updated_by = user._id;
  }

  for (const [k, v] of Object.entries(sanitized)) {
    doc.set(k, v);
  }

  await doc.save();

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: id,
      action: 'updated',
      message: 'Product updated',
    });
  }

  const [populatedDoc] = await findProductsLean({ _id: id, deletedAt: null });
  return toPlain(populatedDoc);
}

async function listDeleted() {
  const rows = await listDeletedLean(getModels().Product, {});
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const doc = await softDeleteActiveById(getModels().Product, id, { notFoundMessage: nf });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'product',
    entity_id: plain._id,
    action: 'deleted',
    message: `Product ${plain.product_name} soft-deleted`,
  });
  return plain;
}

async function restore(id, user) {
  const doc = await restoreSoftDeletedById(getModels().Product, id, { notFoundMessage: nf });
  const plain = toPlain(doc.toObject());
  await activityService.create({
    actor: user._id,
    entity_type: 'product',
    entity_id: plain._id,
    action: 'restored',
    message: `Product ${plain.product_name} restored`,
  });
  return plain;
}

async function bulkCreate(items, user) {
  if (!Array.isArray(items)) {
    throw new ApiError(400, 'Payload must be an array of products');
  }

  const { Product } = getModels();
  const createdProducts = [];

  for (const item of items) {
    const name = item.product_name != null ? String(item.product_name).trim() : '';
    if (!name) continue;

    const priceRaw = item.base_price ?? item.default_price;
    const basePrice = Number(priceRaw);
    if (!Number.isFinite(basePrice) || basePrice < 0) continue;

    const minSaleRateRaw = item.minimum_sale_rate ?? basePrice;
    const minSaleRate = Number(minSaleRateRaw);
    if (!Number.isFinite(minSaleRate) || minSaleRate < 0) continue;

    const skuTrim = item.sku != null ? String(item.sku).trim().toUpperCase() : '';
    const gstPercent = Number(item.gst_percent ?? item.default_gst_rate ?? item.gst_rate ?? 18);
    const unitRaw = item.unit != null && String(item.unit).trim() ? String(item.unit).trim() : 'pcs';

    const brandName = item.brand != null ? String(item.brand).trim() : '';
    const mfrName = item.manufacturer != null ? String(item.manufacturer).trim() : '';

    const payload = {
      product_name: name,
      generic_name: item.generic_name != null ? String(item.generic_name).trim() : '',
      aliases: Array.isArray(item.aliases) ? item.aliases.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean) : [],
      sku: skuTrim || undefined,
      product_group: item.product_group,
      product_subgroup: item.product_subgroup,
      brand: brandName || undefined,
      manufacturer: mfrName || undefined,
      unit: ['pcs', 'box', 'kg', 'ltr', 'meter', 'set', 'kit', 'bottle'].includes(unitRaw) ? unitRaw : 'pcs',
      base_price: basePrice,
      minimum_sale_rate: minSaleRate,
      gst_percent: gstPercent,
      is_active: item.is_active !== false,
      is_featured: item.is_featured === true,
    };

    if (item.description != null && String(item.description).trim()) {
      payload.description = String(item.description).trim();
    }
    if (item.mrp != null && item.mrp !== '') payload.mrp = Number(item.mrp);
    if (item.warranty_months != null && item.warranty_months !== '') payload.warranty_months = Math.floor(Number(item.warranty_months));
    if (Array.isArray(item.tags)) {
      payload.tags = item.tags.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean);
    }
    if (user) {
      payload.created_by = user._id;
    }

    await resolveProductRefs(payload, user);

    const doc = await Product.create(payload);
    const [populatedDoc] = await findProductsLean({ _id: doc._id });
    createdProducts.push(toPlain(populatedDoc));
  }

  if (createdProducts.length > 0 && user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: createdProducts[0]._id,
      action: 'created',
      message: `Bulk uploaded ${createdProducts.length} products`,
    });
  }

  return createdProducts;
}

async function bulkDelete(ids, user) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { count: 0, deletedIds: [] };
  }

  const { Product } = getModels();

  const docs = await Product.find({
    _id: { $in: ids },
    deletedAt: null,
  });

  const deletedIds = [];
  const deletedNames = [];

  for (const doc of docs) {
    await doc.softDelete();
    deletedIds.push(doc._id.toString());
    deletedNames.push(doc.product_name);
  }

  if (deletedIds.length > 0 && user) {
    await activityService.create({
      actor: user._id,
      entity_type: "product",
      entity_id: deletedIds[0],
      action: "deleted",
      message: `Bulk soft-deleted ${deletedIds.length} products: ${deletedNames.join(", ")}`,
    });
  }

  return {
    count: deletedIds.length,
    deletedIds,
  };
}

async function syncFromGoogleSheet(row) {
  const { Product } = getModels();

  if (!row || typeof row !== 'object') {
    throw new ApiError(400, 'Invalid row payload');
  }

  // Find by ID or SKU
  const rawId = row._id || row.id || row.product_id;
  const isMongoId = rawId && mongoose.Types.ObjectId.isValid(rawId);

  let doc = null;
  if (isMongoId) {
    doc = await Product.findOne({ _id: rawId, deletedAt: null });
  }

  const skuVal = row.sku ? String(row.sku).trim().toUpperCase() : '';
  if (!doc && skuVal) {
    doc = await Product.findOne({ sku: skuVal, deletedAt: null });
  }

  // Parse attributes
  const priceRaw = row.base_price ?? row.price ?? row.default_price;
  const basePrice = priceRaw !== undefined && priceRaw !== '' ? Number(priceRaw) : undefined;

  const minSaleRaw = row.minimum_sale_rate ?? row.min_sale_rate ?? basePrice;
  const minSaleRate = minSaleRaw !== undefined && minSaleRaw !== '' ? Number(minSaleRaw) : undefined;

  const gstRaw = row.gst_percent ?? row.gst_rate ?? row.gst;
  const gstPercent = gstRaw !== undefined && gstRaw !== '' ? Number(gstRaw) : undefined;

  const mrpRaw = row.mrp;
  const mrp = mrpRaw !== undefined && mrpRaw !== '' ? Number(mrpRaw) : undefined;

  const wmRaw = row.warranty_months ?? row.warranty;
  const warrantyMonths = wmRaw !== undefined && wmRaw !== '' ? Math.floor(Number(wmRaw)) : undefined;

  const unitRaw = row.unit ? String(row.unit).trim().toLowerCase() : undefined;
  const activeRaw = row.is_active ?? row.active;
  const isActive = activeRaw !== undefined ? (String(activeRaw).toLowerCase() === 'true' || activeRaw === true || activeRaw === '1' || activeRaw === 1) : undefined;
  const featuredRaw = row.is_featured ?? row.featured;
  const isFeatured = featuredRaw !== undefined
    ? (String(featuredRaw).toLowerCase() === 'true' || featuredRaw === true || featuredRaw === '1' || featuredRaw === 1)
    : undefined;

  const payload = {};
  if (row.product_name || row.name) payload.product_name = String(row.product_name || row.name).trim();
  if (row.generic_name || row.generic) payload.generic_name = String(row.generic_name || row.generic).trim();

  if (row.aliases) {
    payload.aliases = Array.isArray(row.aliases)
      ? row.aliases.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean)
      : String(row.aliases).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  }

  if (skuVal) payload.sku = skuVal;
  if (row.product_group || row.group) payload.product_group = String(row.product_group || row.group).trim();
  if (row.product_subgroup || row.subgroup) payload.product_subgroup = String(row.product_subgroup || row.subgroup).trim();
  if (row.brand) payload.brand = String(row.brand).trim();
  if (row.manufacturer) payload.manufacturer = String(row.manufacturer).trim();

  if (unitRaw && ['pcs', 'box', 'kg', 'ltr', 'meter', 'set', 'kit', 'bottle'].includes(unitRaw)) {
    payload.unit = unitRaw;
  }

  if (basePrice !== undefined && Number.isFinite(basePrice) && basePrice >= 0) payload.base_price = basePrice;
  if (minSaleRate !== undefined && Number.isFinite(minSaleRate) && minSaleRate >= 0) payload.minimum_sale_rate = minSaleRate;
  if (mrp !== undefined && Number.isFinite(mrp) && mrp >= 0) payload.mrp = mrp;
  if (gstPercent !== undefined && Number.isFinite(gstPercent) && gstPercent >= 0 && gstPercent <= 100) payload.gst_percent = gstPercent;
  if (warrantyMonths !== undefined && Number.isFinite(warrantyMonths) && warrantyMonths >= 0) payload.warranty_months = warrantyMonths;

  if (row.description || row.desc) payload.description = String(row.description || row.desc).trim();

  if (row.tags) {
    payload.tags = Array.isArray(row.tags)
      ? row.tags.map(x => String(x ?? '').trim().toLowerCase()).filter(Boolean)
      : String(row.tags).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  }

  if (isActive !== undefined) payload.is_active = isActive;
  if (isFeatured !== undefined) payload.is_featured = isFeatured;

  // Names → ObjectIds (same as create/update). Without this, ObjectId fields
  // receive raw strings and save/cast fails.
  await resolveProductRefs(payload, null, doc);

  if (doc) {
    for (const [k, v] of Object.entries(payload)) {
      doc.set(k, v);
    }
    await doc.save();
    const [populated] = await findProductsLean({ _id: doc._id, deletedAt: null });
    return toPlain(populated);
  }

  // defaults
  if (!payload.product_name) payload.product_name = 'New Sheet Product';
  if (payload.base_price === undefined) payload.base_price = 0;
  if (payload.minimum_sale_rate === undefined) payload.minimum_sale_rate = payload.base_price;
  if (payload.unit === undefined) payload.unit = 'pcs';
  if (payload.gst_percent === undefined) payload.gst_percent = 18;

  const newDoc = await Product.create(payload);
  const [populated] = await findProductsLean({ _id: newDoc._id, deletedAt: null });
  return toPlain(populated);
}

async function getMetaOptions() {
  const { ProductGroup, ProductSubgroup, ProductBrand, ProductManufacturer } = getModels();

  const [groups, subgroups, brands, manufacturers] = await Promise.all([
    ProductGroup.find({ deletedAt: null }).sort({ name: 1 }).lean(),
    ProductSubgroup.find({ deletedAt: null }).sort({ name: 1 }).lean(),
    ProductBrand.find({ deletedAt: null }).sort({ name: 1 }).lean(),
    ProductManufacturer.find({ deletedAt: null }).sort({ name: 1 }).lean(),
  ]);

  return {
    groups: groups.map(toPlain),
    subgroups: subgroups.map(toPlain),
    brands: brands.map(toPlain),
    manufacturers: manufacturers.map(toPlain),
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
  syncFromGoogleSheet,
  getMetaOptions,
};

