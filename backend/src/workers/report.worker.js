/**
 * @fileoverview Background worker (report.worker).
 * @module workers/report.worker
 */
/** Future: consume `report.queue`. */
function start() {
  let running = false;
  return {
    run: () => {
      running = true;
    },
    stop: () => {
      running = false;
    },
    isRunning: () => running,
  };
}

module.exports = { start };
