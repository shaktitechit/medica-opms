"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import {
  ShoppingCart,
  Search,
  User,
  Tag,
  Trash2,
  Plus,
  ArrowLeft,
  Check,
} from "lucide-react";

import {
  mutationRejectedMessage,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useCreateOrderMutation,
  useListPartiesQuery,
  useListProductsQuery,
  useLazyListOrdersQuery,
} from "@/store/api";
import { useAppSelector } from "@/store";

const inputClass =
  "w-full rounded-lg border border-slate-200/95 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-500/25 dark:border-white/15 dark:bg-slate-950 dark:text-slate-50";

type Entity = Record<string, unknown>;

function pickList(raw: unknown): Entity[] {
  if (Array.isArray(raw)) return raw as Entity[];
  if (
    raw &&
    typeof raw === "object" &&
    "items" in raw &&
    Array.isArray((raw as { items: unknown }).items)
  ) {
    return (raw as { items: Entity[] }).items;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "data" in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return (raw as { data: Entity[] }).data;
  }
  return [];
}

type LineRow = {
  key: string;
  productId: string;
  product_name: string;
  sku: string;
  brand: string;
  manufacturer: string;
  product_group: string;
  product_subgroup: string;
  unit: string;
  quantity: number;
  free_qty: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  gst_percent: number;
  applied_rate_type: string;
  remarks: string;
};

function newLine(): LineRow {
  return {
    key:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    productId: "",
    product_name: "",
    sku: "",
    brand: "",
    manufacturer: "",
    product_group: "",
    product_subgroup: "",
    unit: "",
    quantity: 1,
    free_qty: 0,
    unit_price: 0,
    discount_percent: 0,
    discount_amount: 0,
    gst_percent: 18,
    applied_rate_type: "SR",
    remarks: "",
  };
}

function getPriceForRateType(p: Entity | undefined, rateType: string): number {
  if (!p) return 0;
  if (rateType === "SR") return Number(p.base_price ?? 0);
  if (rateType === "SSR") return Number(p.minimum_sale_rate ?? p.base_price ?? 0);
  if (rateType === "CR") return Number(p.mrp ?? p.base_price ?? 0);
  return Number(p.base_price ?? 0);
}

interface PartyAutocompleteProps {
  parties: Entity[];
  selectedId: string;
  onChange: (id: string) => void;
  className?: string;
}

function PartyAutocomplete({
  parties,
  selectedId,
  onChange,
  className,
}: PartyAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedParty = useMemo(() => {
    return parties.find((p) => String(p._id ?? p.id ?? "") === String(selectedId));
  }, [parties, selectedId]);

  useEffect(() => {
    if (selectedParty) {
      setSearch(String(selectedParty.party_name || ""));
    } else {
      setSearch("");
    }
  }, [selectedParty]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return parties;
    return parties.filter((p) => {
      const name = String(p.party_name || "").toLowerCase();
      const code = String(p.party_code || "").toLowerCase();
      const type = String(p.party_type || "").toLowerCase();
      return name.includes(q) || code.includes(q) || type.includes(q);
    });
  }, [parties, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedParty) {
          setSearch(String(selectedParty.party_name || ""));
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedParty]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
          placeholder="Search party by name..."
          className={`${className} pr-10`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              No parties found
            </div>
          ) : (
            filtered.map((p) => {
              const id = String(p._id ?? p.id ?? "");
              const isSelected = id === selectedId;
              const name = String(p.party_name || "Party");
              const type = p.party_type ? ` (${p.party_type})` : "";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-white/5 ${isSelected
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 font-medium"
                      : "text-slate-800 dark:text-slate-200"
                    }`}
                >
                  <span>
                    {name}
                    {type && <span className="text-xs text-slate-400 ml-1">{type}</span>}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface ProductAutocompleteProps {
  products: Entity[];
  selectedId: string;
  onChange: (id: string) => void;
  className?: string;
}

function ProductAutocomplete({
  products,
  selectedId,
  onChange,
  className,
}: ProductAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    return products.find((p) => String(p._id ?? p.id ?? "") === String(selectedId));
  }, [products, selectedId]);

  useEffect(() => {
    if (selectedProduct) {
      const name = String(selectedProduct.product_name || "");
      const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
      setSearch(`${name}${sku}`);
    } else {
      setSearch("");
    }
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => {
      const name = String(p.product_name || "").toLowerCase();
      const sku = String(p.sku || "").toLowerCase();
      const brand = String(p.brand || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || brand.includes(q);
    });
  }, [products, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          const name = String(selectedProduct.product_name || "");
          const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
          setSearch(`${name}${sku}`);
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedProduct]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
          placeholder="Search product..."
          className={`${className} pr-10`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              No products found
            </div>
          ) : (
            filtered.map((p) => {
              const id = String(p._id ?? p.id ?? "");
              const isSelected = id === selectedId;
              const name = String(p.product_name || "Product");
              const sku = p.sku ? ` · ${p.sku}` : "";
              const brand = p.brand ? ` (${p.brand})` : "";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${isSelected
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 font-medium"
                      : "text-slate-800 dark:text-slate-200"
                    }`}
                >
                  <span className="truncate">
                    {name}
                    {sku && <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1">{sku}</span>}
                    {brand && <span className="text-[10px] text-slate-400 ml-1">{brand}</span>}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function CreateOrderPage() {
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  const partiesQ = useListPartiesQuery({});
  const productsQ = useListProductsQuery({});

  const parties = useMemo(() => pickList(partiesQ.data), [partiesQ.data]);
  const products = useMemo(() => pickList(productsQ.data), [productsQ.data]);

  const [partyId, setPartyId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [expectedDate, setExpectedDate] = useState("");
  const headerDiscount = "0";
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);

  const [createOrder, { isLoading }] = useCreateOrderMutation();
  const [triggerListOrders] = useLazyListOrdersQuery();

  const onProductRowChange = useCallback(
    (key: string, productId: string) => {
      const p = products.find(
        (x) => String(x._id ?? x.id ?? "") === String(productId),
      );
      setLines((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          if (!p) {
            return {
              ...row,
              productId: "",
              product_name: "",
              sku: "",
              brand: "",
              manufacturer: "",
              product_group: "",
              product_subgroup: "",
              unit: "",
              unit_price: 0,
              gst_percent: 18,
            };
          }
          const price = getPriceForRateType(p, row.applied_rate_type);
          return {
            ...row,
            productId: String(p._id ?? p.id ?? ""),
            product_name: String(p.product_name ?? ""),
            sku: String(p.sku ?? ""),
            brand: String(p.brand ?? ""),
            manufacturer: String(p.manufacturer ?? ""),
            product_group: String(p.product_group ?? ""),
            product_subgroup: String(p.product_subgroup ?? ""),
            unit: String(p.unit ?? ""),
            unit_price: price,
            gst_percent: Number(p.gst_percent ?? p.default_gst_rate ?? p.gst_rate ?? 18),
          };
        }),
      );
    },
    [products],
  );

  const onRateTypeChange = useCallback(
    (key: string, rateType: string) => {
      setLines((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          const p = products.find(
            (x) => String(x._id ?? x.id ?? "") === String(row.productId),
          );
          const price = getPriceForRateType(p, rateType);
          return {
            ...row,
            applied_rate_type: rateType,
            unit_price: price,
          };
        }),
      );
    },
    [products],
  );

  const populateFromLastOrder = useCallback((lastOrder: any) => {
    if (!lastOrder || !Array.isArray(lastOrder.order_items)) return;

    const mappedLines = lastOrder.order_items.map((item: any) => {
      const prod = products.find((pr) => String(pr._id ?? pr.id ?? "") === String(item.product?._id ?? item.product?.id ?? item.product ?? ""));
      const rateType = String(item.applied_rate_type || "SR");
      const price = prod ? getPriceForRateType(prod, rateType) : Number(item.unit_price ?? 0);
      const gst = prod ? Number(prod.gst_percent ?? prod.default_gst_rate ?? 18) : Number(item.gst_percent ?? 18);

      return {
        key: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        productId: String(item.product?._id ?? item.product?.id ?? item.product ?? ""),
        product_name: String(item.product_name ?? ""),
        sku: String(item.sku ?? ""),
        brand: String(item.brand ?? ""),
        manufacturer: String(item.manufacturer ?? ""),
        product_group: String(item.product_group ?? ""),
        product_subgroup: String(item.product_subgroup ?? ""),
        unit: String(item.unit ?? ""),
        quantity: Number(item.ordered_quantity ?? item.quantity ?? 1),
        free_qty: Number(item.free_quantity ?? item.free_qty ?? 0),
        unit_price: price,
        discount_percent: 0,
        discount_amount: 0,
        gst_percent: gst,
        applied_rate_type: rateType,
        remarks: String(item.remarks ?? ""),
      };
    });

    if (mappedLines.length > 0) {
      setLines(mappedLines);
      toast.success("Auto-populated line items from the last order placed by this party.");
    }
  }, [products]);

  useEffect(() => {
    if (!partyId) return;

    const fetchLastOrder = async () => {
      try {
        const res = await triggerListOrders({ party: partyId }).unwrap();
        const orders = pickList(res);
        if (orders && orders.length > 0) {
          populateFromLastOrder(orders[0]);
        }
      } catch (err) {
        console.error("Failed to fetch last order:", err);
      }
    };

    fetchLastOrder();
  }, [partyId, triggerListOrders, populateFromLastOrder]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!partyId) {
        toast.error("Select a party.");
        return;
      }
      const prepared = lines
        .filter((l) => l.productId)
        .map((l) => ({
          product: l.productId,
          product_name: l.product_name,
          sku: l.sku || "",
          brand: l.brand || "",
          manufacturer: l.manufacturer || "",
          product_group: l.product_group || "",
          product_subgroup: l.product_subgroup || "",
          unit: l.unit || "",
          ordered_quantity: Number(l.quantity),
          free_quantity: Number(l.free_qty || 0),
          allocated_quantity: 0,
          dispatched_quantity: 0,
          delivered_quantity: 0,
          cancelled_quantity: 0,
          unit_price: Number(l.unit_price),
          discount_percent: Number(l.discount_percent || 0),
          discount_amount: Number(l.discount_amount || 0),
          gst_percent: Number(l.gst_percent ?? 18),
          applied_rate_type: l.applied_rate_type,
          remarks: l.remarks.trim() || "",
        }));

      if (!prepared.length) {
        toast.error("Add at least one line with a product.");
        return;
      }
      const badQty = prepared.some(
        (l) => !Number.isFinite(l.ordered_quantity) || l.ordered_quantity < 1,
      );
      if (badQty) {
        toast.error("Each line needs quantity ≥ 1.");
        return;
      }

      const body = {
        party: partyId,
        order_items: prepared,
        discount_amount: Number(headerDiscount || 0),
        priority,
        remarks: remarks.trim() || "",
        ...(expectedDate ? { expected_delivery_date: expectedDate } : {}),
        assigned_sales_user: (user?._id || user?.id) ? String(user?._id || user?.id) : undefined,
      };

      try {
        const data = (await createOrder(body).unwrap()) as any;
        toast.success(
          data?.order_no
            ? `Draft order ${data.order_no} created successfully`
            : "Draft order created successfully"
        );
        router.push("/sales/orders");
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [
      partyId,
      createOrder,
      expectedDate,
      lines,
      priority,
      remarks,
      router,
      user,
    ],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 pb-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Create New Order
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create and save a new purchase or sales draft order.
            </p>
          </div>
        </div>
        <Link
          href="/sales"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </Link>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Party selection and Lines */}
        <div className="lg:col-span-2 space-y-6">
          {/* Party Selection Card */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <header className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
              <User className="h-4 w-4 text-blue-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Party Selection
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Required customer or vendor information.
                </p>
              </div>
            </header>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Party <span className="text-rose-500">*</span>
              </label>
              <PartyAutocomplete
                parties={parties}
                selectedId={partyId}
                onChange={setPartyId}
                className={inputClass}
              />
              {partiesQ.isError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                  Could not load parties.
                </p>
              )}
            </div>
          </section>

          {/* Line Items Card */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <header className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-blue-500" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Line Items
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Catalog products to include in this order.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                {lines.length} {lines.length === 1 ? "item" : "items"}
              </span>
            </header>

            {productsQ.isError && (
              <p className="mb-3 text-xs text-rose-600 dark:text-rose-400">
                Could not load products.
              </p>
            )}

            <div className="space-y-4">
              {lines.map((row, idx) => (
                <div
                  key={row.key}
                  className="relative space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-slate-955/30"
                >
                  {/* Mobile delete bar */}
                  <div className="flex items-center justify-between lg:hidden border-b border-slate-100 pb-2 dark:border-white/5">
                    <span className="text-xs font-semibold text-slate-500">
                      Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-500 hover:text-rose-600"
                      disabled={lines.length <= 1}
                      onClick={() =>
                        setLines((prev) => prev.filter((l) => l.key !== row.key))
                      }
                    >
                      Remove
                    </button>
                  </div>

                  {/* Tier 1 Grid: Product, Qty, Free, Rate Type */}
                  <div className="grid gap-3 grid-cols-1 lg:grid-cols-12">
                    {/* Product */}
                    <div className="space-y-1 lg:col-span-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Product
                      </span>
                      <ProductAutocomplete
                        products={products}
                        selectedId={row.productId}
                        onChange={(val) => onProductRowChange(row.key, val)}
                        className={inputClass}
                      />
                    </div>

                    {/* Qty */}
                    <div className="space-y-1 lg:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Qty
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === row.key
                                ? {
                                  ...l,
                                  quantity: Number(e.target.value) || 0,
                                }
                                : l,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                    </div>

                    {/* Free Qty */}
                    <div className="space-y-1 lg:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Free
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={row.free_qty}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === row.key
                                ? {
                                  ...l,
                                  free_qty: Number(e.target.value) || 0,
                                }
                                : l,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                    </div>

                    {/* Rate Type */}
                    <div className="space-y-1 lg:col-span-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Rate Type
                      </span>
                      <select
                        value={row.applied_rate_type}
                        onChange={(e) =>
                          onRateTypeChange(row.key, e.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="SR">SR</option>
                        <option value="SSR">SSR</option>
                        <option value="CR">CR</option>
                      </select>
                    </div>
                  </div>

                  {/* Tier 2 Grid: Remarks & Action */}
                  <div className="grid gap-3 grid-cols-1 lg:grid-cols-12 pt-2 border-t border-slate-100/50 dark:border-white/5">
                    {/* Remarks */}
                    <div className="space-y-1 lg:col-span-11">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Line Remarks
                      </span>
                      <input
                        placeholder="Internal item specifications..."
                        value={row.remarks}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === row.key
                                ? {
                                  ...l,
                                  remarks: e.target.value,
                                }
                                : l,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                    </div>

                    {/* Actions */}
                    <div className="hidden lg:flex lg:col-span-1 items-end justify-end pb-0.5">
                      <button
                        type="button"
                        className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-slate-200/95 bg-white p-2 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-slate-955 dark:text-rose-400 dark:hover:bg-rose-950/20"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) => prev.filter((l) => l.key !== row.key))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Line */}
            <div className="mt-4 flex justify-between items-center border-t border-slate-100 pt-4 dark:border-white/5">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
                onClick={() => setLines((prev) => [...prev, newLine()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item Line
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Sticky Sidebar form metadata & actions */}
        <div className="space-y-6">
          <div className="sticky top-6 space-y-6">
            <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
              <header className="border-b border-slate-100 pb-3 dark:border-white/5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Order Metadata
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Specify details and save draft.
                </p>
              </header>

              <div className="space-y-1">
                <label htmlFor="co-priority" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Priority
                </label>
                <select
                  id="co-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={inputClass}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="co-eta" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Expected Delivery
                </label>
                <input
                  id="co-eta"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="co-remarks" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Remarks
                </label>
                <textarea
                  id="co-remarks"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className={`${inputClass} resize-none`}
                  placeholder="Notes, instructions or special considerations..."
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-white/5">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:shadow-none dark:hover:bg-blue-400"
                >
                  {isLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving draft...
                    </>
                  ) : (
                    "Save draft order"
                  )}
                </button>
              </div>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}
