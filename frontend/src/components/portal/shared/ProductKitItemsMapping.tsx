"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Link2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ConfirmRemoveKitItemModal } from "./ConfirmRemoveKitItemModal";
import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useAddProductKitItemLineMutation,
  useCreateProductKitItemMutation,
  useDeleteProductKitItemLineMutation,
  useListProductKitItemsQuery,
  useListProductsQuery,
  usePatchProductKitItemLineMutation,
  type ProductKitComponent,
  type ProductKitItemRecord,
} from "@/store/api";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";
const labelClass = "text-xs font-medium text-slate-700 dark:text-slate-300";

type CatalogProduct = {
  _id?: string;
  id?: string;
  product_name?: string;
  sku?: string;
  product_type?: string;
  generic_name?: string;
  base_price?: number;
  is_active?: boolean;
};

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function productId(p: CatalogProduct | string | null | undefined): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  return String(p._id ?? p.id ?? "");
}

function productLabel(ref: ProductKitComponent["individual"]): {
  name: string;
  sku: string;
} {
  if (!ref) return { name: "—", sku: "" };
  if (typeof ref === "string") return { name: ref, sku: "" };
  return {
    name: ref.product_name || ref._id || "—",
    sku: ref.sku || "",
  };
}

function formatProductOption(p: CatalogProduct): string {
  const name = p.product_name || productId(p) || "Product";
  const sku = p.sku ? ` (${p.sku})` : "";
  return `${name}${sku}`;
}

export type ProductKitItemsMappingProps = {
  kitId: string;
};

export function ProductKitItemsMapping({ kitId }: ProductKitItemsMappingProps) {
  const {
    data: kitListRaw,
    isLoading,
    isFetching,
    refetch,
  } = useListProductKitItemsQuery({ kit: kitId }, { skip: !kitId });

  const composition = useMemo(() => {
    const rows = pickList(kitListRaw) as ProductKitItemRecord[];
    return rows[0] ?? null;
  }, [kitListRaw]);

  const mappedIds = useMemo(() => {
    const items = composition?.items ?? [];
    return items
      .map((line) => productId(line.individual as CatalogProduct | string))
      .filter(Boolean);
  }, [composition]);

  const mappedIdSet = useMemo(() => new Set(mappedIds), [mappedIds]);

  // --- Individual product search (add form) ---
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(
    null,
  );
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedProductSearch(productSearch.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  const catalogQuery = useMemo(
    () => ({
      product_type: "individual",
      status: "active",
      paginate: "true",
      page: "1",
      limit: "100",
      ...(debouncedProductSearch
        ? { search: debouncedProductSearch }
        : {}),
    }),
    [debouncedProductSearch],
  );

  const { data: catalogRaw, isFetching: isCatalogFetching, isError: isCatalogError } =
    useListProductsQuery(catalogQuery, { skip: !kitId });

  const individualOptions = useMemo(() => {
    const list = pickList(catalogRaw) as CatalogProduct[];
    return list.filter((p) => {
      const id = productId(p);
      if (!id || p.is_active === false) return false;
      // Exclude kits; treat missing product_type as individual
      if (String(p.product_type || "individual").toLowerCase() === "kit") {
        return false;
      }
      if (mappedIdSet.has(id)) return false;
      return true;
    });
  }, [catalogRaw, mappedIdSet]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Clear selection when that product becomes mapped
  useEffect(() => {
    if (selectedProduct && mappedIdSet.has(productId(selectedProduct))) {
      setSelectedProduct(null);
      setProductSearch("");
    }
  }, [mappedIdSet, selectedProduct]);

  const [createKit, { isLoading: isCreating }] =
    useCreateProductKitItemMutation();
  const [addLine, { isLoading: isAdding }] = useAddProductKitItemLineMutation();
  const [patchLine, { isLoading: isPatching }] =
    usePatchProductKitItemLineMutation();
  const [deleteLine, { isLoading: isDeleting }] =
    useDeleteProductKitItemLineMutation();

  const [percentage, setPercentage] = useState("100");
  const [quantity, setQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lineDrafts, setLineDrafts] = useState<
    Record<string, { percentage: string; quantity: string }>
  >({});
  const [mappedSearch, setMappedSearch] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{
    itemId: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    const next: Record<string, { percentage: string; quantity: string }> = {};
    for (const line of composition?.items ?? []) {
      if (line._id) {
        next[line._id] = {
          percentage: String(line.percentage ?? 0),
          quantity:
            line.quantity === null || line.quantity === undefined
              ? ""
              : String(line.quantity),
        };
      }
    }
    setLineDrafts(next);
  }, [composition]);

  const totalPercentage = useMemo(() => {
    return (composition?.items ?? []).reduce(
      (sum, line) => sum + (Number(line.percentage) || 0),
      0,
    );
  }, [composition]);

  const busy = isCreating || isAdding || isPatching || isDeleting;
  const selectedIndividualId = productId(selectedProduct);

  const handleSelectProduct = (p: CatalogProduct) => {
    setSelectedProduct(p);
    setProductSearch(formatProductOption(p));
    setPickerOpen(false);
  };

  const clearSelectedProduct = () => {
    setSelectedProduct(null);
    setProductSearch("");
    setPickerOpen(false);
  };

  const parseOptionalQuantity = (raw: string): number | null | undefined => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
  };

  const handleAdd = async () => {
    if (!selectedIndividualId) {
      toast.error("Search and select an individual product");
      return;
    }
    const pct = Number(percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
      toast.error("Percentage must be between 0 and 1000");
      return;
    }
    const qty = parseOptionalQuantity(quantity);
    if (qty === undefined) {
      toast.error("Quantity must be a non-negative number when provided");
      return;
    }

    const lineBody = {
      individual: selectedIndividualId,
      percentage: pct,
      quantity: qty,
      remarks: remarks.trim() || undefined,
    };

    try {
      if (!composition?._id) {
        await createKit({
          kit: kitId,
          items: [lineBody],
        }).unwrap();
        toast.success(mutationSuccessCopy("createProductKitItem"));
      } else {
        await addLine({
          id: composition._id,
          body: lineBody,
        }).unwrap();
        toast.success("Item mapped to kit");
      }
      setPercentage("100");
      setQuantity("");
      setRemarks("");
      clearSelectedProduct();
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleSaveLine = async (itemId: string) => {
    if (!composition?._id) return;
    const draft = lineDrafts[itemId];
    if (!draft) return;

    const pct = Number(draft.percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
      toast.error("Percentage must be between 0 and 1000");
      return;
    }
    const qty = parseOptionalQuantity(draft.quantity);
    if (qty === undefined) {
      toast.error("Quantity must be a non-negative number when provided");
      return;
    }

    const current = composition.items.find((i) => i._id === itemId);
    const currentQty =
      current?.quantity === null || current?.quantity === undefined
        ? null
        : Number(current.quantity);
    if (
      current &&
      Number(current.percentage) === pct &&
      currentQty === qty
    ) {
      return;
    }

    try {
      await patchLine({
        id: composition._id,
        itemId,
        patch: { percentage: pct, quantity: qty },
      }).unwrap();
      toast.success(mutationSuccessCopy("patchProductKitItemLine"));
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const handleRemove = async () => {
    if (!composition?._id || !removeTarget) return;
    try {
      await deleteLine({
        id: composition._id,
        itemId: removeTarget.itemId,
      }).unwrap();
      toast.success("Item removed from kit");
      setRemoveTarget(null);
    } catch (err) {
      toast.error(mutationRejectedMessage(err));
    }
  };

  const lines = composition?.items ?? [];
  const mappedQuery = mappedSearch.trim().toLowerCase();
  const filteredLines = useMemo(() => {
    if (!mappedQuery) return lines;
    return lines.filter((line) => {
      const { name, sku } = productLabel(line.individual);
      const remarksText = line.remarks || "";
      return (
        name.toLowerCase().includes(mappedQuery) ||
        sku.toLowerCase().includes(mappedQuery) ||
        remarksText.toLowerCase().includes(mappedQuery)
      );
    });
  }, [lines, mappedQuery]);

  const showPickerResults = pickerOpen && !selectedProduct;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-6">
      <ConfirmRemoveKitItemModal
        itemId={removeTarget?.itemId ?? null}
        itemLabel={removeTarget?.label ?? ""}
        isRemoving={isDeleting}
        onClose={() => {
          if (!isDeleting) setRemoveTarget(null);
        }}
        onConfirm={handleRemove}
      />

      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-3">
        <div>
          <h3 className="text-md font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-violet-500" /> Items Mapping
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Search and map individual catalog products into this kit. Percentage range: 0–1000.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 px-2.5 py-1 rounded-lg ring-1 ring-inset ring-slate-200/80 dark:ring-white/10">
            Total: {totalPercentage}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Add mapping */}
      <div className="rounded-xl border border-dashed border-violet-200/80 bg-violet-50/40 p-4 dark:border-violet-500/20 dark:bg-violet-500/5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          Add individual item
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4 space-y-1" ref={pickerRef}>
            <label className={labelClass}>Search individual product</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                className={`${inputClass} pl-9 pr-9`}
                placeholder="Search by name, generic, SKU…"
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setSelectedProduct(null);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                disabled={busy}
                autoComplete="off"
              />
              {(productSearch || selectedProduct) && (
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  onClick={clearSelectedProduct}
                  aria-label="Clear product"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {showPickerResults && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/15 dark:bg-slate-950">
                  {isCatalogError ? (
                    <div className="px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400">
                      Failed to load products. Try again.
                    </div>
                  ) : isCatalogFetching ? (
                    <div className="px-3 py-2.5 text-xs text-slate-500">
                      Searching individual products…
                    </div>
                  ) : individualOptions.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-500">
                      {debouncedProductSearch
                        ? `No individual products match “${debouncedProductSearch}”`
                        : "No available individual products"}
                    </div>
                  ) : (
                    individualOptions.map((p) => {
                      const id = productId(p);
                      const isSelected = id === selectedIndividualId;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleSelectProduct(p)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs transition hover:bg-violet-50 dark:hover:bg-violet-500/10 border-b border-slate-100 last:border-0 dark:border-white/5 ${
                            isSelected
                              ? "bg-violet-50 dark:bg-violet-500/10"
                              : ""
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {p.product_name || id}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-2 text-2xs text-slate-500 dark:text-slate-400">
                              {p.sku ? (
                                <span className="font-mono uppercase">
                                  SKU: {p.sku}
                                </span>
                              ) : null}
                              {p.generic_name ? (
                                <span className="truncate">
                                  {p.generic_name}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {Number.isFinite(Number(p.base_price)) ? (
                              <span className="font-mono text-slate-500">
                                ₹{Number(p.base_price).toFixed(2)}
                              </span>
                            ) : null}
                            {isSelected ? (
                              <Check className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {selectedProduct ? (
              <p className="text-2xs text-violet-700 dark:text-violet-300">
                Selected:{" "}
                <span className="font-semibold">
                  {formatProductOption(selectedProduct)}
                </span>
              </p>
            ) : (
              <p className="text-2xs text-slate-500 dark:text-slate-400">
                Type to search active individual products (already mapped items are hidden).
              </p>
            )}
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className={labelClass}>Percentage</label>
            <input
              type="number"
              min={0}
              max={1000}
              step="any"
              className={inputClass}
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className={labelClass}>
              Quantity <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              min={0}
              step="any"
              className={inputClass}
              placeholder="—"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className={labelClass}>Remarks</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Optional"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={busy || !selectedIndividualId}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              <Plus className="h-4 w-4" />
              {busy ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      </div>

      {/* Mapped table */}
      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          Loading kit items…
        </p>
      ) : lines.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-500">
            <Package className="h-6 w-6" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            No items mapped yet
          </h4>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            Search for an individual product above and assign a percentage to
            build this kit.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <input
              type="text"
              className={`${inputClass} pl-9 py-1.5 text-xs`}
              placeholder="Filter mapped items…"
              value={mappedSearch}
              onChange={(e) => setMappedSearch(e.target.value)}
            />
          </div>

          {filteredLines.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No mapped items match “{mappedSearch}”
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-white/5 dark:bg-slate-950/40">
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">
                      Individual product
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider w-36">
                      Percentage
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider w-32">
                      Qty
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider">
                      Remarks
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-right w-36">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredLines.map((line, lineIdx) => {
                    const lineId = line._id || "";
                    const { name, sku } = productLabel(line.individual);
                    const draft = lineDrafts[lineId] ?? {
                      percentage: String(line.percentage ?? 0),
                      quantity:
                        line.quantity === null || line.quantity === undefined
                          ? ""
                          : String(line.quantity),
                    };
                    return (
                      <tr
                        key={lineId || `kit-line:${name}:${lineIdx}`}
                        className="hover:bg-slate-50/50 dark:hover:bg-white/5"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="font-semibold text-slate-900 dark:text-slate-50">
                            {name}
                          </div>
                          {sku ? (
                            <div className="mt-0.5 font-mono text-2xs text-slate-500 uppercase">
                              SKU: {sku}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            step="any"
                            className={`${inputClass} max-w-[7rem]`}
                            value={draft.percentage}
                            onChange={(e) =>
                              setLineDrafts((prev) => ({
                                ...prev,
                                [lineId]: {
                                  ...draft,
                                  percentage: e.target.value,
                                },
                              }))
                            }
                            disabled={busy || !lineId}
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className={`${inputClass} max-w-[6rem]`}
                            placeholder="—"
                            value={draft.quantity}
                            onChange={(e) =>
                              setLineDrafts((prev) => ({
                                ...prev,
                                [lineId]: {
                                  ...draft,
                                  quantity: e.target.value,
                                },
                              }))
                            }
                            disabled={busy || !lineId}
                          />
                        </td>
                        <td className="px-4 py-3 align-middle text-slate-600 dark:text-slate-400">
                          {line.remarks?.trim() || "—"}
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleSaveLine(lineId)}
                              disabled={busy || !lineId}
                              className="rounded-lg border border-slate-200 px-2 py-1.5 text-2xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setRemoveTarget({
                                  itemId: lineId,
                                  label: sku ? `${name} (${sku})` : name,
                                })
                              }
                              disabled={busy || !lineId}
                              className="inline-flex items-center justify-center rounded border border-slate-200 p-1.5 text-rose-600 hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50 dark:border-white/10 dark:text-rose-400 dark:hover:bg-rose-950/30"
                              title="Remove from kit"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
