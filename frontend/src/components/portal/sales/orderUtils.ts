import { deriveOrderWorkflowStatus } from "@/components/portal/shared/orderLifecycle";

export function getOrderTabCategory(order: unknown): "draft" | "open" | "closed" | "on_hold" | "cancelled" | "rejected" {
  if (!order || typeof order !== "object") return "open";
  const row = order as Record<string, unknown>;
  const status = deriveOrderWorkflowStatus(row);

  if (status === "draft") return "draft";
  if (status === "on_hold") return "on_hold";
  if (status === "cancelled") return "cancelled";
  if (status === "finance_rejected") return "rejected";

  const items = Array.isArray(row.order_items) ? row.order_items : [];
  let ordered = 0;
  let delivered = 0;
  items.forEach((line: any) => {
    ordered += Number(line.ordered_quantity ?? line.quantity ?? 0);
    delivered += Number(line.delivered_quantity ?? 0);
  });

  if (ordered > 0 && delivered >= ordered) {
    return "closed";
  }

  return "open";
}
