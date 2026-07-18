/**
 * Safe product ref hydration (legacy string values + ObjectIds).
 * @module modules/products/productRefs
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');

function isObjectId(id) {
  if (!id) return false;
  if (id instanceof mongoose.Types.ObjectId) return true;
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function refIdString(val) {
  if (val == null || val === '') return '';
  if (val instanceof mongoose.Types.ObjectId) return String(val);
  if (typeof val === 'string') {
    const s = val.trim();
    return isObjectId(s) ? s : '';
  }
  if (typeof val === 'object') {
    const id = val._id ?? val.id;
    if (id != null) return refIdString(id);
  }
  return '';
}

function refDisplayName(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || isObjectId(s)) return '';
    return s;
  }
  if (typeof val === 'object' && val.name != null && String(val.name).trim()) {
    return String(val.name).trim();
  }
  return '';
}

const PRODUCT_REF_FIELDS = Object.freeze([
  { key: 'product_group', modelKey: 'ProductGroup' },
  { key: 'product_subgroup', modelKey: 'ProductSubgroup' },
  { key: 'brand', modelKey: 'ProductBrand' },
  { key: 'manufacturer', modelKey: 'ProductManufacturer' },
]);

/**
 * Avoids Mongoose populate CastError when DB still has legacy string values
 * (e.g. product_group: "Battery") after the ObjectId migration.
 *
 * Lean queries return ObjectId instances (`typeof === "object"`), so those must
 * be collected and hydrated — not skipped.
 */
async function attachProductRefs(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const models = getModels();
  const idSets = Object.fromEntries(PRODUCT_REF_FIELDS.map((f) => [f.key, new Set()]));
  const nameSets = Object.fromEntries(PRODUCT_REF_FIELDS.map((f) => [f.key, new Set()]));

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const { key } of PRODUCT_REF_FIELDS) {
      const val = row[key];
      if (val == null || val === '') continue;

      // Already a hydrated doc with a name — nothing to look up.
      if (typeof val === 'object' && !(val instanceof mongoose.Types.ObjectId) && val.name) {
        continue;
      }

      const id = refIdString(val);
      if (id) {
        idSets[key].add(id);
        continue;
      }

      const name = refDisplayName(val);
      if (name) nameSets[key].add(name);
    }
  }

  const lookups = {};
  await Promise.all(
    PRODUCT_REF_FIELDS.map(async ({ key, modelKey }) => {
      const Model = models[modelKey];
      const byId = new Map();
      const byName = new Map();
      if (!Model) {
        lookups[key] = { byId, byName };
        return;
      }

      const ids = [...idSets[key]];
      const names = [...nameSets[key]];
      const tasks = [];
      if (ids.length) {
        tasks.push(
          Model.find({ _id: { $in: ids }, deletedAt: null })
            .lean()
            .then((docs) => {
              for (const d of docs) byId.set(String(d._id), d);
            })
            .catch(() => undefined),
        );
      }
      if (names.length) {
        tasks.push(
          Model.find({ name: { $in: names }, deletedAt: null })
            .lean()
            .then((docs) => {
              for (const d of docs) {
                byName.set(String(d.name).trim().toLowerCase(), d);
              }
            })
            .catch(() => undefined),
        );
      }
      await Promise.all(tasks);
      lookups[key] = { byId, byName };
    }),
  );

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const { key } of PRODUCT_REF_FIELDS) {
      const val = row[key];
      if (val == null || val === '') {
        row[key] = null;
        continue;
      }

      // Keep already-hydrated docs.
      if (typeof val === 'object' && !(val instanceof mongoose.Types.ObjectId) && val.name) {
        continue;
      }

      const id = refIdString(val);
      if (id) {
        row[key] = lookups[key].byId.get(id) || { _id: id, name: null };
        continue;
      }

      if (typeof val === 'string') {
        const found = lookups[key].byName.get(val.trim().toLowerCase());
        row[key] = found || { name: val.trim() };
      }
    }
  }

  return rows;
}

async function findProductsLean(filter, { sort, skip, limit } = {}) {
  let q = getModels().Product.find(filter);
  if (sort) q = q.sort(sort);
  if (skip != null) q = q.skip(skip);
  if (limit != null) q = q.limit(limit);
  const rows = await q.lean();
  await attachProductRefs(rows);
  return rows;
}

module.exports = {
  isObjectId,
  refIdString,
  refDisplayName,
  attachProductRefs,
  findProductsLean,
};
