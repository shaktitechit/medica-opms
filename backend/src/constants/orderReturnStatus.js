const ORDER_RETURN_STATUS = {
  PENDING: 'pending',
  RECEIVED_AT_WAREHOUSE: 'received_at_warehouse',
};

const ORDER_RETURN_STATUS_VALUES = Object.values(ORDER_RETURN_STATUS);

function normalizeReturnStatus(status) {
  const s = String(status || ORDER_RETURN_STATUS.PENDING);
  if (s === 'received') return ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE;
  return s;
}

function isReturnReceivedAtWarehouse(status) {
  return normalizeReturnStatus(status) === ORDER_RETURN_STATUS.RECEIVED_AT_WAREHOUSE;
}

function isReturnPending(status) {
  return normalizeReturnStatus(status) === ORDER_RETURN_STATUS.PENDING;
}

module.exports = {
  ORDER_RETURN_STATUS,
  ORDER_RETURN_STATUS_VALUES,
  normalizeReturnStatus,
  isReturnReceivedAtWarehouse,
  isReturnPending,
};
