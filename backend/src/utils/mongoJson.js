/**
 * @fileoverview Utilities (mongoJson).
 * @module utils/mongoJson
 */
/**
 * Convert Mongoose documents / lean objects to JSON-safe plain data (ObjectId → string).
 * @param {unknown} doc
 */
function toPlain(doc) {
  if (doc == null) return doc;
  return JSON.parse(JSON.stringify(doc));
}

module.exports = { toPlain };
