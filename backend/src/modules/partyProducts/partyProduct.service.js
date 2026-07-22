/**
 * @fileoverview Party Products: unified business logic for mappings and rates.
 * @module modules/partyProducts/partyProduct.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { softDeleteActiveById, restoreSoftDeletedById, listDeletedLean } = require('../../utils/mongoSoftDelete');
const activityService = require('../activity/activity.service');
const { RATE_STATUSES } = require('./partyProduct.validation');

const mappingNf = 'Party product mapping not found';
const rateNf = 'Party product rate not found';

const MAPPING_PATCHABLE_KEYS = Object.freeze([
  'is_active',
  'is_orderable',
  'priority',
  'expected_order_quantity',
  'remarks',
]);

const RATE_PATCHABLE_KEYS = Object.freeze([
  'rate',
  'min_qty',
  'max_qty',
  'validity_start',
  'validity_end',
  'priority',
  'approval_required',
  'status',
  'remarks',
]);

function valsEqual(a, b) {
  if (a === b) return true;
  if (
    (a === null || a === undefined || a === '') &&
    (b === null || b === undefined || b === '')
  )
    return true;
  return false;
}

function sanitizeMappingPatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  for (const k of MAPPING_PATCHABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      const v = patch[k];
      if (k === 'priority') {
        const p = Number(v);
        if (!Number.isFinite(p)) throw new ApiError(400, 'priority must be a number');
        out[k] = p;
      } else if (k === 'expected_order_quantity') {
        const eoq = Number(v);
        if (!Number.isFinite(eoq) || eoq < 0) throw new ApiError(400, 'expected_order_quantity must be a non-negative number');
        out[k] = eoq;
      } else if (k === 'remarks') {
        out[k] = v != null ? String(v).trim() : '';
      } else if (k === 'is_active' || k === 'is_orderable') {
        out[k] = Boolean(v);
      }
    }
  }
  return out;
}

function sanitizeRatePatch(patch) {
  if (!patch || typeof patch !== 'object') return {};
  const out = {};
  for (const k of RATE_PATCHABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      const v = patch[k];
      if (k === 'rate') {
        const r = Number(v);
        if (!Number.isFinite(r) || r < 0) throw new ApiError(400, 'rate must be a non-negative number');
        out[k] = r;
      } else if (k === 'min_qty') {
        const mq = Number(v);
        if (!Number.isFinite(mq) || mq < 1) throw new ApiError(400, 'min_qty must be >= 1');
        out[k] = mq;
      } else if (k === 'max_qty') {
        const mq = Number(v);
        if (!Number.isFinite(mq)) throw new ApiError(400, 'max_qty must be a number');
        out[k] = mq;
      } else if (k === 'validity_start' || k === 'validity_end') {
        const d = new Date(v);
        if (isNaN(d.getTime())) throw new ApiError(400, `Invalid date for ${k}`);
        out[k] = d;
      } else if (k === 'priority') {
        const p = Number(v);
        if (!Number.isFinite(p)) throw new ApiError(400, 'priority must be a number');
        out[k] = p;
      } else if (k === 'remarks') {
        out[k] = v != null ? String(v).trim() : '';
      } else if (k === 'status') {
        if (!RATE_STATUSES.has(v)) throw new ApiError(400, 'Invalid status');
        out[k] = v;
      } else if (k === 'approval_required') {
        out[k] = Boolean(v);
      }
    }
  }
  return out;
}

async function list() {
  const { PartyProductMapping, PartyProductRate } = getModels();

  const mappings = await PartyProductMapping.find({ deletedAt: null })
    .populate('party')
    .populate('product')
    .sort({ createdAt: -1 })
    .lean();

  const result = [];
  for (const m of mappings) {
    const rates = await PartyProductRate.find({ mapping: m._id, deletedAt: null })
      .sort({ priority: 1, validity_start: -1 })
      .lean();
    result.push({
      ...toPlain(m),
      rates: rates.map(toPlain),
    });
  }

  return result;
}

async function get(id) {
  const { PartyProductMapping, PartyProductRate } = getModels();

  const mapping = await PartyProductMapping.findOne({ _id: id, deletedAt: null })
    .populate('party')
    .populate('product')
    .lean();

  if (!mapping) throw new ApiError(404, mappingNf);

  const rates = await PartyProductRate.find({ mapping: id, deletedAt: null })
    .sort({ priority: 1, validity_start: -1 })
    .lean();

  return {
    ...toPlain(mapping),
    rates: rates.map(toPlain),
  };
}

async function createRatesForMapping(mappingId, partyId, productId, rates, user) {
  const { PartyProductRate } = getModels();
  const ratesCreated = [];
  if (!Array.isArray(rates) || rates.length === 0) return ratesCreated;

  for (const r of rates) {
    const approvalReq = r.approval_required === true;
    const status = approvalReq
      ? 'draft'
      : r.status && RATE_STATUSES.has(r.status)
        ? r.status
        : 'active';

    const ratePayload = {
      mapping: mappingId,
      party: partyId,
      product: productId,
      rate_type: r.rate_type,
      rate: Number(r.rate),
      min_qty: r.min_qty !== undefined ? Number(r.min_qty) : 1,
      max_qty: r.max_qty !== undefined ? Number(r.max_qty) : 999999,
      validity_start: new Date(r.validity_start),
      validity_end: new Date(r.validity_end),
      priority: r.priority !== undefined ? Number(r.priority) : 100,
      approval_required: approvalReq,
      status,
      remarks: r.remarks != null ? String(r.remarks).trim() : '',
    };

    if (user) {
      ratePayload.created_by = user._id;
    }

    const rateDoc = await PartyProductRate.create(ratePayload);
    ratesCreated.push(toPlain(rateDoc.toObject()));
  }

  return ratesCreated;
}

async function create(body, user) {
  const { Party, Product, PartyProductMapping } = getModels();

  // Validate existence of party and product
  const partyExists = await Party.exists({ _id: body.party, deletedAt: null });
  if (!partyExists) throw new ApiError(400, 'Party not found or inactive');

  const productExists = await Product.exists({ _id: body.product, deletedAt: null });
  if (!productExists) throw new ApiError(400, 'Product not found or inactive');

  /*
   * Unique index is on { party, product } including soft-deleted rows.
   * Reuse / restore an existing row instead of inserting a duplicate (E11000).
   */
  let mappingDoc = await PartyProductMapping.findOne({
    party: body.party,
    product: body.product,
    deletedAt: null,
  }).sort({ createdAt: -1 });

  if (!mappingDoc) {
    mappingDoc = await PartyProductMapping.findOne({
      party: body.party,
      product: body.product,
    })
      .withDeleted()
      .sort({ createdAt: -1 });
  }

  const wasRestored = Boolean(mappingDoc && mappingDoc.deletedAt != null);
  const wasExisting = Boolean(mappingDoc && mappingDoc.deletedAt == null);
  let createdNew = false;

  const nextFields = {
    is_active: body.is_active !== false,
    is_orderable: body.is_orderable !== false,
    priority: body.priority !== undefined ? Number(body.priority) : 100,
    expected_order_quantity:
      body.expected_order_quantity !== undefined
        ? Number(body.expected_order_quantity)
        : 0,
    remarks: body.remarks != null ? String(body.remarks).trim() : '',
  };

  if (!mappingDoc) {
    const mappingPayload = {
      party: body.party,
      product: body.product,
      ...nextFields,
    };
    if (user) {
      mappingPayload.created_by = user._id;
    }
    try {
      mappingDoc = await PartyProductMapping.create(mappingPayload);
      createdNew = true;
    } catch (err) {
      // Race / soft-deleted edge: unique index hit — reload and reuse
      if (err && (err.code === 11000 || err.code === '11000')) {
        mappingDoc = await PartyProductMapping.findOne({
          party: body.party,
          product: body.product,
        })
          .withDeleted()
          .sort({ createdAt: -1 });
        if (!mappingDoc) throw err;
      } else {
        throw err;
      }
    }
  }

  if (!createdNew && mappingDoc) {
    if (mappingDoc.deletedAt != null) {
      mappingDoc.deletedAt = null;
    }
    mappingDoc.is_active = nextFields.is_active;
    mappingDoc.is_orderable = nextFields.is_orderable;
    mappingDoc.priority = nextFields.priority;
    mappingDoc.expected_order_quantity = nextFields.expected_order_quantity;
    if (body.remarks != null) {
      mappingDoc.remarks = nextFields.remarks;
    }
    if (user) {
      mappingDoc.updated_by = user._id;
    }
    await mappingDoc.save();
  }

  const ratesCreated = await createRatesForMapping(
    mappingDoc._id,
    body.party,
    body.product,
    body.rates,
    user,
  );

  const populated = await PartyProductMapping.findById(mappingDoc._id)
    .populate('party')
    .populate('product')
    .lean();

  const plain = {
    ...toPlain(populated),
    rates: ratesCreated,
  };

  if (user) {
    const verb = createdNew ? 'created' : wasRestored || wasExisting ? 'reused' : 'updated';
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product?._id || plain.product,
      action: createdNew ? 'created' : 'updated',
      message: `PartyProductMapping ${verb} between party ${plain.party?.party_name} and product ${plain.product?.product_name}${plain.rates.length > 0 ? ` with ${plain.rates.length} rates` : ''}`,
    });
  }

  return plain;
}

async function update(id, patch, user) {
  const { PartyProductMapping, PartyProductRate } = getModels();

  const doc = await PartyProductMapping.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, mappingNf);

  const sanitized = sanitizeMappingPatch(patch);
  if (Object.keys(sanitized).length === 0) {
    throw new ApiError(400, 'No valid fields to patch on mapping');
  }

  if (user) {
    sanitized.updated_by = user._id;
  }

  doc.set(sanitized);
  await doc.save();

  const populated = await PartyProductMapping.findById(id)
    .populate('party')
    .populate('product')
    .lean();

  const rates = await PartyProductRate.find({ mapping: id, deletedAt: null })
    .sort({ priority: 1, validity_start: -1 })
    .lean();

  const plain = {
    ...toPlain(populated),
    rates: rates.map(toPlain),
  };

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product?._id || plain.product,
      action: 'updated',
      message: `PartyProductMapping updated between party ${plain.party?.party_name} and product ${plain.product?.product_name}`,
    });
  }

  return plain;
}

async function listDeleted() {
  const { PartyProductMapping } = getModels();
  const rows = await listDeletedLean(PartyProductMapping, {});
  return rows.map(toPlain);
}

async function softDelete(id, user) {
  const { PartyProductMapping, PartyProductRate } = getModels();

  const doc = await softDeleteActiveById(PartyProductMapping, id, { notFoundMessage: mappingNf });
  
  // Cascade soft delete to rates
  await PartyProductRate.updateMany(
    { mapping: id, deletedAt: null },
    { $set: { deletedAt: new Date() } }
  );

  const plain = toPlain(doc.toObject());
  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product || plain._id,
      action: 'deleted',
      message: `PartyProductMapping soft-deleted along with associated rates`,
    });
  }
  return plain;
}

async function restore(id, user) {
  const { PartyProductMapping, PartyProductRate } = getModels();

  const doc = await restoreSoftDeletedById(PartyProductMapping, id, { notFoundMessage: mappingNf });

  // Restore rates (only those deleted after mapping deletion or simply restore all)
  await PartyProductRate.updateMany(
    { mapping: id, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } }
  );

  const plain = toPlain(doc.toObject());
  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product || plain._id,
      action: 'updated',
      message: `PartyProductMapping and associated rates restored`,
    });
  }
  return plain;
}

// --- Specific Rate Operations ---

async function addRate(mappingId, rateData, user) {
  const { PartyProductMapping, PartyProductRate } = getModels();

  const mappingDoc = await PartyProductMapping.findOne({ _id: mappingId, deletedAt: null })
    .populate('party')
    .populate('product')
    .lean();
  if (!mappingDoc) {
    throw new ApiError(404, mappingNf);
  }

  const approvalReq = rateData.approval_required === true;
  const status = approvalReq ? 'draft' : (rateData.status && RATE_STATUSES.has(rateData.status) ? rateData.status : 'active');

  const payload = {
    mapping: mappingId,
    party: mappingDoc.party._id || mappingDoc.party,
    product: mappingDoc.product._id || mappingDoc.product,
    rate_type: rateData.rate_type,
    rate: Number(rateData.rate),
    min_qty: rateData.min_qty !== undefined ? Number(rateData.min_qty) : 1,
    max_qty: rateData.max_qty !== undefined ? Number(rateData.max_qty) : 999999,
    validity_start: new Date(rateData.validity_start),
    validity_end: new Date(rateData.validity_end),
    priority: rateData.priority !== undefined ? Number(rateData.priority) : 100,
    approval_required: approvalReq,
    status,
    remarks: rateData.remarks != null ? String(rateData.remarks).trim() : '',
  };

  if (user) {
    payload.created_by = user._id;
  }

  const rateDoc = await PartyProductRate.create(payload);
  const plain = toPlain(rateDoc.toObject());

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: mappingDoc.product._id || mappingDoc.product,
      action: 'created',
      message: `PartyProductRate of type ${plain.rate_type} set to ${plain.rate} for party ${mappingDoc.party?.party_name} and product ${mappingDoc.product?.product_name}`,
    });
  }

  return plain;
}

async function updateRate(rateId, patch, user) {
  const { PartyProductRate } = getModels();

  const doc = await PartyProductRate.findOne({ _id: rateId, deletedAt: null });
  if (!doc) throw new ApiError(404, rateNf);

  const sanitized = sanitizeRatePatch(patch);
  if (Object.keys(sanitized).length === 0) {
    throw new ApiError(400, 'No valid fields to patch');
  }

  const finalStart = sanitized.validity_start || doc.validity_start;
  const finalEnd = sanitized.validity_end || doc.validity_end;
  if (new Date(finalStart) >= new Date(finalEnd)) {
    throw new ApiError(400, 'validity_start must be before validity_end');
  }

  doc.set(sanitized);
  await doc.save();

  const populated = await PartyProductRate.findById(rateId)
    .populate('party')
    .populate('product')
    .lean();

  const plain = toPlain(populated);

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product?._id || plain._id,
      action: 'updated',
      message: `PartyProductRate updated for party ${plain.party?.party_name} and product ${plain.product?.product_name}`,
    });
  }
  return plain;
}

async function approveRate(rateId, user) {
  const { PartyProductRate } = getModels();

  const doc = await PartyProductRate.findOne({ _id: rateId, deletedAt: null });
  if (!doc) throw new ApiError(404, rateNf);

  if (doc.status !== 'draft') {
    throw new ApiError(400, `Rate is not in draft status (current: ${doc.status})`);
  }

  doc.status = 'active';
  if (user) {
    doc.approved_by = user._id;
  }
  doc.approved_at = new Date();

  await doc.save();

  const populated = await PartyProductRate.findById(rateId)
    .populate('party')
    .populate('product')
    .lean();

  const plain = toPlain(populated);

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product?._id || plain._id,
      action: 'approved',
      message: `PartyProductRate approved for party ${plain.party?.party_name} and product ${plain.product?.product_name}`,
    });
  }
  return plain;
}

async function deleteRate(rateId, user) {
  const { PartyProductRate } = getModels();

  const doc = await softDeleteActiveById(PartyProductRate, rateId, { notFoundMessage: rateNf });
  const plain = toPlain(doc.toObject());

  if (user) {
    await activityService.create({
      actor: user._id,
      entity_type: 'product',
      entity_id: plain.product || plain._id,
      action: 'deleted',
      message: `PartyProductRate soft-deleted`,
    });
  }
  return plain;
}

module.exports = {
  list,
  get,
  create,
  update,
  listDeleted,
  softDelete,
  restore,
  // Rate specific
  addRate,
  updateRate,
  approveRate,
  deleteRate,
};
