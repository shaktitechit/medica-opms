/**
 * @fileoverview SSE (Server-Sent Events) connection manager.
 * Maintains a registry of connected clients per userId.
 * @module config/sse
 */

/** @type {Map<string, Set<import('express').Response>>} userId → set of SSE response objects */
const clients = new Map();

/**
 * Register an SSE client for a user.
 * @param {string} userId
 * @param {import('express').Response} res
 */
function addClient(userId, res) {
  const uid = String(userId);
  if (!clients.has(uid)) clients.set(uid, new Set());
  clients.get(uid).add(res);
}

/**
 * Remove an SSE client for a user.
 * @param {string} userId
 * @param {import('express').Response} res
 */
function removeClient(userId, res) {
  const uid = String(userId);
  const set = clients.get(uid);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(uid);
}

/**
 * Emit a named SSE event with JSON data to all connected clients for a user.
 * @param {string} userId
 * @param {string} event - SSE event name
 * @param {object} data
 */
function emitToUser(userId, event, data) {
  const uid = String(userId);
  const set = clients.get(uid);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch (_) {
      // Client disconnected; will be cleaned up via close event
    }
  }
}

/**
 * Emit a named SSE event to a list of userIds simultaneously.
 * @param {Iterable<string>} userIds
 * @param {string} event
 * @param {object} data
 */
function emitToUsers(userIds, event, data) {
  for (const uid of userIds) {
    emitToUser(uid, event, data);
  }
}

module.exports = { addClient, removeClient, emitToUser, emitToUsers };
