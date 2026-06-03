/**
 * @fileoverview Dashboard KPIs (dashboard slice / finance.dashboard).
 * @module modules/dashboard/finance.dashboard
 */
const financeService = require('../finance/finance.service');

async function summary() {
  const q = await financeService.financeQueue();
  const s = await financeService.summary();
  return {
    queue_size: Array.isArray(q) ? q.length : 0,
    awaiting_finance: s.awaiting_finance,
  };
}

module.exports = { summary };
