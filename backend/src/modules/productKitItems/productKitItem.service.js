/**
 * @fileoverview ProductKitItem: kit bill-of-materials business logic.
 * @module modules/productKitItems/productKitItem.service
 */
const mongoose = require('mongoose');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const {
  softDeleteActiveById,
  restoreSoftDeletedById,
  listDeletedLean,
} = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');

const nf = 'Product kit composition not found';

const PRODUCT_SELECT =
  'product_name product_type sku generic_name unit base_price is_active';

function isObjectId(val) {
  return mongoose.Types.ObjectId.isValid(val);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const qtyRaw = item.quantity;
    const quantity =
      qtyRaw === undefined || qtyRaw === null || qtyRaw === ''
        ? null
        : Number(qtyRaw);

    return {
      individual: item.individual,
      percentage: Number(item.percentage),
      quantity: Number.isFinite(quantity) ? quantity : null,
      sort_order:
        item.sort_order !== undefined && item.sort_order !== null && item.sort_order !== ''
          ? Number(item.sort_order)
          : index,
      is_active: item.is_active !== false,
      remarks: item.remarks != null ? String(item.remarks).trim() : '',
    };
  });
}

async function assertKitProduct(kitId) {
  const { Product } = getModels();
  const kit = await Product.findOne({ _id: kitId, deletedAt: null }).lean();
  if (!kit) throw new ApiError(400, 'Kit product not found');
  if (kit.product_type !== 'kit') {
    throw new ApiError(400, 'kit must reference a product with product_type "kit"');
  }
  return kit;
}

async function assertIndividualProducts(items) {
  if (!items.length) return;

  const { Product } = getModels();
  const ids = items.map((i) => i.individual);
  const products = await Product.find({
    _id: { $in: ids },
    deletedAt: null,
  }).lean();

  const byId = new Map(products.map((p) => [String(p._id), p]));
  for (const item of items) {
    const id = String(item.individual);
    const product = byId.get(id);
    if (!product) {
      throw new ApiError(400, `Individual product not found: ${id}`);
    }
    if (product.product_type === 'kit') {
      throw new ApiError(400, `Cannot nest a kit product inside another kit: ${id}`);
    }
  }
}

async function populateComposition(filter) {
  const { ProductKitItem } = getModels();
  return ProductKitItem.findOne(filter)
    .populate({ path: 'kit', select: PRODUCT_SELECT })
    .populate({ path: 'items.individual', select: PRODUCT_SELECT })
    .lean();
}

async function list(query = {}) {
  const { ProductKitItem } = getModels();
  const filter = { deletedAt: null };

  if (query.kit && isObjectId(query.kit)) {
    filter.kit = query.kit;
  }
  if (query.is_active !== undefined && query.is_active !== '' && query.is_active !== 'all') {
    filter.is_active = query.is_active === 'true' || query.is_active === true;
  }
  if (query.individual && isObjectId(query.individual)) {
    filter['items.individual'] = query.individual;
  }

  const paginate = query.paginate === 'true';
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.max(Number(query.limit) || 20, 1);
  const skip = (page - 1) * limit;

  const findQuery = ProductKitItem.find(filter)
    .populate({ path: 'kit', select: PRODUCT_SELECT })
    .populate({ path: 'items.individual', select: PRODUCT_SELECT })
    .sort({ createdAt: -1 });

  if (paginate) {
    const [total, rows] = await Promise.all([
      ProductKitItem.countDocuments(filter),
      findQuery.skip(skip).limit(limit).lean(),
    ]);
    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      items: rows.map(toPlain),
    };
  }

  const rows = await findQuery.lean();
  return rows.map(toPlain);
}

async function get(id) {
  const row = await populateComposition({ _id: id, deletedAt: null });
  if (!row) throw new ApiError(404, nf);
  return toPlain(row);
}

async function getByKit(kitId) {
  if (!isObjectId(kitId)) throw new ApiError(400, 'Invalid kit ObjectId');
  const row = await populateComposition({ kit: kitId, deletedAt: null });
  if (!row) throw new ApiError(404, nf);
  return toPlain(row);
}

async function create(body, user) {
  const { ProductKitItem } = getModels();

  await assertKitProduct(body.kit);
  const items = normalizeItems(body.items || []);
  await assertIndividualProducts(items);

  // Reuse / restore existing composition for this kit (unique on kit)
  let doc = await ProductKitItem.findOne({ kit: body.kit, deletedAt: null });
  if (!doc) {
    doc = await ProductKitItem.findOne({ kit: body.kit }).withDeleted();
  }

  const fields = {
    items,
    is_active: body.is_active !== false,
    remarks: body.remarks != null ? String(body.remarks).trim() : '',
  };

  if (doc && doc.deletedAt != null) {
    await doc.restore();
    Object.assign(doc, fields);
    if (user) doc.updated_by = user._id;
    await doc.save();
  } else if (doc) {
    throw new ApiError(409, 'A kit composition already exists for this kit; use PATCH to update');
  } else {
    const payload = {
      kit: body.kit,
      ...fields,
    };
    if (user) payload.created_by = user._id;
    try {
      doc = await ProductKitItem.create(payload);
    } catch (err) {
      if (err && (err.code === 11000 || err.code === '11000')) {
        throw new ApiError(409, 'A kit composition already exists for this kit; use PATCH to update');
      }
      throw err;
    }
  }

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'created',
      message: `Kit composition created/updated for kit ${body.kit}`,
    });
  }

  return get(doc._id);
}

async function upsertByKit(kitId, body, user) {
  if (!isObjectId(kitId)) throw new ApiError(400, 'Invalid kit ObjectId');

  const { ProductKitItem } = getModels();
  await assertKitProduct(kitId);

  const items = normalizeItems(body.items || []);
  await assertIndividualProducts(items);

  let doc = await ProductKitItem.findOne({ kit: kitId, deletedAt: null });
  if (!doc) {
    doc = await ProductKitItem.findOne({ kit: kitId }).withDeleted();
  }

  const fields = {
    items,
    is_active: body.is_active !== false,
    remarks: body.remarks != null ? String(body.remarks).trim() : '',
  };

  if (doc) {
    if (doc.deletedAt != null) await doc.restore();
    Object.assign(doc, fields);
    if (user) doc.updated_by = user._id;
    await doc.save();
  } else {
    const payload = { kit: kitId, ...fields };
    if (user) payload.created_by = user._id;
    doc = await ProductKitItem.create(payload);
  }

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'updated',
      message: `Kit composition upserted for kit ${kitId}`,
    });
  }

  return get(doc._id);
}

async function update(id, patch, user) {
  const { ProductKitItem } = getModels();
  const doc = await ProductKitItem.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, nf);

  if (Object.prototype.hasOwnProperty.call(patch, 'items')) {
    const items = normalizeItems(patch.items || []);
    await assertIndividualProducts(items);
    doc.items = items;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'is_active')) {
    doc.is_active = Boolean(patch.is_active);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'remarks')) {
    doc.remarks = patch.remarks != null ? String(patch.remarks).trim() : '';
  }

  if (user) doc.updated_by = user._id;
  await doc.save();

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'updated',
      message: `Kit composition updated`,
    });
  }

  return get(doc._id);
}

async function addItem(id, body, user) {
  const { ProductKitItem } = getModels();
  const doc = await ProductKitItem.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, nf);

  const individualId = String(body.individual);
  const exists = doc.items.some((i) => String(i.individual) === individualId);
  if (exists) throw new ApiError(400, 'This individual product is already in the kit');

  const nextItem = normalizeItems([
    {
      ...body,
      sort_order:
        body.sort_order !== undefined ? body.sort_order : doc.items.length,
    },
  ])[0];
  await assertIndividualProducts([nextItem]);

  doc.items.push(nextItem);
  if (user) doc.updated_by = user._id;
  await doc.save();

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'updated',
      message: `Added individual ${individualId} to kit composition`,
    });
  }

  return get(doc._id);
}

async function updateItem(id, itemId, body, user) {
  const { ProductKitItem } = getModels();
  const doc = await ProductKitItem.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, nf);

  const item = doc.items.id(itemId);
  if (!item) throw new ApiError(404, 'Kit item line not found');

  if (body.individual !== undefined) {
    const nextId = String(body.individual);
    const dup = doc.items.some(
      (i) => String(i._id) !== String(itemId) && String(i.individual) === nextId,
    );
    if (dup) throw new ApiError(400, 'This individual product is already in the kit');
    await assertIndividualProducts([{ individual: body.individual }]);
    item.individual = body.individual;
  }

  if (body.percentage !== undefined) {
    item.percentage = Number(body.percentage);
  }
  if (body.quantity !== undefined) {
    if (body.quantity === null || body.quantity === '') {
      item.quantity = null;
    } else {
      item.quantity = Number(body.quantity);
    }
  }
  if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== '') {
    item.sort_order = Number(body.sort_order);
  }
  if (body.is_active !== undefined) {
    item.is_active = Boolean(body.is_active);
  }
  if (body.remarks !== undefined) {
    item.remarks = body.remarks != null ? String(body.remarks).trim() : '';
  }

  if (user) doc.updated_by = user._id;
  await doc.save();

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'updated',
      message: `Updated kit item line ${itemId}`,
    });
  }

  return get(doc._id);
}

async function removeItem(id, itemId, user) {
  const { ProductKitItem } = getModels();
  const doc = await ProductKitItem.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, nf);

  const item = doc.items.id(itemId);
  if (!item) throw new ApiError(404, 'Kit item line not found');

  item.deleteOne();
  if (user) doc.updated_by = user._id;
  await doc.save();

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'updated',
      message: `Removed kit item line ${itemId}`,
    });
  }

  return get(doc._id);
}

async function softDelete(id, user) {
  const { ProductKitItem } = getModels();
  const doc = await softDeleteActiveById(ProductKitItem, id, { notFoundMessage: nf });
  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'deleted',
      message: `Kit composition soft-deleted`,
    });
  }
  return { success: true, id: String(doc._id) };
}

async function restore(id, user) {
  const { ProductKitItem } = getModels();
  const doc = await restoreSoftDeletedById(ProductKitItem, id, { notFoundMessage: nf });
  if (user) {
    doc.updated_by = user._id;
    await doc.save();
    await activityService.create({
      actor: user._id,
      entity_type: 'product_kit_item',
      entity_id: doc._id,
      action: 'restored',
      message: `Kit composition restored`,
    });
  }
  return get(doc._id);
}

async function listDeleted() {
  const { ProductKitItem } = getModels();
  const rows = await listDeletedLean(ProductKitItem);
  return rows.map(toPlain);
}

module.exports = {
  list,
  get,
  getByKit,
  create,
  upsertByKit,
  update,
  addItem,
  updateItem,
  removeItem,
  softDelete,
  restore,
  listDeleted,
};
