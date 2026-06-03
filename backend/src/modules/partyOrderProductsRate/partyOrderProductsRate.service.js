/**
 * @fileoverview Service for checking and mapping party order product rates.
 * @module modules/partyOrderProductsRate/partyOrderProductsRate.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { ApiError } = require('../../utils/ApiError');

function isRateInValidityWindow(rate, now) {
  const start = rate.validity_start ? new Date(rate.validity_start) : null;
  const end = rate.validity_end ? new Date(rate.validity_end) : null;
  return (!start || start <= now) && (!end || end >= now);
}

/** Latest negotiated rate = newest row by createdAt (never validity_end). */
function compareRateByCreatedAt(a, b) {
  const aCr = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bCr = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (bCr !== aCr) return bCr - aCr;
  return String(b._id).localeCompare(String(a._id));
}

function pickLatestRate(candidates, now, { inWindow, expiredOnly }) {
  const filtered = candidates.filter((r) => {
    if (r.status !== 'active') return false;
    if (inWindow) return isRateInValidityWindow(r, now);
    if (expiredOnly) {
      const end = r.validity_end ? new Date(r.validity_end) : null;
      return end && end < now;
    }
    return false;
  });
  if (filtered.length === 0) return null;
  return filtered.sort(compareRateByCreatedAt)[0];
}

/**
 * Resolve the latest negotiated rate for a party+product+rate type across all
 * active mappings (a party may have multiple mapping rows for the same product).
 */
async function resolveRateForPartyProduct(partyId, productId, appliedRateType) {
  const { PartyProductMapping, PartyProductRate } = getModels();
  const lookupRateType = appliedRateType === 'MANUAL' ? 'SR' : appliedRateType;
  const now = new Date();

  const mappings = await PartyProductMapping.find({
    party: partyId,
    product: productId,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const isMapped = mappings.length > 0;
  const mappingIds = mappings.map((m) => m._id);

  let mappingId =
    mappings.length > 0 ? String(mappings[0]._id) : null;
  let hasRate = false;
  let rateId = null;
  let currentMappedRate = null;
  let isRateExpired = false;
  let validityStart = null;
  let validityEnd = null;

  if (mappingIds.length === 0) {
    return {
      isMapped: false,
      mappingId: null,
      hasRate,
      rateId,
      currentMappedRate,
      isRateExpired,
      validityStart,
      validityEnd,
    };
  }

  const rateCandidates = await PartyProductRate.find({
    party: partyId,
    product: productId,
    rate_type: lookupRateType,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const best = pickLatestRate(rateCandidates, now, { inWindow: true });

  if (best) {
    hasRate = true;
    rateId = String(best._id);
    currentMappedRate = best.rate;
    mappingId = String(best.mapping);
    validityStart = best.validity_start;
    validityEnd = best.validity_end;
  } else {
    const latestExpired = pickLatestRate(rateCandidates, now, {
      expiredOnly: true,
    });
    if (latestExpired) {
      isRateExpired = true;
      mappingId = String(latestExpired.mapping);
      validityStart = latestExpired.validity_start;
      validityEnd = latestExpired.validity_end;
    }
  }

  return {
    isMapped,
    mappingId,
    hasRate,
    rateId,
    currentMappedRate,
    isRateExpired,
    validityStart,
    validityEnd,
  };
}

async function checkPartyLineRates(body) {
  const { Party } = getModels();
  const partyId = body?.party;
  if (!partyId) throw new ApiError(400, 'party is required');

  const party = await Party.findById(partyId).lean();
  if (!party) throw new ApiError(404, 'Party not found');

  const items = Array.isArray(body.items) ? body.items : [];
  const results = [];

  for (const item of items) {
    const productId = item.product?._id || item.product;
    if (!productId) continue;

    const appliedRateType = item.applied_rate_type || 'SR';
    const rateInfo = await resolveRateForPartyProduct(
      partyId,
      productId,
      appliedRateType,
    );

    results.push({
      product: String(productId),
      product_name: item.product_name || '',
      sku: item.sku || '',
      applied_rate_type: appliedRateType,
      unit_price: Number(item.unit_price || 0),
      ...rateInfo,
    });
  }

  return {
    party: String(partyId),
    party_name: party.party_name || '',
    items: results,
  };
}

async function checkOrderRates(orderId) {
  const { Order } = getModels();

  const order = await Order.findById(orderId).populate('party').lean();
  if (!order) throw new ApiError(404, 'Order not found');

  const partyId = order.party?._id || order.party;
  if (!partyId) throw new ApiError(400, 'Order has no party linked');

  const items = order.order_items || [];
  const results = [];

  for (const item of items) {
    const productId = item.product?._id || item.product;
    if (!productId) continue;

    const appliedRateType = item.applied_rate_type || 'SR';
    const rateInfo = await resolveRateForPartyProduct(
      partyId,
      productId,
      appliedRateType,
    );

    results.push({
      product: String(productId),
      product_name: item.product_name,
      sku: item.sku,
      applied_rate_type: appliedRateType,
      unit_price: item.unit_price,
      ...rateInfo,
    });
  }

  return {
    orderId,
    party: partyId,
    party_name: order.party?.party_name || '',
    items: results,
  };
}

async function createMappingAndRate(body, user) {
  const { PartyProductMapping, PartyProductRate, Order } = getModels();
  const { orderId, productId, applied_rate_type, rate } = body;
  
  const order = await Order.findById(orderId).lean();
  if (!order) throw new ApiError(404, 'Order not found');
  
  const partyId = order.party;
  if (!partyId) throw new ApiError(400, 'Order has no party');
  
  // Prefer the most recently updated mapping when duplicates exist
  let mappingDoc = await PartyProductMapping.findOne({
    party: partyId,
    product: productId,
    deletedAt: null,
  }).sort({ createdAt: -1 });

  if (!mappingDoc) {
    mappingDoc = await PartyProductMapping.findOne({
      party: partyId,
      product: productId,
    })
      .withDeleted()
      .sort({ createdAt: -1 });
  }
  
  if (!mappingDoc) {
    const mappingPayload = {
      party: partyId,
      product: productId,
      is_active: true,
      is_orderable: true,
      priority: 100,
      remarks: 'Auto-mapped from order review detail screen'
    };
    if (user) {
      mappingPayload.created_by = user._id;
    }
    mappingDoc = await PartyProductMapping.create(mappingPayload);
  } else if (mappingDoc.deletedAt !== null) {
    mappingDoc.deletedAt = null;
    mappingDoc.is_active = true;
    mappingDoc.is_orderable = true;
    if (user) {
      mappingDoc.updated_by = user._id;
    }
    await mappingDoc.save();
  }
  
  // Find or create rate (note applied_rate_type enum filter for SSR, SR, CR)
  const lookupRateType = applied_rate_type === 'MANUAL' ? 'SR' : applied_rate_type;
  
  const existingRates = await PartyProductRate.find({
    party: partyId,
    product: productId,
    rate_type: lookupRateType,
    status: 'active',
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .lean();

  const now = new Date();
  const latestInWindow = pickLatestRate(existingRates, now, { inWindow: true });
  let rateDoc = latestInWindow
    ? await PartyProductRate.findById(latestInWindow._id)
    : null;
  
  const parsedRate = Number(rate);
  if (isNaN(parsedRate) || parsedRate < 0) {
    throw new ApiError(400, 'Invalid rate value');
  }
  
  if (rateDoc) {
    // Update rate
    rateDoc.rate = parsedRate;
    rateDoc.validity_start = new Date();
    rateDoc.validity_end = new Date('2099-12-31');
    if (user) {
      rateDoc.updated_by = user._id;
    }
    await rateDoc.save();
  } else {
    // Create rate
    const ratePayload = {
      mapping: mappingDoc._id,
      party: partyId,
      product: productId,
      rate_type: lookupRateType,
      rate: parsedRate,
      min_qty: 1,
      max_qty: 999999,
      validity_start: new Date(),
      validity_end: new Date('2099-12-31'),
      priority: 100,
      approval_required: false,
      status: 'active',
      remarks: 'Auto-created rate from order review detail screen'
    };
    if (user) {
      ratePayload.created_by = user._id;
    }
    rateDoc = await PartyProductRate.create(ratePayload);
  }
  
  return {
    mappingId: mappingDoc._id,
    rateId: rateDoc._id,
    rate: rateDoc.rate
  };
}

module.exports = {
  checkOrderRates,
  checkPartyLineRates,
  createMappingAndRate,
  resolveRateForPartyProduct,
};
