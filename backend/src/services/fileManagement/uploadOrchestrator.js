import {
  FILE_MANAGEMENT_POLL_INTERVAL_MS,
  FILE_MANAGEMENT_UPLOAD_MAX_WAIT_MS,
} from "../../config/fileManagement.js";
import { fmJson } from "./client.js";
import { FileManagementError } from "./errors.js";
import { putToPresignedUrl } from "./presignedUpload.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getFileMeta(fileId) {
  return fmJson(`/files/${fileId}`, undefined, "GET");
}

async function waitUntilFileAccessible(fileId) {
  const start = Date.now();
  const maxWait = FILE_MANAGEMENT_UPLOAD_MAX_WAIT_MS;
  const interval = FILE_MANAGEMENT_POLL_INTERVAL_MS;

  while (Date.now() - start < maxWait) {
    const meta = await getFileMeta(fileId);
    if (meta.status === "ready" || meta.status === "uploaded") {
      return meta;
    }
    if (meta.status === "failed" || meta.scanStatus === "infected") {
      throw new FileManagementError(
        "File failed processing or was blocked",
        { code: "FM_PROCESSING", statusCode: 400 },
      );
    }
    await sleep(interval);
  }

  return getFileMeta(fileId);
}

async function uploadSinglePart(file, initiate) {
  const headers = initiate.headers || { "Content-Type": file.mimetype };
  await putToPresignedUrl(initiate.presignedUrl, headers, file.buffer);

  await fmJson(
    "/files/upload/complete",
    { fileId: initiate.fileId },
    "POST",
  );
  await waitUntilFileAccessible(initiate.fileId);
  return initiate.fileId;
}

async function uploadMultipart(file, initiate) {
  const { fileId, partSizeBytes, partCount } = initiate;
  const parts = [];
  const buf = file.buffer;

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const start = (partNumber - 1) * partSizeBytes;
    const end = Math.min(start + partSizeBytes, buf.length);
    const chunk = buf.subarray(start, end);

    const { url } = await fmJson("/files/upload/part-url", {
      fileId,
      partNumber,
    });

    const putRes = await putToPresignedUrl(url, {}, chunk);
    const rawEtag = String(putRes.headers?.etag || "");
    parts.push({ partNumber, etag: rawEtag });
  }

  await fmJson(
    "/files/upload/complete",
    {
      fileId,
      parts: parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag.replace(/^"|"$/g, ""),
      })),
    },
    "POST",
  );
  await waitUntilFileAccessible(fileId);
  return fileId;
}

/**
 * Upload a Multer file to object storage via the file-management API.
 *
 * @param {import("multer").File} file
 * @param {string} resourceType - e.g. `facility`, `utility_account`
 * @param {string} resourceId - Mongo ObjectId hex
 * @returns {Promise<string>} fileId
 */
export async function uploadMulterFile(file, resourceType, resourceId) {
  const sizeBytes = file.buffer?.length ?? 0;
  if (sizeBytes < 1) {
    throw new FileManagementError("Empty file buffer", {
      code: "FM_VALIDATION",
      statusCode: 400,
    });
  }

  const body = {
    originalName: file.originalname || "upload",
    sizeBytes,
    mimeType: file.mimetype || "application/octet-stream",
    resourceType,
    resourceId: String(resourceId),
  };

  const initiate = await fmJson("/files/upload/initiate", body, "POST");

  if (initiate.uploadMode === "multipart") {
    return uploadMultipart(file, initiate);
  }

  return uploadSinglePart(file, initiate);
}

export async function getViewPresignedUrl(fileId) {
  const data = await fmJson(`/files/${fileId}/view-url`, undefined, "GET");
  return data.url;
}

export async function getDownloadPresignedUrl(fileId) {
  const data = await fmJson(
    `/files/${fileId}/download-url`,
    undefined,
    "GET",
  );
  return data.url;
}
