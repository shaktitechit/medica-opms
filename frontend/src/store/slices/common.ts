/** RTK scaffolding shared across API slices (Swagger tags in backend `docs/swagger.js`). */

export type SliceStatus = "idle" | "loading" | "succeeded" | "failed";

export interface DomainSliceState {
  status: SliceStatus;
  error: string | null;
}

export function emptyDomainState(): DomainSliceState {
  return { status: "idle", error: null };
}
