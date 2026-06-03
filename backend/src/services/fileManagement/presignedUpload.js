import http from "node:http";
import https from "node:https";
import { URL as NodeURL } from "node:url";

import { FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE } from "../../config/fileManagement.js";
import { FileManagementError } from "./errors.js";

/**
 * PUT bytes to an S3/MinIO presigned URL using Node core http/https (not undici fetch).
 */
export function putToPresignedUrl(presignedUrl, headerMap, bodyBuffer) {
  const u = new NodeURL(presignedUrl);
  const isHttps = u.protocol === "https:";
  const lib = isHttps ? https : http;

  const headers = {
    ...normalizeHeaders(headerMap),
    "Content-Length": String(bodyBuffer.length),
  };

  const requestOptions = {
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: `${u.pathname}${u.search}`,
    method: "PUT",
    headers,
    ...(isHttps
      ? { rejectUnauthorized: !FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE }
      : {}),
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(requestOptions, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
          });
        } else {
          reject(
            new FileManagementError(
              `Presigned upload failed (${res.statusCode}): ${text.slice(0, 500)}`,
              { code: "FM_STORAGE", statusCode: 502 },
            ),
          );
        }
      });
    });

    req.on("error", (err) => {
      const hostHint =
        u.hostname === "localhost" || u.hostname === "127.0.0.1"
          ? " Presigned URL uses localhost — from another container that is not object storage. Configure the file-service signing endpoint to a host reachable from this process."
          : "";
      const dnsHint =
        err.code === "EAI_AGAIN" ||
        err.code === "ENOTFOUND" ||
        String(err.message || "").includes("getaddrinfo")
          ? ` Cannot resolve host "${u.hostname}". Use the same Docker network as MinIO, map the hostname (e.g. extra_hosts), or fix the public endpoint used for signing.`
          : "";
      const tlsHint =
        err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
        err.code === "CERT_HAS_EXPIRED" ||
        err.message?.includes("certificate")
          ? " Set FILE_MANAGEMENT_PRESIGNED_TLS_INSECURE=true only in development if using self-signed storage."
          : "";

      reject(
        new FileManagementError(
          `Upload to storage failed: ${err.message || err}.${hostHint}${dnsHint}${tlsHint}`,
          { code: "FM_STORAGE", statusCode: 502, cause: err },
        ),
      );
    });

    req.write(bodyBuffer);
    req.end();
  });
}

function normalizeHeaders(headerMap) {
  if (!headerMap) return {};
  if (headerMap instanceof Headers) {
    return Object.fromEntries(headerMap.entries());
  }
  return { ...headerMap };
}
