/**
 * @fileoverview Products: request body guards.
 * @module modules/products/product.validation
 */
const { ApiError } = require('../../utils/ApiError');

/** Matches `mongoRegistry` Product.unit enum */
const PRODUCT_UNITS = Object.freeze([
  'pcs',
  'box',
  'kg',
  'ltr',
  'meter',
  'set',
  'kit',
  'bottle',
]);

/** Matches `mongoRegistry` Product.product_type enum */
const PRODUCT_TYPES = Object.freeze(['individual', 'kit']);

const PRODUCT_UNIT_SET = new Set(PRODUCT_UNITS);
const PRODUCT_TYPE_SET = new Set(PRODUCT_TYPES);

function assertCreate(body) {
  if (!body || typeof body !== 'object') throw new ApiError(400, 'JSON body required');

  const name = body.product_name != null ? String(body.product_name).trim() : '';
  if (!name) throw new ApiError(400, 'product_name is required');

  if (body.base_price === undefined || body.base_price === null || body.base_price === '') {
    throw new ApiError(400, 'base_price is required');
  }
  const basePrice = Number(body.base_price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new ApiError(400, 'base_price must be a non-negative number');
  }

  if (body.minimum_sale_rate === undefined || body.minimum_sale_rate === null || body.minimum_sale_rate === '') {
    throw new ApiError(400, 'minimum_sale_rate is required');
  }
  const minSaleRate = Number(body.minimum_sale_rate);
  if (!Number.isFinite(minSaleRate) || minSaleRate < 0) {
    throw new ApiError(400, 'minimum_sale_rate must be a non-negative number');
  }

  if (body.unit != null && !PRODUCT_UNIT_SET.has(String(body.unit).trim())) {
    throw new ApiError(400, 'Invalid unit');
  }

  if (body.product_type != null && !PRODUCT_TYPE_SET.has(String(body.product_type).trim())) {
    throw new ApiError(400, 'Invalid product_type');
  }
}

module.exports = {
  assertCreate,
  PRODUCT_UNITS: PRODUCT_UNIT_SET,
  PRODUCT_TYPES: PRODUCT_TYPE_SET,
};
