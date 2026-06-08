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

    if (k === 'is_active') {
      out[k] = Boolean(v);
    }
  }

  return out;
}

async function list(query = {}) {
  const { Product } = getModels();

  const paginate = query.paginate === 'true';
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.max(Number(query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const mongoFilter = { deletedAt: null };

  if (query.search && String(query.search).trim()) {
    const s = String(query.search).trim();
    mongoFilter.$or = [
      { product_name: { $regex: s, $options: 'i' } },
      { generic_name: { $regex: s, $options: 'i' } },
      { sku: { $regex: s, $options: 'i' } },
      { brand: { $regex: s, $options: 'i' } },
      { manufacturer: { $regex: s, $options: 'i' } }
    ];
  }

  if (query.group && query.group !== 'all') {
    mongoFilter.product_group = query.group;
  }

  if (query.status && query.status !== 'all') {
    if (query.status === 'active') {
      mongoFilter.is_active = { $ne: false };
    } else if (query.status === 'inactive') {
      mongoFilter.is_active = false;
    }
  }

  if (paginate) {
    const [total, rows, groups] = await Promise.all([
      Product.countDocuments(mongoFilter),
      Product.find(mongoFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.distinct('product_group', { deletedAt: null }),
    ]);

    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      groups: groups.filter(Boolean).sort(),
      data: rows.map(toPlain),
    };
  }

  const rows = await Product.find(mongoFilter).sort({ createdAt: -1 }).lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await getModels().Product.findOne({ _id: id, deletedAt: null })
    .lean();
  if (!row) throw new ApiError(404, nf);
  return toPlain(row);
}

async function create(body, user) {
  const skuTrim = body.sku != null ? String(body.sku).trim().toUpperCase() : '';
  if (skuTrim) {
    const existing = await getModels().Product.findOne({ sku: skuTrim }).withDeleted();
    if (existing) {
      throw new ApiError(400, `Product with SKU "${skuTrim}" already exists${existing.deletedAt ? ' (soft-deleted)' : ''}`);
    }
  }

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
    product_group: body.product_group != null ? String(body.product_group).trim() : '',
    product_subgroup: body.product_subgroup != null ? String(body.product_subgroup).trim() : '',
    brand: body.brand != null ? String(body.brand).trim() : '',
    manufacturer: body.manufacturer != null ? String(body.manufacturer).trim() : '',
    unit: unitRaw,
    base_price: basePrice,
    minimum_sale_rate: minSaleRate,
    gst_percent: gstPercent,
    is_active: body.is_active !== false,
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

  const doc = await getModels().Product.create(payload);
  const plain = toPlain(doc.toObject());
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

  if (sanitized.sku && typeof sanitized.sku === 'string' && sanitized.sku.trim() !== '') {
    const skuUpper = sanitized.sku.trim().toUpperCase();
    if (skuUpper !== doc.sku) {
      const existing = await getModels().Product.findOne({ sku: skuUpper, _id: { $ne: id } }).withDeleted();
      if (existing) {
        throw new ApiError(400, `Product with SKU "${skuUpper}" already exists`);
      }
    }
  }

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
  return toPlain(doc.toObject());
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
      product_group: item.product_group != null ? String(item.product_group).trim() : '',
      product_subgroup: item.product_subgroup != null ? String(item.product_subgroup).trim() : '',
      brand: brandName || undefined,
      manufacturer: mfrName || undefined,
      unit: ['pcs', 'box', 'kg', 'ltr', 'meter', 'set', 'kit', 'bottle'].includes(unitRaw) ? unitRaw : 'pcs',
      base_price: basePrice,
      minimum_sale_rate: minSaleRate,
      gst_percent: gstPercent,
      is_active: item.is_active !== false,
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

    let doc;
    if (skuTrim) {
      doc = await Product.findOne({ sku: skuTrim }).withDeleted();
    }

    if (doc) {
      // Update existing product, restore it if soft-deleted
      doc.set(payload);
      doc.set('deletedAt', null);
      if (user) {
        doc.set('updated_by', user._id);
      }
      await doc.save();
      createdProducts.push(toPlain(doc.toObject()));
    } else {
      // Create new
      doc = await Product.create(payload);
      createdProducts.push(toPlain(doc.toObject()));
    }
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
