/**
 * @fileoverview Service for managing TermsAndConditions and their associated TermsText.
 * @module modules/terms_and_conditions/terms_and_conditions.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { ApiError } = require('../../utils/ApiError');

/**
 * Creates a new TermsAndConditions record along with its multiple associated TermsText items.
 * @param {Object} data
 * @param {Object} [user]
 */
async function createTermsAndConditions(data, user) {
  const { TermsAndConditions, TermsText } = getModels();

  if (!data.title || !data.title.trim()) {
    throw new ApiError(400, 'Title is required for Terms and Conditions');
  }

  // If set as default, unset previous defaults of same type
  if (data.is_default) {
    await TermsAndConditions.updateMany(
      { type: data.type || 'general', deletedAt: null },
      { $set: { is_default: false } }
    );
  }

  const termsDoc = await TermsAndConditions.create({
    title: data.title.trim(),
    code: data.code ? data.code.trim().toLowerCase() : undefined,
    type: data.type || 'general',
    description: data.description ? data.description.trim() : undefined,
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    is_default: Boolean(data.is_default),
    created_by: user?._id || user?.id,
    updated_by: user?._id || user?.id,
  });

  // Handle creating multiple TermsText records for this TermsAndConditions
  let termsTextDocs = [];
  if (Array.isArray(data.terms_text) && data.terms_text.length > 0) {
    const textItemsToCreate = data.terms_text
      .map((item, idx) => {
        const textVal = typeof item === 'string' ? item : item.text;
        const seqVal = typeof item === 'object' && item.sequence != null ? Number(item.sequence) : idx + 1;
        return {
          terms_and_conditions_id: termsDoc._id,
          text: String(textVal || '').trim(),
          sequence: seqVal,
          is_active: typeof item === 'object' && item.is_active !== undefined ? Boolean(item.is_active) : true,
          created_by: user?._id || user?.id,
          updated_by: user?._id || user?.id,
        };
      })
      .filter((t) => Boolean(t.text));

    if (textItemsToCreate.length > 0) {
      termsTextDocs = await TermsText.insertMany(textItemsToCreate);
    }
  }

  const result = termsDoc.toObject();
  result.terms_text = termsTextDocs;
  return result;
}

/**
 * List all TermsAndConditions documents with pagination/search/type filters and populated terms_text.
 */
async function listTermsAndConditions(query = {}) {
  const { TermsAndConditions, TermsText } = getModels();
  const filter = { deletedAt: null };

  if (query.type) {
    filter.type = query.type;
  }
  if (query.is_active !== undefined) {
    filter.is_active = String(query.is_active) === 'true';
  }
  if (query.search && String(query.search).trim()) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ title: regex }, { code: regex }, { description: regex }];
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit, 10) || 50);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    TermsAndConditions.countDocuments(filter),
    TermsAndConditions.find(filter)
      .populate('created_by', 'name email')
      .sort({ is_default: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  // Populate multiple TermsText items for each TermsAndConditions
  const tcIds = items.map((doc) => doc._id);
  const allTexts = await TermsText.find({
    terms_and_conditions_id: { $in: tcIds },
    deletedAt: null,
  })
    .sort({ sequence: 1, createdAt: 1 })
    .lean();

  const textMap = new Map();
  for (const textDoc of allTexts) {
    const key = String(textDoc.terms_and_conditions_id);
    if (!textMap.has(key)) textMap.set(key, []);
    textMap.get(key).push(textDoc);
  }

  const populated = items.map((doc) => ({
    ...doc,
    terms_text: textMap.get(String(doc._id)) || [],
  }));

  return {
    terms_and_conditions: populated,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Get single TermsAndConditions by ID with its terms_text list.
 */
async function getTermsAndConditionsById(id) {
  const { TermsAndConditions, TermsText } = getModels();

  const doc = await TermsAndConditions.findOne({ _id: id, deletedAt: null })
    .populate('created_by', 'name email')
    .lean();
  if (!doc) throw new ApiError(404, 'Terms and Conditions record not found');

  const terms_text = await TermsText.find({
    terms_and_conditions_id: id,
    deletedAt: null,
  })
    .sort({ sequence: 1, createdAt: 1 })
    .lean();

  return {
    ...doc,
    terms_text,
  };
}

/**
 * Update TermsAndConditions and optionally sync/replace its terms_text items.
 */
async function updateTermsAndConditions(id, data, user) {
  const { TermsAndConditions, TermsText } = getModels();

  const doc = await TermsAndConditions.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Terms and Conditions record not found');

  if (data.is_default && !doc.is_default) {
    await TermsAndConditions.updateMany(
      { type: data.type || doc.type || 'general', deletedAt: null },
      { $set: { is_default: false } }
    );
  }

  if (data.title !== undefined) doc.title = data.title.trim();
  if (data.code !== undefined) doc.code = data.code ? data.code.trim().toLowerCase() : undefined;
  if (data.type !== undefined) doc.type = data.type;
  if (data.description !== undefined) doc.description = data.description.trim();
  if (data.is_active !== undefined) doc.is_active = Boolean(data.is_active);
  if (data.is_default !== undefined) doc.is_default = Boolean(data.is_default);
  doc.updated_by = user?._id || user?.id;

  await doc.save();

  // If terms_text array passed, sync/update the terms_text records
  if (Array.isArray(data.terms_text)) {
    // Soft delete existing terms_text for this record
    await TermsText.updateMany(
      { terms_and_conditions_id: id, deletedAt: null },
      { $set: { deletedAt: new Date() } }
    );

    const newItems = data.terms_text
      .map((item, idx) => {
        const textVal = typeof item === 'string' ? item : item.text;
        const seqVal = typeof item === 'object' && item.sequence != null ? Number(item.sequence) : idx + 1;
        return {
          terms_and_conditions_id: id,
          text: String(textVal || '').trim(),
          sequence: seqVal,
          is_active: typeof item === 'object' && item.is_active !== undefined ? Boolean(item.is_active) : true,
          created_by: user?._id || user?.id,
          updated_by: user?._id || user?.id,
        };
      })
      .filter((t) => Boolean(t.text));

    if (newItems.length > 0) {
      await TermsText.insertMany(newItems);
    }
  }

  return getTermsAndConditionsById(id);
}

/**
 * Soft delete a TermsAndConditions record and all associated TermsText items.
 */
async function deleteTermsAndConditions(id, user) {
  const { TermsAndConditions, TermsText } = getModels();

  const doc = await TermsAndConditions.findOne({ _id: id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'Terms and Conditions record not found');

  doc.deletedAt = new Date();
  doc.updated_by = user?._id || user?.id;
  await doc.save();

  await TermsText.updateMany(
    { terms_and_conditions_id: id, deletedAt: null },
    { $set: { deletedAt: new Date(), updated_by: user?._id || user?.id } }
  );

  return { message: 'Terms and Conditions and associated text items deleted successfully' };
}

/**
 * Add a single TermsText line item to a TermsAndConditions.
 */
async function addTermsText(termsAndConditionsId, data, user) {
  const { TermsAndConditions, TermsText } = getModels();

  const parent = await TermsAndConditions.findOne({ _id: termsAndConditionsId, deletedAt: null });
  if (!parent) throw new ApiError(404, 'Terms and Conditions record not found');

  if (!data.text || !String(data.text).trim()) {
    throw new ApiError(400, 'Text line content is required');
  }

  let seq = Number(data.sequence);
  if (isNaN(seq) || seq <= 0) {
    const count = await TermsText.countDocuments({ terms_and_conditions_id: termsAndConditionsId, deletedAt: null });
    seq = count + 1;
  }

  const newText = await TermsText.create({
    terms_and_conditions_id: termsAndConditionsId,
    text: String(data.text).trim(),
    sequence: seq,
    is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
    created_by: user?._id || user?.id,
    updated_by: user?._id || user?.id,
  });

  return newText;
}

/**
 * Update a specific TermsText item.
 */
async function updateTermsText(textId, data, user) {
  const { TermsText } = getModels();

  const textDoc = await TermsText.findOne({ _id: textId, deletedAt: null });
  if (!textDoc) throw new ApiError(404, 'Terms text item not found');

  if (data.text !== undefined) textDoc.text = String(data.text).trim();
  if (data.sequence !== undefined) textDoc.sequence = Number(data.sequence) || 1;
  if (data.is_active !== undefined) textDoc.is_active = Boolean(data.is_active);
  textDoc.updated_by = user?._id || user?.id;

  await textDoc.save();
  return textDoc;
}

/**
 * Delete a specific TermsText item.
 */
async function deleteTermsText(textId, user) {
  const { TermsText } = getModels();

  const textDoc = await TermsText.findOne({ _id: textId, deletedAt: null });
  if (!textDoc) throw new ApiError(404, 'Terms text item not found');

  textDoc.deletedAt = new Date();
  textDoc.updated_by = user?._id || user?.id;
  await textDoc.save();

  return { message: 'Terms text item deleted successfully' };
}

/**
 * Fetch active default TermsAndConditions with text items for a specified type (e.g. 'quotation').
 */
async function getDefaultTermsByType(type = 'quotation') {
  const { TermsAndConditions, TermsText } = getModels();

  let doc = await TermsAndConditions.findOne({
    type,
    is_default: true,
    is_active: true,
    deletedAt: null,
  }).lean();

  if (!doc) {
    doc = await TermsAndConditions.findOne({
      type,
      is_active: true,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!doc) return null;

  const terms_text = await TermsText.find({
    terms_and_conditions_id: doc._id,
    is_active: true,
    deletedAt: null,
  })
    .sort({ sequence: 1, createdAt: 1 })
    .lean();

  return {
    ...doc,
    terms_text,
  };
}

module.exports = {
  createTermsAndConditions,
  listTermsAndConditions,
  getTermsAndConditionsById,
  updateTermsAndConditions,
  deleteTermsAndConditions,
  addTermsText,
  updateTermsText,
  deleteTermsText,
  getDefaultTermsByType,
};
