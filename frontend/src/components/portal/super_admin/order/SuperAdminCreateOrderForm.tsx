"use client";

import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  X,
  ShoppingCart,
  Package,
  ClipboardCheck,
  Truck,
  Navigation,
  MapPin,
  RotateCcw,
  Check,
  ChevronRight,
  Lock,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Save,
  ArrowRight,
  History,
  AlertCircle,
} from "lucide-react";
import {
  useCreateOrderMutation,
  useListPartiesQuery,
  useListProductsQuery,
  useListUsersQuery,
  useListOrderApprovalsQuery,
  useSuperSheetPatchOrderMutation,
  useSuperSheetPatchOrderApprovalMutation,
  useListDispatchesQuery,
  usePatchDispatchMutation,
  useCreateDispatchMutation,
  useListTransportsQuery,
  useCreateTransportMutation,
  usePatchTransportMutation,
  useListOrderDeliveriesQuery,
  useLogShipmentDeliveryMutation,
  useListOrderReturnsQuery,
  useCreateOrderReturnMutation,
  useCheckPartyLineRatesQuery,
  useGetOrderQuery,
} from "@/store/api";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage, mutationSuccessCopy } from "@/lib/mutationMessages";
import { useAppSelector } from "@/store";
import { contactsFromParty } from "@/lib/partyContacts";
import type { CheckOrderRatesItem } from "@/store/api/slices/partyOrderProductsRateApi";
import {
  LineRateStatusBadge,
  rateLookupKey,
  resolveLineUnitPrice,
  resolveRateDisplayStatus,
} from "@/components/portal/shared/orderLineRateDisplay";
import {
  MapOrderLinePriceModal,
  type MapOrderLinePriceSuccess,
  type MapOrderLinePriceTarget,
} from "@/components/portal/shared/MapOrderLinePriceModal";
import {
  PreviousPartyItemsModal,
  type PreviousPartyOrderItem,
} from "@/components/portal/shared/PreviousPartyItemsModal";
import { OrderItemsForm } from "./OrderItemsForm";
import { OrderApprovalsForm } from "./OrderApprovalsForm";
import { OrderDispatchesForm } from "./OrderDispatchesForm";
import { OrderTransportsForm } from "./OrderTransportsForm";
import { OrderDeliveriesForm } from "./OrderDeliveriesForm";
import { OrderReturnsForm } from "./OrderReturnsForm";
import {
  buildUserNameById,
} from "@/components/portal/shared/userDisplay";
import {
  pickList,
} from "@/components/portal/sales/partyDisplay";
import { SettleRestOrderModal } from "@/components/portal/account/order/components/SettleRestOrderModal";
import { refId, formatMoney, type NamedOption, type ProductOption } from "./utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type StepId =
  | "details"
  | "approvals"
  | "dispatches"
  | "transports"
  | "deliveries"
  | "returns";

type Step = {
  id: StepId;
  label: string;
  icon: ReactNode;
  description: string;
};

export type SuperAdminCreateOrderFormProps = {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (orderId: string) => void;
  orderId?: string | null;
  initialStep?: StepId;
};

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

function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function newLine(): LineRow {
  return {
    key: crypto.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function lineGross(r: LineRow) { return Number(r.quantity || 0) * Number(r.unit_price || 0); }
function lineDiscount(r: LineRow) {
  const gross = lineGross(r);
  const pct = Number(r.discount_percent || 0);
  if (pct > 0) return (gross * pct) / 100;
  return Number(r.discount_amount || 0);
}
function lineTaxable(r: LineRow) { return Math.max(0, lineGross(r) - lineDiscount(r)); }
function lineGst(r: LineRow) { return (lineTaxable(r) * Number(r.gst_percent || 0)) / 100; }
function lineTotal(r: LineRow) { return lineTaxable(r) + lineGst(r); }

// ─── Helper components ───────────────────────────────────────────────────────

function buildProductOptions(raw: unknown): ProductOption[] {
  return pickList(raw)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const id = o._id != null ? String(o._id) : o.id != null ? String(o.id) : "";
      if (!id) return null;
      return {
        id,
        product_name: String(o.product_name || o.name || "").trim() || id,
        sku: String(o.sku || ""),
        brand: typeof o.brand === "object" && o.brand
          ? String((o.brand as { name?: string }).name || "")
          : String(o.brand || ""),
        manufacturer: typeof o.manufacturer === "object" && o.manufacturer
          ? String((o.manufacturer as { name?: string }).name || "")
          : String(o.manufacturer || ""),
        unit: String(o.unit || "pcs"),
        hsn_code: String(o.hsn_code || ""),
        gst_percent: Number(o.gst_percent ?? 0) || 0,
        base_price: Number(o.base_price ?? o.mrp ?? 0) || 0,
      } satisfies ProductOption;
    })
    .filter(Boolean) as ProductOption[];
}

function buildNamedUserOptions(usersRaw: unknown): NamedOption[] {
  const map = buildUserNameById(usersRaw);
  return Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function PartyAutocomplete({ parties, selectedId, onChange, inputClass }: {
  parties: Record<string, unknown>[];
  selectedId: string;
  onChange: (id: string) => void;
  inputClass: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedParty = useMemo(() => parties.find((p) => String(p._id ?? p.id ?? "") === selectedId), [parties, selectedId]);

  useEffect(() => {
    setSearch(selectedParty ? String(selectedParty.party_name || "") : "");
  }, [selectedParty]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return parties;
    return parties.filter((p) =>
      String(p.party_name || "").toLowerCase().includes(q) ||
      String(p.party_code || "").toLowerCase().includes(q)
    );
  }, [parties, search]);

  useEffect(() => {
    const handleOut = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch(selectedParty ? String(selectedParty.party_name || "") : "");
      }
    };
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, [selectedParty]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="Search party by name..."
          className={`${inputClass} pr-8`}
        />
        <Search className="pointer-events-none absolute inset-y-0 right-2.5 my-auto h-3.5 w-3.5 text-slate-400" />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No parties found</div>
          ) : (
            filtered.map((p) => {
              const id = String(p._id ?? p.id ?? "");
              const isSel = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onChange(id); setIsOpen(false); }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${isSel ? "bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/30 dark:text-blue-400" : "text-slate-800 dark:text-slate-200"}`}
                >
                  <span>
                    {String(p.party_name || "Party")}
                    {Boolean(p.party_type) && <span className="ml-1 text-2xs text-slate-400">({String(p.party_type)})</span>}
                  </span>
                  {isSel && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function ProductAutocomplete({ products, selectedId, onChange, inputClass }: {
  products: Record<string, unknown>[];
  selectedId: string;
  onChange: (id: string) => void;
  inputClass: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => products.find((p) => String(p._id ?? p.id ?? "") === selectedId), [products, selectedId]);

  useEffect(() => {
    if (selectedProduct) {
      const name = String(selectedProduct.product_name || "");
      const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
      setSearch(`${name}${sku}`);
    } else setSearch("");
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) =>
      String(p.product_name || "").toLowerCase().includes(q) ||
      String(p.sku || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  useEffect(() => {
    const handleOut = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) {
          const name = String(selectedProduct.product_name || "");
          const sku = selectedProduct.sku ? ` (${selectedProduct.sku})` : "";
          setSearch(`${name}${sku}`);
        } else setSearch("");
      }
    };
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, [selectedProduct]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="Search product..."
          className={`${inputClass} pr-8`}
        />
        <Search className="pointer-events-none absolute inset-y-0 right-2.5 my-auto h-3.5 w-3.5 text-slate-400" />
      </div>
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No products found</div>
          ) : (
            filtered.map((p) => {
              const id = String(p._id ?? p.id ?? "");
              const isSel = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onChange(id); setIsOpen(false); }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${isSel ? "bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/30 dark:text-blue-400" : "text-slate-800 dark:text-slate-200"}`}
                >
                  <span className="truncate">
                    {String(p.product_name || "Product")}
                    {Boolean(p.sku) && <span className="ml-1 text-2xs text-slate-400">{String(p.sku)}</span>}
                  </span>
                  {isSel && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step Definitions ────────────────────────────────────────────────────────

const STEPS: Step[] = [
  { id: "details", label: "Order Details", icon: <ShoppingCart className="h-4 w-4" />, description: "Party, dates & line items" },
  { id: "approvals", label: "Approvals", icon: <ClipboardCheck className="h-4 w-4" />, description: "Review & approve order" },
  { id: "dispatches", label: "Dispatches", icon: <Truck className="h-4 w-4" />, description: "Create dispatch batches" },
  { id: "transports", label: "Transports", icon: <Navigation className="h-4 w-4" />, description: "Manage shipment details" },
  { id: "deliveries", label: "Deliveries", icon: <MapPin className="h-4 w-4" />, description: "Log delivery events" },
  { id: "returns", label: "Returns", icon: <RotateCcw className="h-4 w-4" />, description: "Log return events" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminCreateOrderForm({ isOpen, onClose, onOrderCreated, orderId, initialStep }: SuperAdminCreateOrderFormProps) {
  const user = useAppSelector((s) => s.auth.user);

  // Step state
  const [activeStep, setActiveStep] = useState<StepId>("details");
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (orderId) {
        setCreatedOrderId(orderId);
        setActiveStep(initialStep || "details");
      } else {
        setCreatedOrderId(null);
        setActiveStep("details");
      }
    }
  }, [isOpen, orderId, initialStep]);

  // Data queries (only load when we have an orderId)
  const partiesQ = useListPartiesQuery({ status: "active" });
  const productsQ = useListProductsQuery({});
  const salesUsersQ = useListUsersQuery({ department: "sales" });
  const allUsersQ = useListUsersQuery({});

  const approvalsQ = useListOrderApprovalsQuery({ order: createdOrderId! }, { skip: !createdOrderId });
  const dispatchesQ = useListDispatchesQuery({ order: createdOrderId! }, { skip: !createdOrderId });
  const transportsQ = useListTransportsQuery({ order: createdOrderId! }, { skip: !createdOrderId });
  const deliveriesQ = useListOrderDeliveriesQuery({ order: createdOrderId! }, { skip: !createdOrderId });
  const returnsQ = useListOrderReturnsQuery({ order: createdOrderId! }, { skip: !createdOrderId });

  const { data: fetchedOrder } = useGetOrderQuery(createdOrderId!, { skip: !createdOrderId });

  // Order data (re-fetched via existing endpoint after creation)
  const [orderData, setOrderData] = useState<any>(null);

  useEffect(() => {
    if (fetchedOrder) {
      setOrderData(fetchedOrder);
    }
  }, [fetchedOrder]);

  // Mutations
  const [createOrder, { isLoading: isCreating }] = useCreateOrderMutation();
  const [patchOrder, { isLoading: isPatchingOrder }] = useSuperSheetPatchOrderMutation();
  const [patchApproval, { isLoading: isPatchingApproval }] = useSuperSheetPatchOrderApprovalMutation();
  const [createDispatch, { isLoading: isCreatingDispatch }] = useCreateDispatchMutation();
  const [patchDispatch, { isLoading: isPatchingDispatch }] = usePatchDispatchMutation();
  const [createTransport, { isLoading: isCreatingTransport }] = useCreateTransportMutation();
  const [patchTransport, { isLoading: isPatchingTransport }] = usePatchTransportMutation();
  const [logDelivery, { isLoading: isLoggingDelivery }] = useLogShipmentDeliveryMutation();
  const [createReturn, { isLoading: isCreatingReturn }] = useCreateOrderReturnMutation();

  // Settle rest order modal
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleApproval, setSettleApproval] = useState<Record<string, unknown> | null>(null);
  const [settleReleaseNo, setSettleReleaseNo] = useState("");

  // ── Step 1 state ────────────────────────────────────────────────────────
  const [partyId, setPartyId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [remarks, setRemarks] = useState("");
  const [assignedSales, setAssignedSales] = useState("");
  const [lines, setLines] = useState<LineRow[]>([newLine()]);

  // Sync state if editing
  useEffect(() => {
    if (!isOpen) return;
    if (!orderId) {
      setPartyId("");
      const d = new Date();
      setOrderDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setExpectedDate("");
      setPriority("normal");
      setRemarks("");
      setAssignedSales("");
      setLines([newLine()]);
      return;
    }
    if (!orderData) return;
    const o = orderData;
    setPartyId(refId(o.party));
    setOrderDate(o.order_date ? toDateInput(o.order_date) : "");
    setExpectedDate(o.expected_delivery_date ? toDateInput(o.expected_delivery_date) : "");
    setPriority(o.priority || "normal");
    setRemarks(o.remarks || "");
    setAssignedSales(refId(o.assigned_sales_user));
    if (Array.isArray(o.order_items) && o.order_items.length > 0) {
      setLines(o.order_items.map((item: any, i: number) => ({
        key: item._id || item.id || `line-${i}-${Math.random()}`,
        productId: refId(item.product),
        product_name: String(item.product_name || ""),
        sku: String(item.sku || ""),
        brand: String(item.brand || ""),
        manufacturer: String(item.manufacturer || ""),
        product_group: String(item.product_group || ""),
        product_subgroup: String(item.product_subgroup || ""),
        unit: String(item.unit || "pcs"),
        quantity: Number(item.ordered_quantity ?? item.quantity ?? 1),
        free_qty: Number(item.free_quantity ?? item.free_qty ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        discount_percent: Number(item.discount_percent ?? 0),
        discount_amount: Number(item.discount_amount ?? 0),
        gst_percent: Number(item.gst_percent ?? 18),
        applied_rate_type: String(item.applied_rate_type || "SR"),
        remarks: String(item.remarks || ""),
      })));
    }
  }, [isOpen, orderId, orderData]);
  const [mapTarget, setMapTarget] = useState<MapOrderLinePriceTarget | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [previousItemsModalOpen, setPreviousItemsModalOpen] = useState(false);
  const [searchSales, setSearchSales] = useState("");
  const salesSearchRef = useRef<HTMLDivElement>(null);
  const [salesOpen, setSalesOpen] = useState(false);

  // Data transforms
  const parties = useMemo(() => pickList(partiesQ.data) as Record<string, any>[], [partiesQ.data]);
  const products = useMemo(() => pickList(productsQ.data) as Record<string, any>[], [productsQ.data]);
  const salesUsers = useMemo(() => pickList(salesUsersQ.data) as Record<string, any>[], [salesUsersQ.data]);
  const productOptions = useMemo(() => buildProductOptions(productsQ.data), [productsQ.data]);
  const userOptions = useMemo(() => buildNamedUserOptions(allUsersQ.data), [allUsersQ.data]);

  const approvals = useMemo(() => pickList(approvalsQ.data) as Record<string, any>[], [approvalsQ.data]);
  const dispatches = useMemo(() => pickList(dispatchesQ.data) as Record<string, any>[], [dispatchesQ.data]);
  const transports = useMemo(() => pickList(transportsQ.data) as Record<string, any>[], [transportsQ.data]);
  const deliveries = useMemo(() => pickList(deliveriesQ.data) as Record<string, any>[], [deliveriesQ.data]);
  const returns = useMemo(() => pickList(returnsQ.data) as Record<string, any>[], [returnsQ.data]);

  const selectedParty = useMemo(() => parties.find((p) => String(p._id ?? p.id ?? "") === partyId), [parties, partyId]);
  const selectedPartyName = selectedParty ? String(selectedParty.party_name || "") : "";

  // ── Rate checking ────────────────────────────────────────────────────────
  const lineRateCheckInput = useMemo(() => {
    if (!partyId) return null;
    const items = lines.filter((l) => l.productId).map((l) => ({
      product: l.productId,
      applied_rate_type: l.applied_rate_type,
      product_name: l.product_name,
      sku: l.sku,
      unit_price: l.unit_price,
    }));
    if (!items.length) return null;
    return { party: partyId, items };
  }, [partyId, lines]);

  const rateCheckQ = useCheckPartyLineRatesQuery(lineRateCheckInput!, { skip: !lineRateCheckInput });

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
      const rateItem = rateItemByLine.get(rateLookupKey(line.productId, line.applied_rate_type));
      return resolveRateDisplayStatus(rateItem) === "negotiated";
    });
  }, [lines, rateItemByLine]);

  const resolvePriceForLine = useCallback((productId: string, rateType: string, catalogProduct: Record<string, unknown> | undefined) => {
    const rateItem = productId ? rateItemByLine.get(rateLookupKey(productId, rateType)) : undefined;
    return resolveLineUnitPrice(rateItem, catalogProduct, rateType);
  }, [rateItemByLine]);

  useEffect(() => {
    if (!rateCheckQ.data?.items?.length) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!row.productId) return row;
        const rateItem = rateItemByLine.get(rateLookupKey(row.productId, row.applied_rate_type));
        if (!rateItem?.hasRate || rateItem.currentMappedRate == null) return row;
        const negotiated = Number(rateItem.currentMappedRate);
        if (!Number.isFinite(negotiated) || row.unit_price === negotiated) return row;
        changed = true;
        return { ...row, unit_price: negotiated };
      });
      return changed ? next : prev;
    });
  }, [rateCheckQ.data, rateItemByLine]);

  const liveSummary = useMemo(() => {
    let subtotal = 0, discount = 0, taxable = 0, gst = 0, total = 0;
    for (const line of lines) {
      if (!line.productId) continue;
      subtotal += lineGross(line);
      discount += lineDiscount(line);
      taxable += lineTaxable(line);
      gst += lineGst(line);
      total += lineTotal(line);
    }
    return { subtotal, discount, taxable, gst, total };
  }, [lines]);

  const onProductRowChange = useCallback((key: string, productId: string) => {
    const p = products.find((x) => String(x._id ?? x.id ?? "") === productId);
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        if (!p) return { ...row, productId: "", product_name: "", sku: "", brand: "", manufacturer: "", product_group: "", product_subgroup: "", unit: "", unit_price: 0, gst_percent: 18 };
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
          gst_percent: Number(p.gst_percent ?? 18),
        };
      })
    );
  }, [products, resolvePriceForLine]);

  const onRateTypeChange = useCallback((key: string, rateType: string) => {
    setLines((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const p = products.find((x) => String(x._id ?? x.id ?? "") === row.productId);
        return { ...row, applied_rate_type: rateType, unit_price: resolvePriceForLine(row.productId, rateType, p) };
      })
    );
  }, [products, resolvePriceForLine]);

  // Sales search
  const selectedSalesUser = useMemo(() => salesUsers.find((u) => String(u._id ?? u.id ?? "") === assignedSales), [salesUsers, assignedSales]);
  useEffect(() => {
    setSearchSales(selectedSalesUser ? String(selectedSalesUser.name || selectedSalesUser.username || "") : "");
  }, [selectedSalesUser]);
  const filteredSales = useMemo(() => {
    const q = searchSales.toLowerCase().trim();
    if (!q) return salesUsers;
    return salesUsers.filter((u) => String(u.name || "").toLowerCase().includes(q) || String(u.username || "").toLowerCase().includes(q));
  }, [salesUsers, searchSales]);
  useEffect(() => {
    const handleOut = (e: MouseEvent) => {
      if (salesSearchRef.current && !salesSearchRef.current.contains(e.target as Node)) {
        setSalesOpen(false);
        setSearchSales(selectedSalesUser ? String(selectedSalesUser.name || selectedSalesUser.username || "") : "");
      }
    };
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, [selectedSalesUser]);

  // ── Step gating ──────────────────────────────────────────────────────────
  const isStepUnlocked = useCallback((step: StepId): boolean => {
    if (step === "details") return true;
    if (!createdOrderId) return false;
    if (step === "approvals") return true;
    if (step === "dispatches" || step === "returns") return approvals.length > 0;
    if (step === "transports") return dispatches.length > 0;
    if (step === "deliveries") return transports.length > 0;
    return false;
  }, [createdOrderId, approvals.length, dispatches.length, transports.length]);

  const isStepComplete = useCallback((step: StepId): boolean => {
    if (step === "details") return !!createdOrderId;
    if (step === "approvals") return approvals.length > 0;
    if (step === "dispatches") return dispatches.length > 0;
    if (step === "transports") return transports.length > 0;
    if (step === "deliveries") return deliveries.length > 0;
    if (step === "returns") return returns.length > 0;
    return false;
  }, [createdOrderId, approvals.length, dispatches.length, transports.length, deliveries.length, returns.length]);

  // ── Reset on close ───────────────────────────────────────────────────────
  const handleClose = () => {
    setActiveStep("details");
    setCreatedOrderId(null);
    setOrderData(null);
    setPartyId("");
    setOrderDate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    setExpectedDate("");
    setPriority("normal");
    setRemarks("");
    setAssignedSales("");
    setLines([newLine()]);
    onClose();
  };

  // ── Step 1 Submit ────────────────────────────────────────────────────────
  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!partyId) { toast.error("Select a party."); return; }
    if (!assignedSales) { toast.error("Select a sales representative."); return; }
    if (!allItemsNegotiated) { toast.error("Please negotiate all line item prices before creating the order."); return; }
    if (!orderDate.trim()) { toast.error("Order date is required."); return; }
    if (!expectedDate.trim()) { toast.error("Expected delivery date is required."); return; }

    const prepared = lines.filter((l) => l.productId).map((l) => ({
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

    if (!prepared.length) { toast.error("Add at least one line item with a product."); return; }
    if (prepared.some((l) => l.ordered_quantity < 1)) { toast.error("Each line needs quantity ≥ 1."); return; }

    try {
      if (createdOrderId) {
        // UPDATE
        const body: Record<string, any> = {
          party: partyId,
          order_items: prepared,
          remarks: remarks.trim() || "",
          order_date: orderDate,
          expected_delivery_date: expectedDate,
          assigned_sales_user: assignedSales,
          priority,
        };
        const data = (await patchOrder({ id: createdOrderId, patch: body }).unwrap()) as any;
        setOrderData(data);
        toast.success("Order details updated successfully!");
        setActiveStep("approvals");
      } else {
        // CREATE
        const approvalItems = prepared.map((l) => ({
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
        }));

        const partyContacts = contactsFromParty(selectedParty);
        const firstWithPhone = partyContacts.find((c) => c.phone.trim());
        const actorId = user?._id || user?.id ? String(user?._id || user?.id) : undefined;

        const body: Record<string, unknown> = {
          party: partyId,
          order_items: prepared,
          discount_amount: 0,
          priority,
          remarks: remarks.trim() || "",
          submit_on_create: true,
          submit_remarks: "Initial submission upon super-admin creation",
          order_date: orderDate,
          expected_delivery_date: expectedDate,
          assigned_admin_user: actorId,
          assigned_sales_user: assignedSales,
          approve_immediately: true,
          approval_notes: "Initial approval on super-admin order creation",
          approved_total_amount: liveSummary.total,
          approval_items: approvalItems,
          contact_number: firstWithPhone ? [firstWithPhone.phone.trim()] : [],
          contact_name: firstWithPhone ? [firstWithPhone.name.trim()] : [],
        };

        const data = (await createOrder(body).unwrap()) as any;
        const newOrderId = String(data?._id || data?.id || "");
        const orderNo = String(data?.order_no ?? "");
        setCreatedOrderId(newOrderId);
        setOrderData(data);
        onOrderCreated?.(newOrderId);
        toast.success(orderNo ? `Order ${orderNo} created successfully!` : "Order created successfully!");
        setActiveStep("approvals");
      }
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  };

  // ── Sub-form handlers ────────────────────────────────────────────────────
  const handleSaveItems = useCallback(async (patch: Record<string, unknown>) => {
    if (!createdOrderId) return;
    try {
      const data = (await patchOrder({ id: createdOrderId, patch }).unwrap()) as any;
      setOrderData(data);
      toast.success(mutationSuccessCopy("order items"));
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [createdOrderId, patchOrder]);

  const handleSaveApproval = useCallback(async (approvalId: string, patch: Record<string, unknown>) => {
    try {
      await patchApproval({ id: approvalId, patch }).unwrap();
      await approvalsQ.refetch();
      toast.success(mutationSuccessCopy("approval"));
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [patchApproval, approvalsQ]);

  const handleSaveDispatch = useCallback(async (dispatchId: string, patch: Record<string, unknown>) => {
    try {
      await patchDispatch({ id: dispatchId, patch }).unwrap();
      await dispatchesQ.refetch();
      toast.success(mutationSuccessCopy("dispatch"));
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [patchDispatch, dispatchesQ]);

  const handleCreateDispatch = useCallback(async (formData: FormData) => {
    try {
      await createDispatch(formData).unwrap();
      await dispatchesQ.refetch();
      toast.success("Dispatch created successfully!");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [createDispatch, dispatchesQ]);

  const handleSaveTransport = useCallback(async (transportId: string, payload: Record<string, any>) => {
    try {
      await patchTransport({ id: transportId, patch: payload }).unwrap();
      await transportsQ.refetch();
      toast.success(mutationSuccessCopy("transport"));
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [patchTransport, transportsQ]);

  const handleCreateTransport = useCallback(async (payload: Record<string, any>) => {
    try {
      await createTransport(payload).unwrap();
      await transportsQ.refetch();
      toast.success("Transport created successfully!");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [createTransport, transportsQ]);

  const handleLogDelivery = useCallback(async (payload: Record<string, any>) => {
    try {
      await logDelivery(payload).unwrap();
      await deliveriesQ.refetch();
      toast.success("Delivery logged successfully!");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [logDelivery, deliveriesQ]);

  const handleCreateReturn = useCallback(async (payload: Record<string, any>) => {
    try {
      await createReturn(payload).unwrap();
      await returnsQ.refetch();
      toast.success("Return logged successfully!");
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [createReturn, returnsQ]);

  if (!isOpen) return null;

  const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

  const activeStepIndex = STEPS.findIndex((s) => s.id === activeStep);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <LargeModalPortal>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm">
        <div className="flex h-[96vh] w-full max-w-[1200px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">

          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
            {/* Header */}
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
                  <ShoppingCart className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    {createdOrderId ? "Edit Order" : "Create Order"}
                  </p>
                  <p className="text-2xs text-slate-400">Super Admin • Full Workflow</p>
                </div>
              </div>
              {createdOrderId && (
                <div className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-950/30">
                  <p className="text-2xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Order created ✓
                  </p>
                  <p className="mt-0.5 font-mono text-2xs text-emerald-600/70 dark:text-emerald-500/70 truncate">
                    {orderData?.order_no || createdOrderId.slice(-12)}
                  </p>
                </div>
              )}
            </div>

            {/* Steps nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {STEPS.map((step, idx) => {
                const unlocked = isStepUnlocked(step.id);
                const complete = isStepComplete(step.id);
                const isActive = activeStep === step.id;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => { if (unlocked) setActiveStep(step.id); }}
                    disabled={!unlocked}
                    className={`group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed
                      ${isActive
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                        : unlocked
                          ? "hover:bg-slate-100 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
                          : "opacity-40 text-slate-400 dark:text-slate-600"
                      }`}
                  >
                    {/* Step number / icon */}
                    <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold transition
                      ${isActive
                        ? "bg-white/20 text-white"
                        : complete
                          ? "bg-emerald-500 text-white"
                          : unlocked
                            ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      }`}>
                      {complete && !isActive ? <Check className="h-3 w-3" /> : !unlocked ? <Lock className="h-2.5 w-2.5" /> : <span>{idx + 1}</span>}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold leading-tight ${isActive ? "text-white" : ""}`}>
                        {step.label}
                      </p>
                      <p className={`mt-0.5 text-2xs leading-tight ${isActive ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>
                        {step.description}
                      </p>
                    </div>

                    {isActive && <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-white/70" />}
                  </button>
                );
              })}
            </nav>

            {/* Footer actions */}
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 dark:text-slate-400"
              >
                <X className="h-3.5 w-3.5" />
                Close & Exit
              </button>
            </div>
          </aside>

          {/* ── Main Content ──────────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Step header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <span>Step {activeStepIndex + 1} of {STEPS.length}</span>
                  <span>·</span>
                  <span>{STEPS[activeStepIndex]?.description}</span>
                </div>
                <h2 className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-50">
                  {STEPS.find((s) => s.id === activeStep)?.label}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {/* Progress bar dots */}
                <div className="flex gap-1.5">
                  {STEPS.map((step) => (
                    <div
                      key={step.id}
                      className={`h-1.5 rounded-full transition-all ${
                        step.id === activeStep
                          ? "w-5 bg-blue-500"
                          : isStepComplete(step.id)
                            ? "w-2 bg-emerald-400"
                            : isStepUnlocked(step.id)
                              ? "w-2 bg-slate-200 dark:bg-slate-700"
                              : "w-2 bg-slate-100 dark:bg-slate-800"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ── Step Content ───────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

              {/* ─── STEP 1: Order Details & Line Items ─────────────────── */}
              {activeStep === "details" && (
                <form onSubmit={handleCreateOrder} className="h-full">
                  <div className="space-y-5 p-6">
                    {/* Party & Terms */}
                    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-950/50">
                          <ShoppingCart className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        Party & Order Terms
                      </h3>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Party <span className="text-rose-500">*</span>
                          </label>
                          <PartyAutocomplete
                            parties={parties}
                            selectedId={partyId}
                            onChange={(id) => {
                              setPartyId(id);
                              if (id) setPreviousItemsModalOpen(true);
                            }}
                            inputClass={inputClass}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Order Date <span className="text-rose-500">*</span>
                          </label>
                          <input type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputClass} />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Expected Delivery <span className="text-rose-500">*</span>
                          </label>
                          <input type="date" required value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Priority</label>
                          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>

                        {/* Sales rep */}
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Sales Rep <span className="text-rose-500">*</span>
                          </label>
                          <div ref={salesSearchRef} className="relative">
                            <input
                              type="text"
                              value={searchSales}
                              onChange={(e) => { setSearchSales(e.target.value); setSalesOpen(true); }}
                              onFocus={() => setSalesOpen(true)}
                              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                              placeholder="Search sales rep..."
                              className={`${inputClass} pr-8`}
                            />
                            <Search className="pointer-events-none absolute inset-y-0 right-2.5 my-auto h-3.5 w-3.5 text-slate-400" />
                            {salesOpen && (
                              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                <button type="button" onClick={() => { setAssignedSales(""); setSearchSales(""); setSalesOpen(false); }} className="flex w-full items-center px-3 py-1.5 text-left text-xs italic text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">— Unassigned —</button>
                                {filteredSales.map((u) => {
                                  const id = String(u._id ?? u.id ?? "");
                                  const isSel = id === assignedSales;
                                  return (
                                    <button key={id} type="button" onClick={() => { setAssignedSales(id); setSalesOpen(false); }} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${isSel ? "bg-blue-50 text-blue-700 font-semibold dark:bg-blue-950/30 dark:text-blue-400" : "text-slate-800 dark:text-slate-200"}`}>
                                      <span>{String(u.name || u.username || id)}</span>
                                      {isSel && <Check className="h-3.5 w-3.5" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Remarks</label>
                          <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={`${inputClass} resize-none`} placeholder="Notes or special instructions..." />
                        </div>
                      </div>
                    </section>

                    {/* Line Items */}
                    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-950/50">
                            <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                          Line Items
                        </h3>
                        <div className="flex items-center gap-2">
                          {partyId && (
                            <button type="button" onClick={() => setPreviousItemsModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              <History className="h-3.5 w-3.5" /> Previous items
                            </button>
                          )}
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">{lines.length} {lines.length === 1 ? "item" : "items"}</span>
                        </div>
                      </div>

                      {!partyId && (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Select a party above to enable price negotiation & rate mapping.
                        </div>
                      )}

                      <div className="space-y-3">
                        {lines.map((row, idx) => {
                          const rateItem = row.productId ? rateItemByLine.get(rateLookupKey(row.productId, row.applied_rate_type)) : undefined;
                          const displayStatus = resolveRateDisplayStatus(rateItem);

                          return (
                            <div key={row.key} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/30">
                              <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Line {idx + 1}</span>
                                <button type="button" disabled={lines.length <= 1} onClick={() => setLines((p) => p.filter((l) => l.key !== row.key))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/30">
                                  <Trash2 className="h-3 w-3" /> Remove
                                </button>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
                                <div className="space-y-1 sm:col-span-2 lg:col-span-5">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Product *</span>
                                  <ProductAutocomplete products={products} selectedId={row.productId} onChange={(val) => onProductRowChange(row.key, val)} inputClass={inputClass} />
                                </div>

                                <div className="space-y-1 lg:col-span-1">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Qty</span>
                                  <input type="number" min={1} step={1} value={row.quantity} onChange={(e) => setLines((p) => p.map((l) => l.key === row.key ? { ...l, quantity: Number(e.target.value) || 0 } : l))} className={inputClass} />
                                </div>

                                <div className="space-y-1 lg:col-span-1">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Free</span>
                                  <input type="number" min={0} step={1} value={row.free_qty} onChange={(e) => setLines((p) => p.map((l) => l.key === row.key ? { ...l, free_qty: Number(e.target.value) || 0 } : l))} className={inputClass} />
                                </div>

                                <div className="space-y-1 lg:col-span-1">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Rate</span>
                                  <select value={row.applied_rate_type} onChange={(e) => onRateTypeChange(row.key, e.target.value)} className={inputClass}>
                                    <option value="SR">SR</option>
                                    <option value="SRA">SRA</option>
                                    <option value="CR">CR</option>
                                  </select>
                                </div>

                                <div className="space-y-1 lg:col-span-2">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Price</span>
                                  <input type="number" min={0} step="any" value={row.unit_price} onChange={(e) => setLines((p) => p.map((l) => l.key === row.key ? { ...l, unit_price: Number(e.target.value) || 0 } : l))} className={inputClass} />
                                </div>

                                <div className="space-y-1 lg:col-span-2">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Disc %</span>
                                  <input type="number" min={0} max={100} step="any" value={row.discount_percent} onChange={(e) => setLines((p) => p.map((l) => l.key === row.key ? { ...l, discount_percent: Number(e.target.value) || 0 } : l))} className={inputClass} />
                                </div>
                              </div>

                              <div className="mt-3 grid gap-3 sm:grid-cols-12">
                                <div className="space-y-1 sm:col-span-4">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">GST %</span>
                                  <input type="number" min={0} step="any" value={row.gst_percent} onChange={(e) => setLines((p) => p.map((l) => l.key === row.key ? { ...l, gst_percent: Number(e.target.value) || 0 } : l))} className={inputClass} />
                                </div>

                                <div className="space-y-1 sm:col-span-5">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Line Remarks</span>
                                  <input value={row.remarks} onChange={(e) => setLines((p) => p.map((l) => l.key === row.key ? { ...l, remarks: e.target.value } : l))} placeholder="Notes..." className={inputClass} />
                                </div>

                                <div className="space-y-1 sm:col-span-3">
                                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">Price Mapping</span>
                                  <div className="flex h-9 items-center gap-2">
                                    {row.productId ? (
                                      rateCheckQ.isFetching ? (
                                        <span className="text-2xs italic text-slate-400">Checking...</span>
                                      ) : (
                                        <>
                                          <LineRateStatusBadge status={displayStatus} rateItem={rateItem} formatMoney={(v) => formatMoney(Number(v))} />
                                          {partyId && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (!row.productId) { toast.error("Select a product first."); return; }
                                                setMapTarget({ productId: row.productId, productName: row.product_name || "Product", sku: row.sku || undefined, appliedRateType: row.applied_rate_type, unitPrice: row.unit_price, mappingId: rateItem?.mappingId ?? null, isMapped: Boolean(rateItem?.isMapped), hasRate: Boolean(rateItem?.hasRate) });
                                                setMapModalOpen(true);
                                              }}
                                              className="rounded bg-blue-600 px-2 py-0.5 text-2xs font-bold text-white hover:bg-blue-700 transition"
                                            >
                                              Map
                                            </button>
                                          )}
                                        </>
                                      )
                                    ) : (
                                      <span className="text-2xs italic text-slate-400">—</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Line totals */}
                              <div className="mt-2 flex flex-wrap gap-4 rounded-lg border border-slate-100 bg-white px-3 py-2 text-2xs dark:border-slate-800 dark:bg-slate-900">
                                <span>Taxable: <strong className="font-mono">₹{formatMoney(lineTaxable(row))}</strong></span>
                                <span>GST: <strong className="font-mono">₹{formatMoney(lineGst(row))}</strong></span>
                                <span>Total: <strong className="font-mono text-amber-700 dark:text-amber-400">₹{formatMoney(lineTotal(row))}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <button type="button" onClick={() => setLines((p) => [...p, newLine()])} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          <Plus className="h-3.5 w-3.5" /> Add Line Item
                        </button>
                      </div>
                    </section>

                    {/* Order Summary + Submit */}
                    <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 dark:border-blue-900/30 dark:bg-blue-950/10">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Order Summary</h3>
                        {!allItemsNegotiated && lines.some((l) => l.productId) && (
                          <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-2xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                            ⚠ Rates not negotiated
                          </span>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-slate-600 dark:text-slate-400 mb-4">
                        <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                          <p className="text-2xs font-semibold uppercase text-slate-400">Gross Subtotal</p>
                          <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50 font-mono">₹{formatMoney(liveSummary.subtotal)}</p>
                        </div>
                        <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                          <p className="text-2xs font-semibold uppercase text-slate-400">Discount</p>
                          <p className="mt-1 text-base font-bold text-rose-600 dark:text-rose-400 font-mono">-₹{formatMoney(liveSummary.discount)}</p>
                        </div>
                        <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                          <p className="text-2xs font-semibold uppercase text-slate-400">GST</p>
                          <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50 font-mono">₹{formatMoney(liveSummary.gst)}</p>
                        </div>
                        <div className="rounded-lg bg-blue-600 px-3 py-2">
                          <p className="text-2xs font-semibold uppercase text-blue-200">Grand Total</p>
                          <p className="mt-1 text-base font-bold text-white font-mono">₹{formatMoney(liveSummary.total)}</p>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={isCreating || isPatchingOrder || !allItemsNegotiated || !assignedSales || !partyId}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {(isCreating || isPatchingOrder) ? (
                          <><RefreshCw className="h-4 w-4 animate-spin" />{createdOrderId ? "Saving Changes..." : "Creating Order..."}</>
                        ) : createdOrderId ? (
                          <><Save className="h-4 w-4" /> Update Order <ArrowRight className="h-4 w-4" /></>
                        ) : (
                          <><Save className="h-4 w-4" /> Create Order &amp; Continue <ArrowRight className="h-4 w-4" /></>
                        )}
                      </button>
                    </section>
                  </div>
                </form>
              )}

              {/* ─── STEP 2: Approvals ─────────────────────────────────── */}
              {activeStep === "approvals" && createdOrderId && orderData && (
                <div className="embedded-subform-wrapper relative h-full">
                  <OrderApprovalsForm
                    order={orderData}
                    approvals={approvals}
                    users={userOptions}
                    products={productOptions}
                    saving={isPatchingApproval}
                    onClose={() => setActiveStep("dispatches")}
                    onSave={handleSaveApproval}
                  />
                </div>
              )}

              {/* ─── STEP 3: Dispatches ─────────────────────────────────── */}
              {activeStep === "dispatches" && createdOrderId && orderData && (
                <div className="embedded-subform-wrapper relative h-full">
                  <OrderDispatchesForm
                    order={orderData}
                    dispatches={dispatches}
                    approvals={approvals}
                    users={userOptions}
                    saving={isCreatingDispatch || isPatchingDispatch}
                    onClose={() => setActiveStep("transports")}
                    onSave={handleSaveDispatch}
                    onCreate={handleCreateDispatch}
                    onSettleClick={(approval, releaseNo) => {
                      setSettleApproval(approval);
                      setSettleReleaseNo(releaseNo);
                      setSettleModalOpen(true);
                    }}
                  />
                </div>
              )}

              {/* ─── STEP 4: Transports ─────────────────────────────────── */}
              {activeStep === "transports" && createdOrderId && orderData && (
                <div className="embedded-subform-wrapper relative h-full">
                  <OrderTransportsForm
                    order={orderData}
                    dispatches={dispatches}
                    transports={transports}
                    users={userOptions}
                    saving={isCreatingTransport || isPatchingTransport}
                    onClose={() => setActiveStep("deliveries")}
                    onCreate={handleCreateTransport}
                    onSave={handleSaveTransport}
                  />
                </div>
              )}

              {/* ─── STEP 5: Deliveries ─────────────────────────────────── */}
              {activeStep === "deliveries" && createdOrderId && orderData && (
                <div className="embedded-subform-wrapper relative h-full">
                  <OrderDeliveriesForm
                    order={orderData}
                    dispatches={dispatches}
                    transports={transports}
                    deliveries={deliveries}
                    saving={isLoggingDelivery}
                    onClose={() => setActiveStep("returns")}
                    onLogDelivery={handleLogDelivery}
                  />
                </div>
              )}

              {/* ─── STEP 6: Returns ─────────────────────────────────────── */}
              {activeStep === "returns" && createdOrderId && orderData && (
                <div className="embedded-subform-wrapper relative h-full">
                  <OrderReturnsForm
                    order={orderData}
                    dispatches={dispatches}
                    returns={returns}
                    saving={isCreatingReturn}
                    onClose={handleClose}
                    onCreateReturn={handleCreateReturn}
                  />
                </div>
              )}

              {/* Locked state fallback */}
              {activeStep !== "details" && !createdOrderId && (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <Lock className="h-8 w-8 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Step Locked</p>
                    <p className="mt-1 text-xs text-slate-500">Complete Step 1 to create the order first.</p>
                  </div>
                  <button type="button" onClick={() => setActiveStep("details")} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition">
                    Go to Order Details
                  </button>
                </div>
              )}
            </div>

            {/* ── Footer nav ────────────────────────────────────────────── */}
            {createdOrderId && (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const idx = STEPS.findIndex((s) => s.id === activeStep);
                      if (idx > 0) setActiveStep(STEPS[idx - 1].id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    ← Back
                  </button>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{orderData?.order_no || ""}</span>
                    {isStepComplete(activeStep) && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" /> Saved
                      </span>
                    )}
                  </div>

                  {activeStep !== "returns" ? (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = STEPS.findIndex((s) => s.id === activeStep);
                        const next = STEPS[idx + 1];
                        if (next && isStepUnlocked(next.id)) setActiveStep(next.id);
                      }}
                      disabled={!isStepUnlocked(STEPS[STEPS.findIndex((s) => s.id === activeStep) + 1]?.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
                    >
                      Next Step <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                    >
                      <Check className="h-3.5 w-3.5" /> Done — Close
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <MapOrderLinePriceModal
        open={mapModalOpen}
        onClose={() => { setMapModalOpen(false); setMapTarget(null); }}
        partyId={partyId}
        target={mapTarget}
        onSuccess={(result: MapOrderLinePriceSuccess) => {
          setLines((prev) =>
            prev.map((row) =>
              row.productId === result.productId && row.applied_rate_type === result.appliedRateType
                ? { ...row, unit_price: result.negotiatedRate }
                : row
            )
          );
          toast.success("Line price updated to negotiated rate.");
          if (!rateCheckQ.isUninitialized) void rateCheckQ.refetch();
        }}
      />

      <PreviousPartyItemsModal
        open={previousItemsModalOpen}
        onClose={() => setPreviousItemsModalOpen(false)}
        partyId={partyId}
        partyName={selectedPartyName}
        onLoad={(items: PreviousPartyOrderItem[]) => {
          const mappedLines: LineRow[] = items.map((item) => ({
            key: crypto.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            productId: item.productId,
            product_name: item.product_name,
            sku: item.sku,
            brand: item.brand,
            manufacturer: item.manufacturer,
            product_group: item.product_group,
            product_subgroup: item.product_subgroup,
            unit: item.unit,
            quantity: item.quantity,
            free_qty: item.free_qty,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            discount_amount: item.discount_amount,
            gst_percent: item.gst_percent,
            applied_rate_type: item.applied_rate_type,
            remarks: item.remarks,
          }));
          if (mappedLines.length > 0) {
            setLines(mappedLines);
            toast.success(`Loaded ${mappedLines.length} previous item${mappedLines.length === 1 ? "" : "s"}.`);
          }
        }}
      />

      {settleModalOpen && settleApproval && createdOrderId && (
        <SettleRestOrderModal
          open={settleModalOpen}
          approval={settleApproval}
          dispatches={dispatches}
          releaseNo={settleReleaseNo}
          orderId={createdOrderId}
          orderItems={orderData?.order_items || []}
          onClose={() => { setSettleModalOpen(false); setSettleApproval(null); }}
          onSettled={() => {
            setSettleModalOpen(false);
            setSettleApproval(null);
            void dispatchesQ.refetch();
          }}
        />
      )}

      {/* Flatten sub-modals inside the wizard container */}
      <style jsx global>{`
        .embedded-subform-wrapper > div.fixed {
          position: relative !important;
          z-index: auto !important;
          background-color: transparent !important;
          padding: 0 !important;
          inset: auto !important;
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
          max-height: none !important;
        }
        .embedded-subform-wrapper > div.fixed > div.flex {
          max-height: none !important;
          height: 100% !important;
          width: 100% !important;
          max-width: none !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        /* Hide duplicate modal headers & cancel/close button rows in footers */
        .embedded-subform-wrapper > div.fixed > div.flex > div.border-b {
          display: none !important;
        }
        .embedded-subform-wrapper > div.fixed > div.flex > div.flex-1.overflow-auto {
          padding: 1.5rem !important;
        }
        /* Hide sub-modal cancel/done footer row to use wizard main actions */
        .embedded-subform-wrapper button[onClick*="onClose"],
        .embedded-subform-wrapper button[onClick*="handleClose"] {
          display: none !important;
        }
      `}</style>
    </LargeModalPortal>
  );
}

export default SuperAdminCreateOrderForm;
