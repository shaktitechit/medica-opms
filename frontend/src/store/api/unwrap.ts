/** Medica `{ success: true, data }` envelopes from `backend` controllers. */

export interface ApiEnvelope<T = unknown> {
  success?: boolean;
  /** Error payloads may omit `data` or shape it differently. */
  data: T;
  message?: string;
}

/** Use with `transformResponse` on endpoints. */
export function unwrapEnvelope<T>(raw: ApiEnvelope<T>): T {
  return raw.data;
}
