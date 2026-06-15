/** Helpers for account order closure — map warehouse returns to order lines. */

function refId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

function grossAcceptedQty(line: Record<string, unknown>): number {
  const delivered = Number(line.delivered_quantity || 0);
  const dispatched = Number(line.dispatched_quantity || 0);
  const approved = Number(line.approved_quantity || 0);
  if (delivered > 0) return delivered;
  if (dispatched > 0) return dispatched;
  return approved;
}

export function aggregateReceivedReturnsByProduct(returns: Record<string, unknown>[]) {
  const map: Record<string, number> = {};
  for (const ret of returns) {
    if (String(ret.return_status || "") !== "received") continue;
    const items = Array.isArray(ret.return_items) ? ret.return_items : [];
    for (const item of items) {
      const pid = refId((item as Record<string, unknown>).product);
      if (!pid) continue;
      map[pid] =
        (map[pid] || 0) + Number((item as Record<string, unknown>).returned_quantity || 0);
    }
  }
  return map;
}

export function aggregateReceivedReturnsByOrderLine(
  returns: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
) {
  const byLine: Record<string, number> = {};
  const dispatchById: Record<string, Record<string, unknown>> = {};
  for (const dispatch of dispatches) {
    dispatchById[String(dispatch._id ?? dispatch.id ?? "")] = dispatch;
  }

  for (const ret of returns) {
    if (String(ret.return_status || "") !== "received") continue;
    const dispatch = dispatchById[refId(ret.dispatch)];
    if (!dispatch) continue;

    const items = Array.isArray(ret.return_items) ? ret.return_items : [];
    for (const rawItem of items) {
      const item = rawItem as Record<string, unknown>;
      const productId = refId(item.product);
      const qty = Number(item.returned_quantity || 0);
      if (!productId || qty <= 0) continue;

      const dispatchItems = Array.isArray(dispatch.dispatch_items) ? dispatch.dispatch_items : [];
      const matching = dispatchItems.filter(
        (di) => refId((di as Record<string, unknown>).product) === productId,
      );

      if (matching.length === 1) {
        const key = String((matching[0] as Record<string, unknown>).order_item_id ?? "");
        byLine[key] = (byLine[key] || 0) + qty;
        continue;
      }

      if (matching.length > 1) {
        const totalDisp = matching.reduce(
          (sum, di) => sum + Number((di as Record<string, unknown>).dispatched_quantity || 0),
          0,
        );
        let allocated = 0;
        matching.forEach((di, idx) => {
          const row = di as Record<string, unknown>;
          const key = String(row.order_item_id ?? "");
          let share: number;
          if (idx === matching.length - 1) {
            share = qty - allocated;
          } else if (totalDisp > 0) {
            share = Math.round((Number(row.dispatched_quantity || 0) / totalDisp) * qty);
          } else {
            share = Math.floor(qty / matching.length);
          }
          allocated += share;
          byLine[key] = (byLine[key] || 0) + share;
        });
      }
    }
  }

  return byLine;
}

export type SettlementPreviewLine = {
  lineId: string;
  productName: string;
  grossAcceptedQty: number;
  returnedQty: number;
  netQty: number;
  unitPrice: number;
  gstPercent: number;
  discountAmount: number;
  discountPercent: number;
  taxable: number;
  gst: number;
  lineTotal: number;
};

export function buildSettlementPreviewLines(
  orderItems: Record<string, unknown>[],
  returns: Record<string, unknown>[],
  dispatches: Record<string, unknown>[],
): SettlementPreviewLine[] {
  const returnedByLine = aggregateReceivedReturnsByOrderLine(returns, dispatches);
  const returnedByProduct = aggregateReceivedReturnsByProduct(returns);

  return orderItems.map((line) => {
    const lineId = String(line._id ?? line.id ?? "");
    const pid = refId(line.product);
    const gross = grossAcceptedQty(line);
    const returnedQty = returnedByLine[lineId] ?? returnedByProduct[pid] ?? 0;
    const cappedReturned = Math.max(0, Math.min(returnedQty, gross));
    const netQty = Math.max(0, gross - cappedReturned);
    const unitPrice = Number(line.unit_price || 0);
    const gstPercent = Number(line.gst_percent || 0);
    const discountPercent = Number(line.discount_percent || 0);

    const lineGross = netQty * unitPrice;
    let discountAmount = Number(line.discount_amount || 0);
    if (discountPercent > 0) {
      discountAmount = (lineGross * discountPercent) / 100;
    }
    const taxable = Math.max(0, lineGross - discountAmount);
    const gst = (taxable * gstPercent) / 100;

    return {
      lineId,
      productName: String(line.product_name || "—"),
      grossAcceptedQty: gross,
      returnedQty: cappedReturned,
      netQty,
      unitPrice,
      gstPercent,
      discountAmount,
      discountPercent,
      taxable,
      gst,
      lineTotal: taxable + gst,
    };
  });
}

export function hasPendingReturns(returns: Record<string, unknown>[]): boolean {
  return returns.some((r) => String(r.return_status || "") === "pending");
}
