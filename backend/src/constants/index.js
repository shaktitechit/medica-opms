/**
 * @fileoverview Shared constants (index).
 * @module constants/index
 */
const domain = require('./domain');

module.exports = {
  ...domain,
  ...require('./orderStatus'),
  ...require('./dispatchStatus'),
  ...require('./paymentStatus'),
  ...require('./flagTypes'),
  ...require('./permissions'),
};
