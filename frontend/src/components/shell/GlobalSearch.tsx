"use client";

import { Search, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { toast } from "@/lib/toast";
import { useLazyListOrdersQuery, useListPartiesQuery } from "@/store/api";

type GlobalSearchProps = {
  portal: string;
};

type OrderHit = {
  id: string;
  orderNo: string;
  partyLabel: string;
};

function orderId(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const o = row as { _id?: unknown; id?: unknown };
  if (o._id != null) return String(o._id);
  if (o.id != null) return String(o.id);
  return "";
}

function orderNo(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const o = row as { order_no?: unknown; order_number?: unknown };
  if (typeof o.order_no === "string" && o.order_no.trim()) return o.order_no.trim();
  if (typeof o.order_number === "string" && o.order_number.trim()) {
    return o.order_number.trim();
  }
  return "—";
}

function toHits(
  raw: unknown,
  partyNameById: Map<string, string>,
): OrderHit[] {
  return pickOrders(raw)
    .map((row) => {
      const id = orderId(row);
      if (!id) return null;
      const detail =
        row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const party = resolveOrderCounterparty(detail, partyNameById);
      return {
        id,
        orderNo: orderNo(row),
        partyLabel: party === "—" ? "" : party,
      };
    })
    .filter((h): h is OrderHit => h != null)
    .slice(0, 8);
}

export function GlobalSearch({ portal }: GlobalSearchProps) {
  const id = useId();
  const router = useRouter();
  const rootRef = useRef<HTMLFormElement | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<OrderHit[]>([]);
  const [trigger, result] = useLazyListOrdersQuery();
  const partiesQ = useListPartiesQuery({});
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const goToOrdersList = useCallback(
    (term: string) => {
      router.push(`/${portal}/orders?q=${encodeURIComponent(term)}`);
      setOpen(false);
    },
    [portal, router],
  );

  const goToOrder = useCallback(
    (orderIdValue: string) => {
      router.push(`/${portal}/order/${orderIdValue}`);
      setOpen(false);
      setQ("");
      setHits([]);
    },
    [portal, router],
  );

  const runSearch = useCallback(
    async (term: string, navigate: boolean) => {
      const qTrim = term.trim();
      if (!qTrim) {
        if (navigate) toast.message("Enter an order # or party name to search.");
        setHits([]);
        return;
      }

      try {
        const data = await trigger({ search: qTrim }).unwrap();
        const nextHits = toHits(data, partyNameById);
        setHits(nextHits);
        setOpen(true);

        if (!navigate) return;

        if (nextHits.length === 1) {
          goToOrder(nextHits[0].id);
          return;
        }
        goToOrdersList(qTrim);
      } catch {
        if (navigate) {
          toast.error("Could not search orders. Try again.");
        }
      }
    },
    [trigger, goToOrder, goToOrdersList, partyNameById],
  );

  // Re-resolve labels once parties finish loading after a search response.
  useEffect(() => {
    if (!result.data || partyNameById.size === 0) return;
    setHits(toHits(result.data, partyNameById));
  }, [result.data, partyNameById]);

  useEffect(() => {
    const qTrim = q.trim();
    if (qTrim.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void runSearch(qTrim, false);
    }, 280);
    return () => window.clearTimeout(t);
  }, [q, runSearch]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const isSearching = result.isFetching || result.isLoading;

  return (
    <form
      ref={rootRef}
      className="relative min-h-10 min-w-0 flex-1 lg:max-w-2xl"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        void runSearch(q, true);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Search orders by order number or party name
      </label>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted">
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Search className="h-4 w-4" aria-hidden />
        )}
      </span>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (hits.length > 0) setOpen(true);
        }}
        placeholder="Search order # or party…"
        autoComplete="off"
        className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-8 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/25"
      />
      {q ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            setHits([]);
            setOpen(false);
          }}
          className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-2.5 text-muted transition hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {open && q.trim().length >= 2 ? (
        <div
          className="absolute left-0 right-0 top-full z-[60] mt-1 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
          role="listbox"
          aria-label="Order search results"
        >
          {isSearching && hits.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted">Searching…</p>
          ) : null}
          {!isSearching && hits.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted">
              No orders match &quot;{q.trim()}&quot;
            </p>
          ) : null}
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              role="option"
              onClick={() => goToOrder(hit.id)}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-surface-muted"
            >
              <span className="text-sm font-semibold text-foreground">
                {hit.orderNo}
              </span>
              {hit.partyLabel ? (
                <span className="truncate text-xs text-muted">{hit.partyLabel}</span>
              ) : null}
            </button>
          ))}
          {hits.length > 0 ? (
            <button
              type="button"
              onClick={() => goToOrdersList(q.trim())}
              className="w-full border-t border-border px-3 py-2 text-left text-xs font-semibold text-primary transition hover:bg-primary-muted"
            >
              View all matches in orders
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
