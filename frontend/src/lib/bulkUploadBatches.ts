/** Rows per bulk-import API request for products (keeps payloads under server/nginx limits). */
export const BULK_UPLOAD_BATCH_SIZE = 50;

/** Parties often include multiple contacts — use smaller batches. */
export const BULK_PARTY_UPLOAD_BATCH_SIZE = 25;

export function chunkArray<T>(items: T[], size = BULK_UPLOAD_BATCH_SIZE): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function batchCount(items: unknown[], size: number): number {
  if (items.length === 0) return 0;
  return Math.ceil(items.length / size);
}

export async function uploadInBatches<T>(
  items: T[],
  uploadBatchFn: (batch: T[]) => Promise<unknown>,
  options?: {
    batchSize?: number;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<number> {
  const size = options?.batchSize ?? BULK_UPLOAD_BATCH_SIZE;
  const batches = chunkArray(items, size);
  let imported = 0;

  for (let i = 0; i < batches.length; i++) {
    options?.onProgress?.(i + 1, batches.length);
    const result = await uploadBatchFn(batches[i]);
    imported += Array.isArray(result) ? result.length : batches[i].length;
  }

  return imported;
}
