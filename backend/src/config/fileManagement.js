import env from "./env.js";

function stripTrailingSlash(url) {
  return String(url || "").replace(/\/$/, "");
}

/**
 * Base URL of the file-management HTTP API including `/api`, e.g. `https://files.example.com/api`
 */
export const FILE_MANAGEMENT_API_URL = stripTrailingSlash(
  env.FILE_MANAGEMENT_API_URL
);

/**
 * Per-user API key (`fm_...`) for server-to-server calls (header `X-Api-Key`).
 */
export const FILE_MANAGEMENT_API_KEY = env.FILE_MANAGEMENT_API_KEY;

export const FILE_DOCUMENT_LINKS_RELATIVE = env.FILE_DOCUMENT_LINKS_RELATIVE;

/** Used only when {@link FILE_DOCUMENT_LINKS_RELATIVE} is false. */
export const API_PUBLIC_BASE_URL = env.API_PUBLIC_BASE_URL;

/** Timeout for JSON calls to the file-management API (ms). */
export const FILE_MANAGEMENT_REQUEST_TIMEOUT_MS = env.FILE_MANAGEMENT_REQUEST_TIMEOUT_MS;

/** Max time to wait for file processing after upload (ms). */
export const FILE_MANAGEMENT_UPLOAD_MAX_WAIT_MS = env.FILE_MANAGEMENT_UPLOAD_MAX_WAIT_MS;

/** Interval when polling file status (ms). */
export const FILE_MANAGEMENT_POLL_INTERVAL_MS = env.FILE_MANAGEMENT_POLL_INTERVAL_MS;

/**
 * Dev-only: allow HTTPS to object storage (presigned PUT) with self-signed certs.
 * Never enable in production.
 */
export const FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE = env.FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE;

/**
 * Validate configuration at startup in production.
 */
export function assertFileManagementConfig() {
  if (process.env.NODE_ENV !== "production") return;

  if (!FILE_MANAGEMENT_API_KEY) {
    console.warn(
      "[file-management] FILE_MANAGEMENT_API_KEY is empty — uploads will fail in production.",
    );
  }

  try {
    // eslint-disable-next-line no-new
    new URL(FILE_MANAGEMENT_API_URL);
  } catch {
    console.error(
      "[file-management] FILE_MANAGEMENT_API_URL is not a valid URL:",
      FILE_MANAGEMENT_API_URL,
    );
  }
}
