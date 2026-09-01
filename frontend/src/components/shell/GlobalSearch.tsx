"use client";

import { Search, X, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  buildPartyNameById,
  resolveOrderCounterparty,
} from "@/components/portal/sales/partyDisplay";
import {
  formatDateShort,
  formatDateTime,
  formatMoney,
  orderKey,
  renderPendingApprovalBadge,
  renderPriorityBadge,
  renderWorkflowStatusBadge,
  type OrderListRow,
} from "@/components/portal/shared/orderList/orderListDisplay";
import { getOrderWorkflowTabCategory } from "@/components/portal/shared/orderList/orderWorkflowTabs";
import { useOrderWorkflowCategoryOptions } from "@/components/portal/shared/orderList/useOrderWorkflowCategoryOptions";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildUserNameById,
  resolveUserDisplay,
} from "@/components/portal/shared/userDisplay";
import { toast } from "@/lib/toast";
import {
  useLazyListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
} from "@/store/api";

type GlobalSearchProps = {
  portal: string;
};

function toHits(raw: unknown): OrderListRow[] {
  return pickOrders(raw)
    .filter((row): row is OrderListRow => {
      const id = orderKey(row);
      return Boolean(id);
    })
    .slice(0, 15);
}

export function GlobalSearch({ portal }: GlobalSearchProps) {
  const id = useId();
  const router = useRouter();
  const rootRef = useRef<HTMLFormElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<OrderListRow[]>([]);
  const [trigger, result] = useLazyListOrdersQuery();

  const partiesQ = useListPartiesQuery({});
  const partyNameById = useMemo(
    () => buildPartyNameById(partiesQ.data),
    [partiesQ.data],
  );

  const usersQ = useListUsersQuery({});
  const salesUserNameById = useMemo(
    () => buildUserNameById(usersQ.data),
    [usersQ.data],
  );

  const categoryOptions = useOrderWorkflowCategoryOptions();

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
        const nextHits = toHits(data);
        setHits(nextHits);
        setOpen(true);

        if (!navigate) return;

        if (nextHits.length === 1) {
          const singleId = orderKey(nextHits[0]);
          if (singleId) {
            goToOrder(singleId);
            return;
          }
        }
        goToOrdersList(qTrim);
      } catch {
        if (navigate) {
          toast.error("Could not search orders. Try again.");
        }
      }
    },
    [trigger, goToOrder, goToOrdersList],
  );

  useEffect(() => {
    if (!result.data) return;
    setHits(toHits(result.data));
  }, [result.data]);

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
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isSearching = result.isFetching || result.isLoading;
  const showPricing = portal !== "sales";

  return (
    <form
      ref={rootRef}
      className={`relative min-h-10 min-w-0 flex-1 lg:max-w-2xl ${
        open && q.trim().length >= 2 ? "z-[60]" : ""
      }`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        void runSearch(q, true);
      }}
    >
      <div className="relative z-[60] w-full">
        <label htmlFor={id} className="sr-only">
          Search orders by order number or party name
        </label>
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-2.5 text-muted">
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
          className={`h-10 w-full min-w-0 rounded-lg border bg-surface-muted py-2 pl-9 pr-8 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/25 ${
            open && q.trim().length >= 2
              ? "border-primary bg-card ring-2 ring-primary/20 shadow-md"
              : "border-border"
          }`}
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setHits([]);
              setOpen(false);
            }}
            className="absolute inset-y-0 right-0 z-10 flex cursor-pointer items-center pr-2.5 text-muted transition hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open && q.trim().length >= 2 && (
        <>
          {/* Backdrop (below search bar and results modal) */}
          <div
            className="fixed inset-0 z-[50] bg-slate-900/30 backdrop-blur-xs transition-opacity dark:bg-black/50"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          {/* Full-width Results Overlay */}
          <div
            ref={dropdownRef}
            className="fixed inset-x-0 top-[56px] z-[60] flex max-h-[calc(100vh-68px)] w-full flex-col overflow-hidden border-b border-border bg-card shadow-2xl animate-in fade-in duration-150 sm:top-[60px] sm:max-h-[calc(100vh-72px)] md:top-[64px]"
            role="listbox"
            aria-label="Order search results"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-muted/60 px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Search Results</span>
                {hits.length > 0 && (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-bold text-primary">
                    {hits.length} {hits.length === 1 ? "order" : "orders"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-2xs text-muted-foreground sm:inline-block">
                  Press <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-3xs font-semibold">ESC</kbd> to close
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-muted transition hover:bg-surface-muted hover:text-foreground cursor-pointer"
                  aria-label="Close search results"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            {isSearching && hits.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="mt-3 text-xs font-medium text-muted">
                  Searching orders for &quot;{q.trim()}&quot;…
                </p>
              </div>
            )}

            {!isSearching && hits.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <p className="text-sm font-semibold text-foreground">
                  No orders match &quot;{q.trim()}&quot;
                </p>
                <p className="mt-1 text-xs text-muted">
                  Try searching with a different order number or party name.
                </p>
              </div>
            )}

            {hits.length > 0 && (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-border bg-surface-muted/95 backdrop-blur-sm shadow-xs">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Order No
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Party
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Sales Person
                      </th>
                      {showPricing && (
                        <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                          Grand Total
                        </th>
                      )}
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Order Date
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Billing Date
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Expected Delivery
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Priority
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground sm:px-6">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {hits.map((order) => {
                      const id = orderKey(order);
                      const ref =
                        typeof order.order_no === "string" && order.order_no.trim()
                          ? order.order_no.trim()
                          : typeof order.order_number === "string" &&
                              order.order_number.trim()
                            ? order.order_number.trim()
                            : id || "—";
                      const total = Number(order.grand_total ?? order.total ?? 0);
                      const pri =
                        typeof order.priority === "string" ? order.priority : "normal";
                      const partyLabel = resolveOrderCounterparty(
                        order as Record<string, unknown>,
                        partyNameById,
                      );
                      const salesPersonLabel = resolveUserDisplay(
                        order.assigned_sales_user,
                        salesUserNameById,
                      );
                      const orderDateStr = formatDateTime(
                        order.order_date ?? order.created_at ?? order.createdAt,
                      );
                      const billingDateStr = formatDateTime(order.billing_date);
                      const expectedDeliveryStr = formatDateShort(
                        order.expected_delivery_date,
                      );
                      const workflowCat = getOrderWorkflowTabCategory(
                        order,
                        categoryOptions,
                      );

                      return (
                        <tr
                          key={id || ref}
                          role="option"
                          tabIndex={0}
                          onClick={() => {
                            if (id) goToOrder(id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && id) {
                              goToOrder(id);
                            }
                          }}
                          className="group cursor-pointer transition-colors hover:bg-primary/5 dark:hover:bg-primary/10"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-primary group-hover:underline sm:px-6">
                            {ref}
                          </td>
                          <td className="px-4 py-3 sm:px-6">
                            <span
                              className="line-clamp-1 font-semibold text-foreground"
                              title={partyLabel}
                            >
                              {partyLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700 dark:text-slate-300 sm:px-6">
                            {salesPersonLabel}
                          </td>
                          {showPricing && (
                            <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-foreground sm:px-6">
                              ₹{formatMoney(Number.isFinite(total) ? total : 0)}
                            </td>
                          )}
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground sm:px-6">
                            {orderDateStr}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground sm:px-6">
                            {billingDateStr}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground sm:px-6">
                            {expectedDeliveryStr}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                            {renderPriorityBadge(pri)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 sm:px-6">
                            {renderPendingApprovalBadge(order) ||
                              renderWorkflowStatusBadge(workflowCat ?? "draft")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            {hits.length > 0 && (
              <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface-muted/60 px-4 py-2.5 sm:px-6">
                <span className="text-xs text-muted-foreground">
                  Showing {hits.length} {hits.length === 1 ? "result" : "results"}
                </span>
                <button
                  type="button"
                  onClick={() => goToOrdersList(q.trim())}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary transition hover:underline"
                >
                  View all matches in Orders list →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </form>
  );
}

