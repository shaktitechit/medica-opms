"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import {
  ShoppingCart,
  Search,
  User,
  Users,
  Tag,
  Trash2,
  Plus,
  ArrowLeft,
  Check,
} from "lucide-react";

import {
  mutationRejectedMessage,
  mutationSuccessCopy,
} from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
import { Button } from "@/components/ui/Button";
import {
  LineRateStatusBadge,
  rateLookupKey,
  resolveLineUnitPrice,
  resolveRateDisplayStatus,
} from "@/components/portal/shared/orderLineRateDisplay";
import {
  useCheckPartyLineRatesQuery,
  useCreateOrderMutation,
  useLazyListOrdersQuery,
  useListPartiesQuery,
  useListProductsQuery,
  useListUsersQuery,
} from "@/store/api";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import { useAppSelector } from "@/store";
import { contactsFromParty } from "@/lib/partyContacts";

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

function formatMoney(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function lineGross(row: LineRow): number {
  return Number(row.quantity || 0) * Number(row.unit_price || 0);
}

function lineDiscount(row: LineRow): number {
  const gross = lineGross(row);
  const percent = Number(row.discount_percent || 0);
  if (percent > 0) return (gross * percent) / 100;
  return Number(row.discount_amount || 0);
}

function lineTaxable(row: LineRow): number {
  return Math.max(0, lineGross(row) - lineDiscount(row));
}

function lineGst(row: LineRow): number {
  return (lineTaxable(row) * Number(row.gst_percent || 0)) / 100;
}

function lineTotal(row: LineRow): number {
  return lineTaxable(row) + lineGst(row);
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
                    {p.sra === true && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 ml-1.5">
                        SRA
                      </span>
                    )}
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
                    {sku && <span className="text-2xs text-slate-500 dark:text-slate-400 ml-1">{sku}</span>}
                    {brand && <span className="text-2xs text-slate-400 ml-1">{brand}</span>}
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

interface SalesAutocompleteProps {
  salesUsers: Entity[];
  selectedId: string;
  onChange: (id: string) => void;
  className?: string;
}

function SalesAutocomplete({
  salesUsers,
  selectedId,
  onChange,
  className,
}: SalesAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedUser = useMemo(() => {
    return salesUsers.find((u) => String(u._id ?? u.id ?? "") === String(selectedId));
  }, [salesUsers, selectedId]);

  useEffect(() => {
    if (selectedUser) {
      setSearch(String(selectedUser.name || selectedUser.username || ""));
    } else {
      setSearch("");
    }
  }, [selectedUser]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return salesUsers;
    return salesUsers.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const username = String(u.username || "").toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [salesUsers, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedUser) {
          setSearch(String(selectedUser.name || selectedUser.username || ""));
        } else {
          setSearch("");
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedUser]);

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
          placeholder="Search sales rep..."
          className={`${className} pr-10`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 dark:text-slate-500">
          <Search className="h-4 w-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearch("");
              setIsOpen(false);
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 italic"
          >
            — Unassigned —
          </button>
          {filtered.length > 0 && <div className="border-t border-slate-100 dark:border-white/5 my-1" />}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
              No sales reps found
            </div>
          ) : (
            filtered.map((u) => {
              const id = String(u._id ?? u.id ?? "");
              const isSelected = id === selectedId;
              const name = String(u.name || u.username || id);
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
                  <span>{name}</span>
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

export default function AdminCreateOrderPage() {
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  const partiesQ = useListPartiesQuery({ status: "active" });
  const productsQ = useListProductsQuery({});
  const salesUsersQ = useListUsersQuery({ department: "sales" });

  const parties = useMemo(() => pickList(partiesQ.data), [partiesQ.data]);
  const products = useMemo(() => pickList(productsQ.data), [productsQ.data]);
  const salesUsers = useMemo(() => pickList(salesUsersQ.data), [salesUsersQ.data]);

  const [partyId, setPartyId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const headerDiscount = "0";
  const [remarks, setRemarks] = useState("");
  const [assignedSales, setAssignedSales] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);

  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const [createOrder, { isLoading: isCreating }] = useCreateOrderMutation();
  const [triggerListOrders] = useLazyListOrdersQuery();

  const isLoading = isCreating;
  const canMapPrice = Boolean(partyId);

  const lineRateCheckInput = useMemo(() => {
    if (!partyId) return null;
    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({
        product: l.productId,
        applied_rate_type: l.applied_rate_type,
        product_name: l.product_name,
        sku: l.sku,
        unit_price: l.unit_price,
      }));
    if (!items.length) return null;
    return { party: partyId, items };
  }, [partyId, lines]);

  const rateCheckQ = useCheckPartyLineRatesQuery(lineRateCheckInput!, {
    skip: !lineRateCheckInput,
  });

  const rateItemByLine = useMemo(() => {
    const map = new Map<string, CheckOrderRatesItem>();
    for (const item of rateCheckQ.data?.items ?? []) {
      map.set(rateLookupKey(item.product, item.applied_rate_type), item);
    }
    return map;
  }, [rateCheckQ.data]);

  const allItemsNegotiated = useMemo(() => {
    const activeLines = lines.filter((l) => l.productId);
    if (activeLines.length === 0) return false;
    return activeLines.every((line) => {
      const rateItem = rateItemByLine.get(
        rateLookupKey(line.productId, line.applied_rate_type),
      );
      return resolveRateDisplayStatus(rateItem) === "negotiated";
    });
  }, [lines, rateItemByLine]);

  const resolvePriceForLine = useCallback(
    (
      productId: string,
      rateType: string,
      catalogProduct: Entity | undefined,
    ) => {
      const rateItem = productId
        ? rateItemByLine.get(rateLookupKey(productId, rateType))
        : undefined;
      return resolveLineUnitPrice(rateItem, catalogProduct, rateType);
    },
    [rateItemByLine],
  );

  useEffect(() => {
    if (!rateCheckQ.data?.items?.length) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!row.productId) return row;
        const rateItem = rateItemByLine.get(
          rateLookupKey(row.productId, row.applied_rate_type),
        );
        if (!rateItem?.hasRate || rateItem.currentMappedRate == null) return row;
        const negotiated = Number(rateItem.currentMappedRate);
        if (!Number.isFinite(negotiated) || row.unit_price === negotiated) {
          return row;
        }
        changed = true;
        return { ...row, unit_price: negotiated };
      });
      return changed ? next : prev;
    });
  }, [rateCheckQ.data, rateItemByLine]);

  const openMapModal = useCallback(
    (row: LineRow) => {
      if (!canMapPrice) {
        toast.error("Select a party before mapping prices.");
        return;
      }
      if (!row.productId) {
        toast.error("Select a product on this line first.");
        return;
      }
      const rateItem = rateItemByLine.get(
        rateLookupKey(row.productId, row.applied_rate_type),
      );
      setMapTarget({
        productId: row.productId,
        productName: row.product_name || "Product",
        sku: row.sku || undefined,
        appliedRateType: row.applied_rate_type,
        unitPrice: row.unit_price,
        mappingId: rateItem?.mappingId ?? null,
        isMapped: Boolean(rateItem?.isMapped),
        hasRate: Boolean(rateItem?.hasRate),
      });
      setMapModalOpen(true);
    },
    [canMapPrice, rateItemByLine],
  );

  const closeMapModal = useCallback(() => {
    setMapModalOpen(false);
    setMapTarget(null);
  }, []);

  const handleMapPriceSuccess = useCallback(
    (result: MapOrderLinePriceSuccess) => {
      setLines((prev) =>
        prev.map((row) => {
          if (
            row.productId === result.productId &&
            row.applied_rate_type === result.appliedRateType
          ) {
            return { ...row, unit_price: result.negotiatedRate };
          }
          return row;
        }),
      );
      toast.success("Line price updated to negotiated rate.");
      if (!rateCheckQ.isUninitialized) {
        void rateCheckQ.refetch();
      }
    },
    [rateCheckQ],
  );

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
          const pid = String(p._id ?? p.id ?? "");
          const price = resolvePriceForLine(pid, row.applied_rate_type, p);
          return {
            ...row,
            productId: pid,
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
    [products, resolvePriceForLine],
  );

  const onRateTypeChange = useCallback(
    (key: string, rateType: string) => {
      setLines((prev) =>
        prev.map((row) => {
          if (row.key !== key) return row;
          const p = products.find(
            (x) => String(x._id ?? x.id ?? "") === String(row.productId),
          );
          const price = resolvePriceForLine(row.productId, rateType, p);
          return {
            ...row,
            applied_rate_type: rateType,
            unit_price: price,
          };
        }),
      );
    },
    [products, resolvePriceForLine],
  );

  const liveSummary = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let taxable = 0;
    let gst = 0;
    let total = 0;

    for (const line of lines) {
      if (!line.productId) continue;
      const gross = lineGross(line);
      const disc = lineDiscount(line);
      const tax = lineTaxable(line);
      const g = lineGst(line);
      const tot = lineTotal(line);

      subtotal += gross;
      discount += disc;
      taxable += tax;
      gst += g;
      total += tot;
    }

    return {
      subtotal,
      discount,
      taxable,
      gst,
      total,
    };
  }, [lines]);

  const populateFromLastOrder = useCallback((lastOrder: any) => {
    if (!lastOrder || !Array.isArray(lastOrder.order_items)) return;

    const mappedLines = lastOrder.order_items.map((item: any) => ({
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
      unit_price: Number(item.unit_price ?? 0),
      discount_percent: Number(item.discount_percent ?? 0),
      discount_amount: Number(item.discount_amount ?? 0),
      gst_percent: Number(item.gst_percent ?? 18),
      applied_rate_type: String(item.applied_rate_type || "SR"),
      remarks: String(item.remarks ?? ""),
    }));

    if (mappedLines.length > 0) {
      setLines(mappedLines);
      toast.success("Auto-populated line items from the last order placed by this party.");
    }
  }, []);

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
      if (!assignedSales) {
        toast.error("Select a sales representative.");
        return;
      }
      if (!allItemsNegotiated) {
        toast.error("Please negotiate all items before submitting the order.");
        return;
      }
      if (!expectedDate.trim()) {
        toast.error("Expected delivery date is required.");
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
          taxable_amount: lineTaxable(l),
          gst_amount: lineGst(l),
          total_amount: lineTotal(l),
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
      const badFree = prepared.some(
        (l) => !Number.isFinite(l.free_quantity) || l.free_quantity < 0,
      );
      if (badFree) {
        toast.error("Free quantity must be zero or more.");
        return;
      }
      const badDiscount = prepared.some(
        (l) =>
          !Number.isFinite(l.discount_percent) ||
          l.discount_percent < 0 ||
          l.discount_percent > 100,
      );
      if (badDiscount) {
        toast.error("Discount percent must be between 0 and 100.");
        return;
      }
      try {
        const approvalItems = prepared.map((l) => {
          return {
            product: l.product,
            ordered_quantity: l.ordered_quantity,
            approved_quantity: l.ordered_quantity,
            approved_unit_price: l.unit_price,
            ordered_unit_price: l.unit_price,
            free_quantity: l.free_quantity,
            discount_percent: l.discount_percent,
            discount_amount: l.discount_amount,
            gst_percent: l.gst_percent,
            applied_rate_type: l.applied_rate_type,
            approved_total_amount: l.total_amount,
            approval_status: "fully_approved",
            remarks: l.remarks,
          };
        });

        const selectedParty = parties.find((p) => String(p._id ?? p.id ?? "") === String(partyId));
        const partyContacts = contactsFromParty(selectedParty);
        const selectedContacts: string[] = [];
        const selectedContactNames: string[] = [];
        const firstWithPhone = partyContacts.find((c) => c.phone.trim());
        if (firstWithPhone) {
          selectedContacts.push(firstWithPhone.phone.trim());
          selectedContactNames.push(firstWithPhone.name.trim());
        }

        const body = {
          party: partyId,
          order_items: prepared,
          discount_amount: Number(headerDiscount || 0),
          priority: "normal",
          remarks: remarks.trim() || "",
          submit_on_create: true,
          submit_remarks: "Initial submission upon creation",
          expected_delivery_date: expectedDate,
          assigned_admin_user: (user?._id || user?.id) ? String(user?._id || user?.id) : undefined,
          assigned_sales_user: assignedSales,
          approve_immediately: true,
          approval_notes: "Initial approval on admin order creation",
          approved_total_amount: liveSummary.total,
          approval_items: approvalItems,
          contact_number: selectedContacts,
          contact_name: selectedContactNames,
        };

        const data = (await createOrder(body).unwrap()) as any;
        const orderNo = String(data?.order_no ?? "");

        toast.success(
          orderNo
            ? `Order ${orderNo} created and approved successfully`
            : "Order created and approved successfully",
        );
        router.push("/admin/orders");
      } catch (rejected) {
        toast.error(mutationRejectedMessage(rejected));
      }
    },
    [
      partyId,
      createOrder,
      expectedDate,
      lines,
      remarks,
      router,
      assignedSales,
      user,
      allItemsNegotiated,
      liveSummary,
      parties,
    ],
  );

  return (
    <div className="mx-auto w-full max-w-[min(100rem,calc(100vw-2rem))] space-y-6">
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
              Create and submit a new purchase or sales order.
            </p>
          </div>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </Link>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left Column: Form Details & Line Items */}
        <div className="min-w-0 space-y-6">
          {/* Party & Terms */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <header className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
              <User className="h-4 w-4 text-blue-500" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Party & Terms
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Required customer or vendor information.
                </p>
              </div>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1 sm:col-span-2 lg:col-span-4">
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

              <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                <label htmlFor="co-eta" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Expected delivery <span className="text-rose-500">*</span>
                </label>
                <input
                  id="co-eta"
                  type="date"
                  required
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                <label htmlFor="co-remarks" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Remarks
                </label>
                <textarea
                  id="co-remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className={`${inputClass} resize-none`}
                  placeholder="Notes, instructions or special considerations..."
                />
              </div>
            </div>
          </section>

          {/* Line Items */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
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

            {!partyId ? (
              <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                Select a party to check negotiated rates and map prices.
              </p>
            ) : null}

            <div className="space-y-4">
              {lines.map((row, idx) => {
                const rateItem = row.productId
                  ? rateItemByLine.get(
                    rateLookupKey(row.productId, row.applied_rate_type),
                  )
                  : undefined;
                const displayStatus = resolveRateDisplayStatus(rateItem);

                return (
                  <div
                    key={row.key}
                    className="relative space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-slate-955/30"
                  >
                    {/* Row Top Header (Mobile view item badge + delete) */}
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

                    {/* Tier 1 Grid */}
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-12">
                      {/* Product */}
                      <div className="space-y-1 lg:col-span-4">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-550">
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
                      <div className="space-y-1 lg:col-span-1">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                      <div className="space-y-1 lg:col-span-1">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                      <div className="space-y-1 lg:col-span-1">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-550">
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
                          <option value="SRA">SRA</option>
                          <option value="CR">CR</option>
                        </select>
                      </div>

                      {/* Unit Price */}
                      <div className="space-y-1 lg:col-span-2">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Price
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={row.unit_price}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === row.key
                                  ? {
                                    ...l,
                                    unit_price: Number(e.target.value) || 0,
                                  }
                                  : l,
                              ),
                            )
                          }
                          className={inputClass}
                        />
                      </div>

                      {/* Disc % */}
                      <div className="space-y-1 lg:col-span-2">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Disc %
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={row.discount_percent}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === row.key
                                  ? {
                                    ...l,
                                    discount_percent: Number(e.target.value) || 0,
                                  }
                                  : l,
                              ),
                            )
                          }
                          className={inputClass}
                        />
                      </div>

                      {/* GST % */}
                      <div className="space-y-1 lg:col-span-2">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          GST %
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={row.gst_percent}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === row.key
                                  ? {
                                    ...l,
                                    gst_percent: Number(e.target.value) || 0,
                                  }
                                  : l,
                              ),
                            )
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Tier 2 Grid */}
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-12 pt-2 border-t border-slate-100/50 dark:border-white/5">
                      {/* Line Remarks */}
                      <div className="space-y-1 lg:col-span-7">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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

                      {/* Price Mapping Status & Map action */}
                      <div className="space-y-1 lg:col-span-3">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Price Mapping
                        </span>
                        <div className="h-[38px] flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          {row.productId ? (
                            rateCheckQ.isFetching ? (
                              <span className="text-2xs text-slate-400 italic">
                                Checking...
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <LineRateStatusBadge
                                  status={displayStatus}
                                  rateItem={rateItem}
                                  formatMoney={formatMoney}
                                />
                                {canMapPrice ? (
                                  <button
                                    type="button"
                                    onClick={() => openMapModal(row)}
                                    className="inline-flex items-center justify-center rounded bg-blue-600 px-2 py-0.5 text-2xs font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-400 cursor-pointer transition-colors"
                                  >
                                    Map
                                  </button>
                                ) : null}
                              </div>
                            )
                          ) : (
                            <span className="text-2xs text-slate-400 italic">—</span>
                          )}
                        </div>
                      </div>

                      {/* Line Total */}
                      <div className="space-y-1 lg:col-span-2">
                        <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Line Total
                        </span>
                        <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-sm font-semibold tabular-nums text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-slate-50 h-[38px] flex items-center">
                          ₹{formatMoney(lineTotal(row))}
                        </div>
                      </div>

                      {/* Actions (Trash Can Icon) */}
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
                );
              })}
            </div>

            {/* Add Line Button */}
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

        {/* Right Column: Sticky Sidebar summary */}
        <div className="space-y-6">
          <div className="sticky top-6 space-y-6">
            {/* Sales Representative Assignment */}
            <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <header className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
                <Users className="h-4 w-4 text-blue-500" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Assignment
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Required — assign sales rep for order tracking.
                  </p>
                </div>
              </header>

              <div className="space-y-1">
                <label htmlFor="co-sales" className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Sales Representative <span className="text-rose-500">*</span>
                </label>
                <SalesAutocomplete
                  salesUsers={salesUsers}
                  selectedId={assignedSales}
                  onChange={setAssignedSales}
                  className={inputClass}
                />
              </div>
            </section>

            {/* Order Summary & Actions */}
            <section className="rounded-xl border border-blue-100 bg-blue-50/20 p-5 shadow-sm dark:border-blue-900/30 dark:bg-blue-950/10">
              <header className="mb-4 border-b border-blue-100/50 pb-3 dark:border-blue-900/20">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Order Summary
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Calculated estimate of current items.
                </p>
              </header>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Gross Subtotal</span>
                  <span className="font-medium tabular-nums">₹{formatMoney(liveSummary.subtotal)}</span>
                </div>
                <div className="flex justify-between text-rose-600 dark:text-rose-400">
                  <span>Total Discount</span>
                  <span className="font-medium tabular-nums">-₹{formatMoney(liveSummary.discount)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Taxable Amount</span>
                  <span className="font-medium tabular-nums">₹{formatMoney(liveSummary.taxable)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Estimated GST</span>
                  <span className="font-medium tabular-nums">₹{formatMoney(liveSummary.gst)}</span>
                </div>
                <div className="border-t border-blue-100 pt-3 dark:border-blue-900/20">
                  <div className="flex justify-between text-base font-bold text-blue-600 dark:text-blue-400">
                    <span>Grand Total</span>
                    <span className="text-lg tabular-nums">₹{formatMoney(liveSummary.total)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-blue-100/50 dark:border-blue-900/20 space-y-2">
                {!assignedSales && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Select a sales representative to submit.
                  </p>
                )}
                {!allItemsNegotiated && lines.some((l) => l.productId) && (
                  <p className="text-xs text-rose-600 dark:text-rose-455 font-medium text-center font-sans">
                    All items must be negotiated to submit order
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={isLoading || !allItemsNegotiated || !assignedSales}
                  className="w-full font-semibold shadow-md shadow-primary/25"
                  title={
                    !assignedSales
                      ? "Select a sales representative before submitting"
                      : !allItemsNegotiated
                        ? "All items must be negotiated before submitting"
                        : undefined
                  }
                >
                  {isLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-primary-foreground" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Submitting order...
                    </>
                  ) : (
                    "Create & Submit Order"
                  )}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </form>

      <MapOrderLinePriceModal
        open={mapModalOpen}
        onClose={closeMapModal}
        partyId={partyId}
        target={mapTarget}
        onSuccess={handleMapPriceSuccess}
      />
    </div>
  );
}
