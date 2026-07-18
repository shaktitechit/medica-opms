import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";

export type CatalogPriceSource = {
  base_price?: number | string;
  minimum_sale_rate?: number | string;
  mrp?: number | string;
  default_price?: number | string;
};

/** Catalog list/default price for SR / SSR / CR. */
export function catalogPriceForRateType(
  product: CatalogPriceSource | undefined,
  rateType: string,
): number {
  if (!product) return 0;
  const base = Number(product.base_price ?? product.default_price ?? 0);
  if (rateType === "SR") return base;
  if (rateType === "SRA") return Number(product.minimum_sale_rate ?? base);
  if (rateType === "CR") return Number(product.mrp ?? base);
  return base;
}

/** Prefer active negotiated party rate when available; otherwise catalog price. */
export function resolveLineUnitPrice(
  rateItem: CheckOrderRatesItem | undefined,
  catalogProduct: CatalogPriceSource | undefined,
  rateType: string,
): number {
  if (
    rateItem?.hasRate &&
    rateItem.currentMappedRate != null &&
    Number.isFinite(Number(rateItem.currentMappedRate))
  ) {
    return Number(rateItem.currentMappedRate);
  }
  return catalogPriceForRateType(catalogProduct, rateType);
}

/** Align with backend: MANUAL lines resolve party rates as SR. */
export function normalizeRateTypeForLookup(
  rateType: string | undefined | null,
): string {
  const t = String(rateType ?? "SR")
    .trim()
    .toUpperCase();
  if (t === "MANUAL") return "SR";
  if (t === "SR" || t === "SRA" || t === "CR") return t;
  return "SR";
}

export function rateLookupKey(productId: string, rateType: string): string {
  return `${productId}:${normalizeRateTypeForLookup(rateType)}`;
}

export type RateDisplayStatus = "negotiated" | "expired" | "not_negotiated";

export function resolveRateDisplayStatus(
  item: CheckOrderRatesItem | undefined,
): RateDisplayStatus {
  if (!item) return "not_negotiated";
  if (item.hasRate && item.isMapped) return "negotiated";
  if (item.isRateExpired) return "expired";
  return "not_negotiated";
}

function formatValidityDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function LineRateStatusBadge({
  status,
  rateItem,
  formatMoney,
}: {
  status: RateDisplayStatus;
  rateItem: CheckOrderRatesItem | undefined;
  formatMoney: (v: unknown) => string;
}) {
  const mappedRate =
    rateItem?.currentMappedRate != null
      ? formatMoney(rateItem.currentMappedRate)
      : null;
  const validityEnd = formatValidityDate(rateItem?.validityEnd);

  if (status === "negotiated") {
    return (
      <span
        className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-500/20"
        title={
          mappedRate
            ? `Negotiated at ${mappedRate}${validityEnd ? ` · valid until ${validityEnd}` : ""}`
            : "Mapped with an active negotiated rate"
        }
      >
        Negotiated
      </span>
    );
  }

  if (status === "expired") {
    return (
      <span
        className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/25"
        title={
          validityEnd
            ? `Negotiated period expired${mappedRate ? ` · last rate ${mappedRate}` : ""} · ended ${validityEnd}`
            : "Mapped rate exists but the negotiated period has expired"
        }
      >
        Expired
      </span>
    );
  }

  return (
    <span
      className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-2xs font-semibold text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-500/20"
      title="No active mapped rate for this party, product, and rate type"
    >
      Not negotiated
    </span>
  );
}
