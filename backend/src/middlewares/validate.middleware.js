/**
 * @fileoverview Express middleware (validate.middleware).
 * @module middlewares/validate.middleware
 */
/** Request validation placeholder — plug in Joi / Zod / express-validator. */
function validate(schema) {
  return function validateMiddleware(req, res, next) {
    next();
  };
}

module.exports = { validate };
