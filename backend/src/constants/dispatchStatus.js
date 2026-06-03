/**
 * @fileoverview Shared constants (dispatchStatus).
 * @module constants/dispatchStatus
 */
const { DISPATCH_STATUS } = require('./domain');

const DISPATCH_STATUS_VALUES = Object.freeze(Object.values(DISPATCH_STATUS));

module.exports = { DISPATCH_STATUS, DISPATCH_STATUS_VALUES };
