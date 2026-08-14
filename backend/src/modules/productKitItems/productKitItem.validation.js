/**
 * @fileoverview ProductKitItem: request body guards.
 * @module modules/productKitItems/productKitItem.validation
 */
const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');

function isObjectId(val) {
  return mongoose.Types.ObjectId.isValid(val);
}

function assertPercentage(raw, label = 'percentage') {
  if (raw === undefined || raw === null || raw === '') {
    throw new ApiError(400, `${label} is required`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1000) {
    throw new ApiError(400, `${label} must be a number between 0 and 1000`);
  }
  return n;
}

/** Optional quantity: omit / null / '' allowed; otherwise must be >= 0. */
function assertOptionalQuantity(raw, label = 'quantity') {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(400, `${label} must be a non-negative number`);
  }
  return n;
}

function assertItem(item, prefix = 'item') {
  if (!item || typeof item !== 'object') {
    throw new ApiError(400, `${prefix} must be an object`);
  }
  if (!item.individual) {
    throw new ApiError(400, `${prefix}.individual is required`);
  }
  if (!isObjectId(item.individual)) {
    throw new ApiError(400, `${prefix}.individual must be a valid ObjectId`);
  }
  assertPercentage(item.percentage, `${prefix}.percentage`);
  assertOptionalQuantity(item.quantity, `${prefix}.quantity`);

  if (item.sort_order !== undefined && item.sort_order !== null && item.sort_order !== '') {
    const so = Number(item.sort_order);
    if (!Number.isFinite(so)) {
      throw new ApiError(400, `${prefix}.sort_order must be a number`);
    }
  }
}

function assertItemsArray(items, { allowEmpty = true } = {}) {
  if (!Array.isArray(items)) {
    throw new ApiError(400, 'items must be an array');
  }
  if (!allowEmpty && items.length === 0) {
    throw new ApiError(400, 'items must contain at least one individual product');
  }

  const seen = new Set();
  items.forEach((item, i) => {
    assertItem(item, `items[${i}]`);
    const id = String(item.individual);
    if (seen.has(id)) {
      throw new ApiError(400, 'Duplicate individual products are not allowed in the same kit');
    }
    seen.add(id);
  });
}

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');

  if (!body.kit) throw new ApiError(400, 'kit (ObjectId) is required');
  if (!isObjectId(body.kit)) throw new ApiError(400, 'Invalid kit ObjectId');

  if (body.items !== undefined) {
    assertItemsArray(body.items, { allowEmpty: true });
  }
}

function assertUpdate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (Object.keys(body).length === 0) throw new ApiError(400, 'Empty update body');

  if (body.kit !== undefined) {
    throw new ApiError(400, 'kit cannot be changed; create a new kit composition instead');
  }

  if (body.items !== undefined) {
    assertItemsArray(body.items, { allowEmpty: true });
  }
}

function assertAddItem(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  assertItem(body, 'item');
}

function assertUpdateItem(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');
  if (Object.keys(body).length === 0) throw new ApiError(400, 'Empty update body');

  if (body.individual !== undefined) {
    if (!body.individual || !isObjectId(body.individual)) {
      throw new ApiError(400, 'individual must be a valid ObjectId');
    }
  }
  if (body.percentage !== undefined) {
    assertPercentage(body.percentage);
  }
  if (body.quantity !== undefined) {
    assertOptionalQuantity(body.quantity);
  }
  if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== '') {
    const so = Number(body.sort_order);
    if (!Number.isFinite(so)) throw new ApiError(400, 'sort_order must be a number');
  }
}

module.exports = {
  assertCreate,
  assertUpdate,
  assertAddItem,
  assertUpdateItem,
  assertItemsArray,
  assertPercentage,
  assertOptionalQuantity,
};
