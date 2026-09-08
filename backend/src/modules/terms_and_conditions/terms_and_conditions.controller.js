/**
 * @fileoverview Controller for TermsAndConditions and TermsText.
 * @module modules/terms_and_conditions/terms_and_conditions.controller
 */
const termsService = require('./terms_and_conditions.service');

async function create(req, res, next) {
  try {
    const result = await termsService.createTermsAndConditions(req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const result = await termsService.listTermsAndConditions(req.query, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const result = await termsService.getTermsAndConditionsById(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const result = await termsService.updateTermsAndConditions(req.params.id, req.body, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await termsService.deleteTermsAndConditions(req.params.id, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function addText(req, res, next) {
  try {
    const result = await termsService.addTermsText(req.params.id, req.body, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function updateText(req, res, next) {
  try {
    const result = await termsService.updateTermsText(req.params.textId, req.body, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteText(req, res, next) {
  try {
    const result = await termsService.deleteTermsText(req.params.textId, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getDefault(req, res, next) {
  try {
    const type = req.query.type || 'quotation';
    const result = await termsService.getDefaultTermsByType(type);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  addText,
  updateText,
  deleteText,
  getDefault,
};
