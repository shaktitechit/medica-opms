/** Shared display helpers for fleet masters (vehicles, drivers, transport agents). */

export function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function idFromRef(ref: unknown): string {
  if (typeof ref === "string") return ref.trim();
  if (ref && typeof ref === "object") {
    const o = ref as Record<string, unknown>;
    return String(o._id ?? o.id ?? "").trim();
  }
  return "";
}

export function transportAgentLabel(ref: unknown): string {
  if (!ref) return "—";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object") {
    const o = ref as Record<string, unknown>;
    const name = stringField(o.agent_name);
    const code = stringField(o.agent_code);
    if (name && code) return `${name} (${code})`;
    return name || code || idFromRef(ref) || "—";
  }
  return "—";
}

export function formatVehicleCapacity(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const kg = row.capacity_kg;
  const cft = row.capacity_cft;
  if (kg != null && kg !== "" && !Number.isNaN(Number(kg))) {
    parts.push(`${kg} kg`);
  }
  if (cft != null && cft !== "" && !Number.isNaN(Number(cft))) {
    parts.push(`${cft} cft`);
  }
  const legacy = stringField(row.capacity);
  if (parts.length) return parts.join(" · ");
  return legacy || "—";
}

export function formatAgentType(type: unknown): string {
  const t = stringField(type);
  if (!t) return "—";
  return t.replace(/_/g, " ");
}
