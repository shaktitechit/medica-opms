/**
 * Structured error for file-management integration (API + presigned storage).
 */
export class FileManagementError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code] - machine-readable: e.g. FM_CONFIG, FM_HTTP, FM_STORAGE, FM_TIMEOUT
   * @param {number} [opts.statusCode] - HTTP status to return to API clients when bubbled
   * @param {number} [opts.upstreamStatus] - status from file-management HTTP API
   * @param {unknown} [opts.cause]
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = "FileManagementError";
    this.code = opts.code || "FM_ERROR";
    this.statusCode = opts.statusCode ?? 502;
    this.upstreamStatus = opts.upstreamStatus;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}
