/**
 * @fileoverview Shared constants (orderStatus).
 * @module constants/orderStatus
 */
const { ORDER_STATUS } = require('./domain');

const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));

module.exports = { ORDER_STATUS, ORDER_STATUS_VALUES };
