export function pickOrders(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    "items" in raw &&
    Array.isArray((raw as { items: unknown }).items)
  ) {
    return (raw as { items: unknown[] }).items;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "data" in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return (raw as { data: unknown[] }).data;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "orders" in raw &&
    Array.isArray((raw as { orders: unknown }).orders)
  ) {
    return (raw as { orders: unknown[] }).orders;
  }
  return [];
}
