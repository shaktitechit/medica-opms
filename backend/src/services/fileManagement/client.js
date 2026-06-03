import {
  FILE_MANAGEMENT_API_KEY,
  FILE_MANAGEMENT_API_URL,
  FILE_MANAGEMENT_REQUEST_TIMEOUT_MS,
} from "../../config/fileManagement.js";
import { FileManagementError } from "./errors.js";
import logger from "../../config/logger.js";

function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error("Request timeout")), ms);
  if (typeof t.unref === "function") t.unref();
  return controller.signal;
}

/**
 * Low-level JSON client for the file-management REST API (X-Api-Key auth).
 */
export async function fmRequest(path, options = {}) {
  if (!FILE_MANAGEMENT_API_KEY) {
    throw new FileManagementError(
      "FILE_MANAGEMENT_API_KEY is not configured",
      { code: "FM_CONFIG", statusCode: 503 },
    );
  }

  const urlPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${FILE_MANAGEMENT_API_URL}${urlPath}`;
  const headers = {
    "X-Api-Key": FILE_MANAGEMENT_API_KEY,
    ...options.headers,
  };
  if (options.body != null && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const timeoutMs =
    options.timeoutMs ?? FILE_MANAGEMENT_REQUEST_TIMEOUT_MS;
  const { timeoutMs: _omit, ...fetchRest } = options;
  const signal = options.signal ?? createTimeoutSignal(timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      ...fetchRest,
      headers,
      signal,
    });
  } catch (err) {
    const hint =
      /localhost|127\.0\.0\.1/.test(FILE_MANAGEMENT_API_URL) &&
      process.env.NODE_ENV !== "test"
        ? " From Docker, use a reachable host (e.g. host.docker.internal) for FILE_MANAGEMENT_API_URL."
        : "";
    logger.warn("File management request failed (network)", {
      url: url.replace(/\/\/[^@/]+@/, "//***@"),
      message: err?.message,
    });
    throw new FileManagementError(
      `File management service unreachable: ${err?.message || err}${hint}`,
      { code: "FM_NETWORK", statusCode: 502, cause: err },
    );
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    const msg =
      data.message ||
      data.error ||
      `File management request failed (${res.status})`;
    throw new FileManagementError(msg, {
      code: "FM_HTTP",
      statusCode: res.status >= 500 ? 502 : 400,
      upstreamStatus: res.status,
    });
  }

  return data;
}

export async function fmJson(path, body, method = "POST", extra = {}) {
  return fmRequest(path, {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    ...extra,
  });
}
