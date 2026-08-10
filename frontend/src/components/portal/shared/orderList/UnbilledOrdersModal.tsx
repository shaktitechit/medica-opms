"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  PauseCircle,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import AdminCreateOrderPage, {
  type StaffCreateOrderLinePrefill,
  type StaffCreateOrderPortalHome,
} from "@/components/portal/admin/AdminCreateOrderPage";
import { downloadOrderItemsPdf } from "@/components/portal/shared/downloadOrderItemsPdf";
import { ModalOverlay } from "@/components/portal/shared/ModalOverlay";
import {
  lineApprovalQuantities,
  resolveAccountApprovalStatus,
} from "@/components/portal/shared/orderLineQuantities";
import {
  isUnbilledModalRecord,
  listUnbilledLinesFromRecord,
  unbilledRecordOrderId,
  unbilledRecordOrderNo,
  unbilledRecordPartyId,
  unbilledRecordPartyLabel,
  unbilledRecordSalesUserId,
  unbilledRecordStatusLabel,
  type UnbilledOrderLine,
} from "@/components/portal/shared/orderList/unbilledOrders";
import {
  getOrderWorkflowTabCategory,
  ORDER_WORKFLOW_TAB_LABELS,
  type OrderWorkflowCategoryOptions,
  type OrderWorkflowTabCategory,
} from "@/components/portal/shared/orderList/orderWorkflowTabs";
import UnbilledOrdersPdfTemplate, {
  type UnbilledOrdersPdfListLine,
  type UnbilledOrdersPdfUnbilledLine,
} from "@/components/portal/shared/UnbilledOrdersPdfTemplate";
import {
  companyLetterheadLogoUrl,
  companyLetterheadName,
  resolvePublicAssetUrl,
} from "@/lib/env";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import { useAppSelector } from "@/store/hooks";
import { AddUnbilledOrderModal } from "@/components/portal/shared/orderList/AddUnbilledOrderModal";
import {
  useListUnbilledOrdersQuery,
  usePatchUnbilledOrderMutation,
  type UnbilledOrderRecord,
} from "@/store/api";

type ModalMainTab = "unbilled" | "process_pending" | "on_hold";

/** List-tab buckets shown under Process Pending (from orders list, not UnbilledOrder). */
const PROCESS_PENDING_CATEGORIES = new Set<OrderWorkflowTabCategory>([
  "pending_admin_approval",
  "due_sheet_pending",
  "pending_finance_approval",
  "pending_account_approval",
  "open_dispatched",
]);

type ListOrderLine = {
  orderItemId: string;
  productName: string;
  sku: string;
  ordered: number;
  pending: number;
};

type ListOrderView = {
  orderId: string;
  orderNo: string;
  party: string;
  refOrderDate: string;
  statusLabel: string;
  href: string;
  ordered: number;
  pending: number;
  lines: ListOrderLine[];
};

function listOrderProductLabel(line: Record<string, unknown>): {
  name: string;
  sku: string;
} {
  const product = line.product;
  if (product && typeof product === "object") {
    const p = product as Record<string, unknown>;
    return {
      name: String(p.product_name ?? p.name ?? line.product_name ?? "Item"),
      sku: String(p.sku ?? line.sku ?? ""),
    };
  }
  return {
    name: String(line.product_name ?? line.name ?? "Item"),
    sku: String(line.sku ?? ""),
  };
}

/** Stage-aware pending qty for Process Pending / On Hold nested lines. */
function pendingQtyForCategory(
  cat: OrderWorkflowTabCategory,
  q: ReturnType<typeof lineApprovalQuantities>,
): number {
  switch (cat) {
    case "on_hold":
      return q.ordered;
    case "pending_admin_approval":
      return q.pendingAdmin;
    case "due_sheet_pending":
      return q.salesApproved > 0 ? q.salesApproved : q.ordered;
    case "pending_finance_approval":
      return q.pendingFinance > 0 ? q.pendingFinance : q.salesApproved;
    case "pending_account_approval":
      return q.pendingAccount > 0 ? q.pendingAccount : q.financeApproved;
    case "open_dispatched":
      return q.pendingDispatch;
    default:
      return Math.max(0, q.ordered - q.dispatched);
  }
}

function listOrderLinesFromRow(
  row: Record<string, unknown>,
  cat: OrderWorkflowTabCategory,
): ListOrderLine[] {
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const accountStatus = resolveAccountApprovalStatus(row);
  const lines: ListOrderLine[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as Record<string, unknown>;
    const orderItemId = orderRefId(line._id ?? line.id);
    const q = lineApprovalQuantities(line, {
      accountApprovalStatus: accountStatus,
    });
    if (q.ordered <= 0 && q.pendingAdmin <= 0 && q.pendingDispatch <= 0) {
      continue;
    }
    const { name, sku } = listOrderProductLabel(line);
    lines.push({
      orderItemId: orderItemId || `${name}-${lines.length}`,
      productName: name,
      sku,
      ordered: q.ordered,
      pending: pendingQtyForCategory(cat, q),
    });
  }
  return lines;
}

export type UnbilledOrdersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  partyNameById: Map<string, string>;
  /** Portal prefix for order detail links, e.g. "/account" */
  portalBasePath: string;
  /**
   * Live list orders (enriched). Used so status labels match ListOrdersPage tabs.
   */
  orders?: unknown[];
  /** Same transport/dispatch category options as ListOrdersPage. */
  categoryOptions?: OrderWorkflowCategoryOptions;
  /** @deprecated Totals are no longer shown. */
  hidePricing?: boolean;
};

function orderRefId(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o._id ?? o.id ?? "");
  }
  return String(value);
}

type UnbilledOrderView = {
  unbilledId: string;
  orderId: string;
  orderNo: string;
  partyId: string;
  party: string;
  salesUserId: string;
  approved: number;
  submittedDispatch: number;
  remaining: number;
  refOrderDate: string;
  href: string;
  lines: UnbilledOrderLine[];
  statusLabel: string;
  canCreateOrder: boolean;
  rawRecord: UnbilledOrderRecord;
};

type ResolveTarget = {
  unbilledId: string;
  orderNo: string;
  remaining: number;
};

type CreateOrderEligibleFilter = "all" | "yes" | "no";

const SELECT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-cyan-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";

const INPUT_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";

type CreateOrderTarget = {
  unbilledId: string;
  orderNo: string;
  partyId: string;
  salesUserId: string;
  linePrefills: StaffCreateOrderLinePrefill[];
};

function resolveCreateOrderPortal(
  portalBasePath: string,
): StaffCreateOrderPortalHome {
  if (
    portalBasePath === "/account" ||
    portalBasePath === "/finance" ||
    portalBasePath === "/super_admin"
  ) {
    return portalBasePath;
  }
  return "/admin";
}

function portalLabelFromPath(portalBasePath: string): string {
  const key = portalBasePath.replace(/^\//, "").toLowerCase();
  switch (key) {
    case "admin":
      return "Admin Portal";
    case "account":
      return "Account Portal";
    case "finance":
      return "Finance Portal";
    case "dispatch":
      return "Dispatch Portal";
    case "sales":
      return "Sales Portal";
    case "super_admin":
      return "Super Admin Portal";
    default:
      return key
        ? `${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Portal`
        : "Portal";
  }
}

function formatDateTime(v: unknown = new Date()): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateShort(v: unknown): string {
  if (v == null || v === "") return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Un Billed Orders modal — sourced from `/api/unbilled-orders`.
 */
export function UnbilledOrdersModal({
  isOpen,
  onClose,
  partyNameById,
  portalBasePath,
  orders,
  categoryOptions,
}: UnbilledOrdersModalProps) {
  const [mainTab, setMainTab] = useState<ModalMainTab>("unbilled");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterParty, setFilterParty] = useState("all");
  const [filterCreateOrder, setFilterCreateOrder] =
    useState<CreateOrderEligibleFilter>("all");
  const [filterMinRemaining, setFilterMinRemaining] = useState("");
  const [filterMaxRemaining, setFilterMaxRemaining] = useState("");
  const [createTarget, setCreateTarget] = useState<CreateOrderTarget | null>(
    null,
  );
  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfGeneratedAt, setPdfGeneratedAt] = useState(() =>
    formatDateTime(new Date()),
  );
  const pdfTemplateRef = useRef<HTMLDivElement>(null);

  const authUser = useAppSelector((s) => s.auth.user);
  const downloadedBy = useMemo(() => {
    if (!authUser || typeof authUser !== "object") return "—";
    const u = authUser as Record<string, unknown>;
    return (
      String(u.name ?? u.full_name ?? u.username ?? u.email ?? "").trim() || "—"
    );
  }, [authUser]);
  const portalLabel = portalLabelFromPath(portalBasePath);
  const companyName = companyLetterheadName();
  const logoUrl = resolvePublicAssetUrl(companyLetterheadLogoUrl());

  const unbilledQ = useListUnbilledOrdersQuery(
    { status: "open" },
    { skip: !isOpen },
  );
  const [patchUnbilledOrder] = usePatchUnbilledOrderMutation();
  const createOrderPortal = resolveCreateOrderPortal(portalBasePath);
  const isUnbilledTab = mainTab === "unbilled";
  const isProcessPendingTab = mainTab === "process_pending";
  const isOnHoldTab = mainTab === "on_hold";
  const isListOrdersTab = isProcessPendingTab || isOnHoldTab;

  const handleClearFilters = useCallback(() => {
    setFilterStatus("all");
    setFilterParty("all");
    setFilterCreateOrder("all");
    setFilterMinRemaining("");
    setFilterMaxRemaining("");
  }, []);

  const [isAddUnbilledOpen, setIsAddUnbilledOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<UnbilledOrderRecord | null>(null);

  const openEditModal = useCallback((record: UnbilledOrderRecord) => {
    setEditRecord(record);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditRecord(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMainTab("unbilled");
      setCreateTarget(null);
      setResolveTarget(null);
      setIsResolving(false);
      setIsDownloadingPdf(false);
      setPdfGeneratedAt(formatDateTime(new Date()));
      setIsFilterPanelOpen(false);
      setSearchQuery("");
      setIsAddUnbilledOpen(false);
      setEditRecord(null);
      handleClearFilters();
    }
  }, [isOpen, handleClearFilters]);

  useEffect(() => {
    // Keep filters scoped per tab.
    setFilterStatus("all");
    setFilterParty("all");
    setFilterCreateOrder("all");
    setFilterMinRemaining("");
    setFilterMaxRemaining("");
    setSearchQuery("");
    setIsFilterPanelOpen(false);
  }, [mainTab]);

  const records = useMemo(
    () => (Array.isArray(unbilledQ.data) ? unbilledQ.data : []),
    [unbilledQ.data],
  );

  const existingUnbilledOrderIds = useMemo(() => {
    return new Set(
      records.map((r) => unbilledRecordOrderId(r)).filter(Boolean),
    );
  }, [records]);

  /** Live list orders by id — same enrichment ListOrdersPage tabs use. */
  const listOrderById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const raw of Array.isArray(orders) ? orders : []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = orderRefId(row._id ?? row.id);
      if (id) map.set(id, row);
    }
    return map;
  }, [orders]);

  const orderViews = useMemo((): UnbilledOrderView[] => {
    const views: UnbilledOrderView[] = [];
    for (const record of records) {
      const orderId = unbilledRecordOrderId(record);
      const liveOrder = orderId ? listOrderById.get(orderId) : undefined;
      // Drop in transit / closed-delivered (and other non-pipeline) even if API
      // still has an open tracking row until the next sync resolves it.
      if (
        !isUnbilledModalRecord(record, {
          order: liveOrder ?? null,
          categoryOptions,
        })
      ) {
        continue;
      }

      const orderNo = unbilledRecordOrderNo(record);
      const lines = listUnbilledLinesFromRecord(record);
      const approved = Number(record.approved_quantity ?? 0);
      const submittedDispatch = Number(record.billed_dispatched_quantity ?? 0);
      const remaining = Number(
        record.remaining_quantity ?? Math.max(0, approved - submittedDispatch),
      );
      const statusLabel = unbilledRecordStatusLabel(record, {
        order: liveOrder ?? null,
        categoryOptions,
      });
      const stage = String(record.pipeline_stage || "").toLowerCase();
      const canCreateOrder =
        stage === "unbilled" ||
        stage === "partially_billed" ||
        statusLabel === "Unbilled" ||
        statusLabel === "Partially Billed";

      const orderRef =
        liveOrder ||
        (record.order && typeof record.order === "object"
          ? (record.order as Record<string, unknown>)
          : null);
      const refOrderDate = formatDateShort(
        orderRef?.order_date ?? orderRef?.created_at ?? orderRef?.createdAt,
      );

      views.push({
        unbilledId: String(record._id ?? record.id ?? ""),
        orderId,
        orderNo,
        partyId: unbilledRecordPartyId(record),
        party: unbilledRecordPartyLabel(record, partyNameById),
        salesUserId: unbilledRecordSalesUserId(record),
        approved,
        submittedDispatch,
        remaining,
        refOrderDate,
        href: orderId ? `${portalBasePath}/order/${orderId}` : portalBasePath,
        lines,
        statusLabel,
        canCreateOrder,
        rawRecord: record,
      });
    }
    return views;
  }, [records, listOrderById, categoryOptions, partyNameById, portalBasePath]);

  const buildListOrderView = useCallback(
    (
      row: Record<string, unknown>,
      cat: OrderWorkflowTabCategory,
    ): ListOrderView => {
      const orderId = orderRefId(row._id ?? row.id);
      const orderNo =
        String(row.order_no ?? row.order_number ?? "").trim() ||
        orderId ||
        "—";
      const partyId = orderRefId(row.party) || orderRefId(row.customer);
      const partyFromObj =
        row.party && typeof row.party === "object"
          ? String(
              (row.party as Record<string, unknown>).party_name ??
                (row.party as Record<string, unknown>).name ??
                "",
            ).trim()
          : "";
      const party =
        partyFromObj ||
        (partyId && partyNameById.has(partyId)
          ? partyNameById.get(partyId) || "—"
          : "—");
      const lines = listOrderLinesFromRow(row, cat);
      const ordered = lines.reduce((sum, line) => sum + line.ordered, 0);
      const pending = lines.reduce((sum, line) => sum + line.pending, 0);

      return {
        orderId,
        orderNo,
        party,
        refOrderDate: formatDateShort(
          row.order_date ?? row.created_at ?? row.createdAt,
        ),
        statusLabel: ORDER_WORKFLOW_TAB_LABELS[cat] ?? cat,
        href: orderId ? `${portalBasePath}/order/${orderId}` : portalBasePath,
        ordered,
        pending,
        lines,
      };
    },
    [partyNameById, portalBasePath],
  );

  /** Process Pending — from live list orders only (does not touch UnbilledOrder). */
  const processPendingViews = useMemo((): ListOrderView[] => {
    const views: ListOrderView[] = [];
    for (const raw of Array.isArray(orders) ? orders : []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const cat = getOrderWorkflowTabCategory(row, categoryOptions);
      if (!cat || !PROCESS_PENDING_CATEGORIES.has(cat)) continue;
      views.push(buildListOrderView(row, cat));
    }
    views.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    return views;
  }, [orders, categoryOptions, buildListOrderView]);

  /** On Hold — from live list orders only (does not touch UnbilledOrder). */
  const onHoldViews = useMemo((): ListOrderView[] => {
    const views: ListOrderView[] = [];
    for (const raw of Array.isArray(orders) ? orders : []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const cat = getOrderWorkflowTabCategory(row, categoryOptions);
      if (cat !== "on_hold") continue;
      views.push(buildListOrderView(row, cat));
    }
    views.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
    return views;
  }, [orders, categoryOptions, buildListOrderView]);

  const listTabViews = isOnHoldTab ? onHoldViews : processPendingViews;

  const uniqueStatuses = useMemo(() => {
    const labels = new Set<string>();
    const source = isUnbilledTab ? orderViews : listTabViews;
    for (const view of source) {
      if (view.statusLabel) labels.add(view.statusLabel);
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [isUnbilledTab, orderViews, listTabViews]);

  const uniqueParties = useMemo(() => {
    const parties = new Set<string>();
    const source = isUnbilledTab ? orderViews : listTabViews;
    for (const view of source) {
      const name = view.party.trim();
      if (name && name !== "—") parties.add(name);
    }
    return Array.from(parties).sort((a, b) => a.localeCompare(b));
  }, [isUnbilledTab, orderViews, listTabViews]);

  const hasActiveFilters =
    filterStatus !== "all" ||
    filterParty !== "all" ||
    (isUnbilledTab &&
      (filterCreateOrder !== "all" ||
        filterMinRemaining.trim() !== "" ||
        filterMaxRemaining.trim() !== ""));

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const minRem = filterMinRemaining.trim()
      ? Number(filterMinRemaining)
      : null;
    const maxRem = filterMaxRemaining.trim()
      ? Number(filterMaxRemaining)
      : null;

    return orderViews.filter((view) => {
      if (filterStatus !== "all" && view.statusLabel !== filterStatus) {
        return false;
      }
      if (filterParty !== "all" && view.party !== filterParty) {
        return false;
      }
      if (filterCreateOrder === "yes" && !view.canCreateOrder) return false;
      if (filterCreateOrder === "no" && view.canCreateOrder) return false;

      if (minRem != null && Number.isFinite(minRem) && view.remaining < minRem) {
        return false;
      }
      if (maxRem != null && Number.isFinite(maxRem) && view.remaining > maxRem) {
        return false;
      }

      if (!q) return true;
      if (
        view.orderNo.toLowerCase().includes(q) ||
        view.party.toLowerCase().includes(q) ||
        view.statusLabel.toLowerCase().includes(q)
      ) {
        return true;
      }
      return view.lines.some(
        (line) =>
          line.productName.toLowerCase().includes(q) ||
          line.sku.toLowerCase().includes(q),
      );
    });
  }, [
    orderViews,
    searchQuery,
    filterStatus,
    filterParty,
    filterCreateOrder,
    filterMinRemaining,
    filterMaxRemaining,
  ]);

  const filteredListTabViews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return listTabViews.filter((view) => {
      if (filterStatus !== "all" && view.statusLabel !== filterStatus) {
        return false;
      }
      if (filterParty !== "all" && view.party !== filterParty) {
        return false;
      }
      if (!q) return true;
      if (
        view.orderNo.toLowerCase().includes(q) ||
        view.party.toLowerCase().includes(q) ||
        view.statusLabel.toLowerCase().includes(q)
      ) {
        return true;
      }
      return view.lines.some(
        (line) =>
          line.productName.toLowerCase().includes(q) ||
          line.sku.toLowerCase().includes(q),
      );
    });
  }, [listTabViews, searchQuery, filterStatus, filterParty]);

  const handleRefresh = useCallback(() => {
    if (isUnbilledTab) void unbilledQ.refetch();
  }, [isUnbilledTab, unbilledQ]);

  const openCreateOrder = useCallback((view: UnbilledOrderView) => {
    if (!view.unbilledId) {
      toast.error("Missing unbilled tracking id for this order.");
      return;
    }
    setCreateTarget({
      unbilledId: view.unbilledId,
      orderNo: view.orderNo,
      partyId: view.partyId,
      salesUserId: view.salesUserId,
      linePrefills: view.lines
        .filter((line) => line.productId && line.remaining > 0)
        .map((line) => ({
          productId: line.productId,
          quantity: line.remaining,
          product_name: line.productName,
          sku: line.sku,
        })),
    });
  }, []);

  const openResolveConfirm = useCallback((view: UnbilledOrderView) => {
    if (!view.unbilledId) {
      toast.error("Missing unbilled tracking id for this order.");
      return;
    }
    setResolveTarget({
      unbilledId: view.unbilledId,
      orderNo: view.orderNo,
      remaining: view.remaining,
    });
  }, []);

  const handleConfirmResolve = useCallback(async () => {
    if (!resolveTarget?.unbilledId) return;
    setIsResolving(true);
    try {
      await patchUnbilledOrder({
        id: resolveTarget.unbilledId,
        patch: {
          status: "resolved",
          manual_resolved: true,
          remarks: `Manually resolved from Un Billed Orders (${resolveTarget.orderNo})`,
        },
      }).unwrap();
      toast.success(`Unbilled order ${resolveTarget.orderNo} resolved.`);
      setResolveTarget(null);
      void unbilledQ.refetch();
    } catch (rejected) {
      toast.error(
        mutationRejectedMessage(rejected) ||
          "Failed to resolve this unbilled order.",
      );
    } finally {
      setIsResolving(false);
    }
  }, [resolveTarget, patchUnbilledOrder, unbilledQ]);

  const availableOrdersForUnbilled = useMemo(() => {
    const list: { id: string; orderNo: string; party: string }[] = [];
    const existingOrderIds = new Set(
      records.map((r) => unbilledRecordOrderId(r)).filter(Boolean),
    );
    for (const raw of Array.isArray(orders) ? orders : []) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const id = orderRefId(row._id ?? row.id);
      if (!id || existingOrderIds.has(id)) continue;
      const status = String(row.status ?? "").toLowerCase();
      if (
        status === "cancelled" ||
        status === "draft" ||
        status === "on_hold"
      ) {
        continue;
      }
      const orderNo =
        String(row.order_no ?? row.order_number ?? "").trim() || id;
      const partyObj =
        row.party && typeof row.party === "object"
          ? String(
              (row.party as Record<string, unknown>).party_name ??
                (row.party as Record<string, unknown>).name ??
                "",
            ).trim()
          : "";
      const partyId = orderRefId(row.party);
      const party =
        partyObj || (partyId && partyNameById.get(partyId)) || "—";
      list.push({ id, orderNo, party });
    }
    return list.sort((a, b) => a.orderNo.localeCompare(b.orderNo));
  }, [orders, records, partyNameById]);



  const handleCreated = useCallback(
    async (info: { orderId: string; orderNo: string }) => {
      const source = createTarget;
      setCreateTarget(null);

      if (source?.unbilledId && info.orderId) {
        try {
          await patchUnbilledOrder({
            id: source.unbilledId,
            patch: {
              status: "resolved",
              replacement_order: info.orderId,
              remarks: `Resolved by creating replacement order ${
                info.orderNo || info.orderId
              } from unbilled ${source.orderNo}`,
            },
          }).unwrap();
          toast.success(
            `Unbilled order ${source.orderNo} resolved against new order ${
              info.orderNo || info.orderId
            }`,
          );
        } catch (rejected) {
          toast.error(
            mutationRejectedMessage(rejected) ||
              "New order created, but failed to resolve the unbilled tracking row.",
          );
        }
      }

      void unbilledQ.refetch();
    },
    [createTarget, patchUnbilledOrder, unbilledQ],
  );

  const pdfUnbilledLines = useMemo((): UnbilledOrdersPdfUnbilledLine[] => {
    const lines: UnbilledOrdersPdfUnbilledLine[] = [];
    for (const view of orderViews) {
      if (view.lines.length === 0) {
        lines.push({
          orderNo: view.orderNo,
          party: view.party,
          statusLabel: view.statusLabel,
          refOrderDate: view.refOrderDate,
          productName: "—",
          approved: view.approved,
          submittedDispatch: view.submittedDispatch,
          remaining: view.remaining,
        });
        continue;
      }
      for (const line of view.lines) {
        lines.push({
          orderNo: view.orderNo,
          party: view.party,
          statusLabel: view.statusLabel,
          refOrderDate: view.refOrderDate,
          productName: line.productName,
          sku: line.sku || undefined,
          approved: line.approved,
          submittedDispatch: line.submittedDispatch,
          remaining: line.remaining,
        });
      }
    }
    return lines;
  }, [orderViews]);

  const pdfProcessPendingLines = useMemo((): UnbilledOrdersPdfListLine[] => {
    const lines: UnbilledOrdersPdfListLine[] = [];
    for (const view of processPendingViews) {
      if (view.lines.length === 0) {
        lines.push({
          orderNo: view.orderNo,
          party: view.party,
          statusLabel: view.statusLabel,
          refOrderDate: view.refOrderDate,
          productName: "—",
          ordered: view.ordered,
          pending: view.pending,
        });
        continue;
      }
      for (const line of view.lines) {
        lines.push({
          orderNo: view.orderNo,
          party: view.party,
          statusLabel: view.statusLabel,
          refOrderDate: view.refOrderDate,
          productName: line.productName,
          sku: line.sku || undefined,
          ordered: line.ordered,
          pending: line.pending,
        });
      }
    }
    return lines;
  }, [processPendingViews]);

  const pdfOnHoldLines = useMemo((): UnbilledOrdersPdfListLine[] => {
    const lines: UnbilledOrdersPdfListLine[] = [];
    for (const view of onHoldViews) {
      if (view.lines.length === 0) {
        lines.push({
          orderNo: view.orderNo,
          party: view.party,
          statusLabel: view.statusLabel,
          refOrderDate: view.refOrderDate,
          productName: "—",
          ordered: view.ordered,
          pending: view.pending,
        });
        continue;
      }
      for (const line of view.lines) {
        lines.push({
          orderNo: view.orderNo,
          party: view.party,
          statusLabel: view.statusLabel,
          refOrderDate: view.refOrderDate,
          productName: line.productName,
          sku: line.sku || undefined,
          ordered: line.ordered,
          pending: line.pending,
        });
      }
    }
    return lines;
  }, [onHoldViews]);

  const totalPdfOrders =
    orderViews.length + processPendingViews.length + onHoldViews.length;

  const handleDownloadPdf = useCallback(async () => {
    if (totalPdfOrders === 0) return;
    const stamp = formatDateTime(new Date());
    setPdfGeneratedAt(stamp);
    setIsDownloadingPdf(true);
    try {
      // Wait for letterhead template to commit the fresh timestamp.
      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 80);
      });
      if (!pdfTemplateRef.current) {
        throw new Error("PDF template is not ready.");
      }
      const dateStamp = new Date().toISOString().slice(0, 10);
      await downloadOrderItemsPdf(
        pdfTemplateRef.current,
        `unbilled_process_on_hold_orders_${dateStamp}.pdf`,
      );
      toast.success("Orders PDF downloaded.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate PDF.";
      toast.error(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [totalPdfOrders]);

  if (!isOpen) return null;

  const busy = isUnbilledTab
    ? unbilledQ.isLoading || unbilledQ.isFetching
    : false;
  const isError = isUnbilledTab ? unbilledQ.isError : false;
  const activeCount = isUnbilledTab
    ? filtered.length
    : filteredListTabViews.length;
  const unbilledBusy = unbilledQ.isLoading || unbilledQ.isFetching;
  const canDownload =
    !unbilledBusy && !isDownloadingPdf && totalPdfOrders > 0;
  const lineCount = filtered.reduce((sum, view) => sum + view.lines.length, 0);
  const listTabLineCount = filteredListTabViews.reduce(
    (sum, view) => sum + view.lines.length,
    0,
  );

  const tabTitle = isUnbilledTab
    ? "Un Billed Orders"
    : isOnHoldTab
      ? "On Hold Orders"
      : "Process Pending Orders";
  const tabSubtitle = isUnbilledTab
    ? "Unbilled / partially billed — approved qty greater than dispatched qty"
    : isOnHoldTab
      ? "Orders currently on hold — from the orders list"
      : "Admin, due sheet, finance, account, and dispatch pending — from the orders list";
  const TabIcon = isUnbilledTab
    ? Receipt
    : isOnHoldTab
      ? PauseCircle
      : ClipboardList;

  return (
    <ModalOverlay
      onClick={onClose}
      className="fixed inset-0 z-[100] flex bg-slate-900/50 backdrop-blur-[1px]"
    >
      <div
        aria-hidden
        className="pointer-events-none fixed -left-[9999px] top-0 overflow-hidden"
      >
        <div ref={pdfTemplateRef}>
          <UnbilledOrdersPdfTemplate
            companyName={companyName}
            logoUrl={logoUrl}
            portalLabel={portalLabel}
            downloadedBy={downloadedBy}
            generatedAt={pdfGeneratedAt}
            unbilledLines={pdfUnbilledLines}
            processPendingLines={pdfProcessPendingLines}
            onHoldLines={pdfOnHoldLines}
          />
        </div>
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unbilled-orders-title"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400">
                <TabIcon className="h-4 w-4" />
              </span>
              <div>
                <h2
                  id="unbilled-orders-title"
                  className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50"
                >
                  {tabTitle}
                </h2>
                <p className="mt-0.5 text-2xs text-slate-500 dark:text-slate-400">
                  {tabSubtitle}
                  {!busy && activeCount > 0
                    ? isUnbilledTab
                      ? ` · ${filtered.length} order${filtered.length === 1 ? "" : "s"} · ${lineCount} item${lineCount === 1 ? "" : "s"}`
                      : ` · ${filteredListTabViews.length} order${filteredListTabViews.length === 1 ? "" : "s"} · ${listTabLineCount} item${listTabLineCount === 1 ? "" : "s"}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isUnbilledTab ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsAddUnbilledOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-600 bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-cyan-700 dark:border-cyan-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                  title="Add an unbilled order manually by selecting an order"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Unbilled Order
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-white/5"
                  title="Reload unbilled list"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={!canDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-700 shadow-sm transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
              title={
                canDownload
                  ? "Download unbilled, process pending, and on hold orders as PDF"
                  : unbilledBusy
                    ? "Loading orders…"
                    : "Nothing to download"
              }
            >
              <Download className={`h-3.5 w-3.5 ${isDownloadingPdf ? "animate-pulse" : ""}`} />
              {isDownloadingPdf ? "Generating…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-5 dark:border-white/5">
          <div className="flex gap-1" role="tablist" aria-label="Orders modal tabs">
            {(
              [
                {
                  id: "unbilled" as const,
                  label: "Un Billed",
                  count: orderViews.length,
                },
                {
                  id: "process_pending" as const,
                  label: "Process Pending",
                  count: processPendingViews.length,
                },
                {
                  id: "on_hold" as const,
                  label: "On Hold",
                  count: onHoldViews.length,
                },
              ] as const
            ).map((tab) => {
              const selected = mainTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setMainTab(tab.id)}
                  className={`relative px-3 py-2.5 text-xs font-semibold transition ${
                    selected
                      ? "text-cyan-700 dark:text-cyan-400"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 tabular-nums text-2xs font-medium opacity-70">
                    {tab.count}
                  </span>
                  {selected ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-600 dark:bg-cyan-400" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative z-20 shrink-0 border-b border-slate-100 px-5 py-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by order no, party, status, or product…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-800 outline-none ring-cyan-500/30 placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:ring-2 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsFilterPanelOpen((prev) => !prev)}
              className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                isFilterPanelOpen || hasActiveFilters
                  ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-white/5"
              }`}
              aria-expanded={isFilterPanelOpen}
              aria-controls="unbilled-filter-panel"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {hasActiveFilters ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-500 dark:border-slate-900" />
              ) : null}
            </button>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="shrink-0 px-1 py-2 text-xs font-semibold text-rose-500 transition hover:text-rose-600"
                title="Clear all filters"
              >
                Clear
              </button>
            ) : null}
          </div>

          {isFilterPanelOpen ? (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsFilterPanelOpen(false)}
                aria-hidden
              />
              <div
                id="unbilled-filter-panel"
                className="absolute right-5 top-full z-50 mt-2 w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xl dark:border-white/10 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-white/5">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {isUnbilledTab
                      ? "Unbilled Filters"
                      : isOnHoldTab
                        ? "On Hold Filters"
                        : "Process Pending Filters"}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    disabled={!hasActiveFilters}
                    className="text-2xs font-semibold text-slate-400 transition hover:text-cyan-600 disabled:opacity-40 dark:hover:text-cyan-400"
                  >
                    Reset All
                  </button>
                </div>

                <div className="space-y-3.5 select-none">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-500 dark:text-slate-400">
                      Status
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      <option value="all">All statuses</option>
                      {uniqueStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block font-semibold text-slate-500 dark:text-slate-400">
                      Party
                    </label>
                    <select
                      value={filterParty}
                      onChange={(e) => setFilterParty(e.target.value)}
                      className={SELECT_CLASS}
                    >
                      <option value="all">All parties</option>
                      {uniqueParties.map((party) => (
                        <option key={party} value={party}>
                          {party}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isUnbilledTab ? (
                    <>
                      <div>
                        <label className="mb-1 block font-semibold text-slate-500 dark:text-slate-400">
                          Create Order
                        </label>
                        <select
                          value={filterCreateOrder}
                          onChange={(e) =>
                            setFilterCreateOrder(
                              e.target.value as CreateOrderEligibleFilter,
                            )
                          }
                          className={SELECT_CLASS}
                        >
                          <option value="all">All orders</option>
                          <option value="yes">Eligible only</option>
                          <option value="no">Not eligible</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block font-semibold text-slate-500 dark:text-slate-400">
                          Unbilled qty range
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={filterMinRemaining}
                            onChange={(e) => setFilterMinRemaining(e.target.value)}
                            placeholder="Min"
                            className={INPUT_CLASS}
                          />
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={filterMaxRemaining}
                            onChange={(e) => setFilterMaxRemaining(e.target.value)}
                            placeholder="Max"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
                  <span className="text-2xs text-slate-500 dark:text-slate-400">
                    Showing {activeCount} of{" "}
                    {isUnbilledTab ? orderViews.length : listTabViews.length}{" "}
                    orders
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFilterPanelOpen(false)}
                    className="rounded-lg bg-cyan-600 px-3 py-1.5 text-2xs font-semibold text-white transition hover:bg-cyan-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {isListOrdersTab ? (
            filteredListTabViews.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {isOnHoldTab
                    ? "No on hold orders"
                    : "No process pending orders"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {listTabViews.length === 0
                    ? isOnHoldTab
                      ? "No orders are currently on hold."
                      : "No orders are in admin, due sheet, finance, account, or dispatch pending."
                    : hasActiveFilters || searchQuery.trim()
                      ? "No orders match your search and filters."
                      : "No orders match your search."}
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                  <tr className="border-b border-slate-100 dark:border-white/5">
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                      Order / Item
                    </th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                      Ref Order Date
                    </th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                      Party
                    </th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                      Ordered
                    </th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                      Pending
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-slate-500">
                      View
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListTabViews.map((view) => (
                    <Fragment key={view.orderId || view.orderNo}>
                      <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                          {view.orderNo}
                          <span className="ml-2 font-sans text-2xs font-medium text-slate-500">
                            {view.lines.length} item
                            {view.lines.length === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {view.refOrderDate}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                          {view.party}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ring-1 ring-inset ${
                              isOnHoldTab
                                ? "bg-rose-50 text-rose-700 ring-rose-600/10 dark:bg-rose-950/30 dark:text-rose-400"
                                : "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400"
                            }`}
                          >
                            {view.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          {view.ordered}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                          {view.pending}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {view.orderId ? (
                            <Link
                              href={view.href}
                              onClick={onClose}
                              className="inline-flex items-center gap-1 rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-2xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                      {view.lines.map((line) => (
                        <tr
                          key={`${view.orderId}-${line.orderItemId}`}
                          className="border-t border-slate-100 bg-white dark:border-white/5 dark:bg-slate-900"
                        >
                          <td className="px-4 py-2 pl-8 text-slate-700 dark:text-slate-300">
                            <div className="font-medium">{line.productName}</div>
                            {line.sku ? (
                              <div className="text-2xs text-slate-400">
                                SKU {line.sku}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 text-slate-400">—</td>
                          <td className="px-4 py-2 text-slate-400">—</td>
                          <td className="px-4 py-2 text-slate-400">—</td>
                          <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                            {line.ordered}
                          </td>
                          <td className="px-4 py-2 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                            {line.pending}
                          </td>
                          <td className="px-4 py-2" />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )
          ) : isError ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Failed to load un billed orders
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Could not fetch UnbilledOrder tracking. Try Refresh again.
              </p>
            </div>
          ) : busy && records.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Loading un billed orders…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                No un billed orders
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {records.length === 0
                  ? "No unbilled or partially billed orders (approved qty greater than dispatched qty)."
                  : hasActiveFilters || searchQuery.trim()
                    ? "No orders match your search and filters."
                    : "No orders match your search."}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Order / Item
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Ref Order Date
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Party
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    Unbilled
                  </th>
                  <th className="px-4 py-2.5 font-semibold uppercase tracking-wider text-slate-500">
                    View Ref Order
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold uppercase tracking-wider text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((view) => (
                  <Fragment key={view.orderId || view.orderNo}>
                    <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-800 dark:text-slate-100">
                        {view.orderNo}
                        <span className="ml-2 font-sans text-2xs font-medium text-slate-500">
                          {view.lines.length} item{view.lines.length === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {view.refOrderDate}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                        {view.party}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wider ring-1 ring-inset ${
                            view.statusLabel.includes("Pending")
                              ? "bg-amber-50 text-amber-700 ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-400"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400"
                          }`}
                        >
                          {view.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                        {view.remaining}
                      </td>
                      <td className="px-4 py-2.5">
                        {view.orderId ? (
                          <Link
                            href={view.href}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-2xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-700/50 dark:bg-cyan-950/40 dark:text-cyan-400 dark:hover:bg-cyan-900/30"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(view.rawRecord)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-2xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
                            title="Edit unbilled order items, quantities or remarks"
                          >
                            <Pencil className="h-3 w-3 text-slate-500" />
                            Edit
                          </button>
                          {view.canCreateOrder ? (
                            <button
                              type="button"
                              onClick={() => openCreateOrder(view)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-2xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-700/50 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/30"
                              title="Create a new order for this unbilled party"
                            >
                              <Plus className="h-3 w-3" />
                              Create Order
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openResolveConfirm(view)}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-2xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/30"
                            title="Resolve this unbilled tracking row"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Resolve
                          </button>
                        </div>
                      </td>
                    </tr>
                    {view.lines.map((line) => (
                      <tr
                        key={`${view.orderId}-${line.orderItemId}`}
                        className="border-t border-slate-100 bg-white dark:border-white/5 dark:bg-slate-900"
                      >
                        <td className="px-4 py-2 pl-8 text-slate-700 dark:text-slate-300">
                          <div className="font-medium">{line.productName}</div>
                          {line.sku ? (
                            <div className="text-2xs text-slate-400">SKU {line.sku}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2 tabular-nums font-semibold text-cyan-700 dark:text-cyan-400">
                          {line.remaining}
                        </td>
                        <td className="px-4 py-2 text-slate-400">—</td>
                        <td className="px-4 py-2" />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {resolveTarget ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[1px]"
          role="presentation"
          onClick={() => {
            if (!isResolving) setResolveTarget(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="resolve-unbilled-title"
            aria-describedby="resolve-unbilled-desc"
            className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-5 shadow-xl dark:border-amber-800/60 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3
                  id="resolve-unbilled-title"
                  className="text-sm font-bold text-slate-900 dark:text-slate-50"
                >
                  Resolve unbilled order?
                </h3>
                <p
                  id="resolve-unbilled-desc"
                  className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300"
                >
                  This will permanently close unbilled tracking for{" "}
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {resolveTarget.orderNo}
                  </span>
                  {resolveTarget.remaining > 0
                    ? ` with ${resolveTarget.remaining} remaining unit${
                        resolveTarget.remaining === 1 ? "" : "s"
                      }.`
                    : "."}{" "}
                  It will leave the Un Billed list and will not create a
                  replacement order. This cannot be undone from here.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isResolving}
                onClick={() => setResolveTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResolving}
                onClick={() => void handleConfirmResolve()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isResolving ? "Resolving…" : "Yes, resolve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AddUnbilledOrderModal
        isOpen={isAddUnbilledOpen}
        onClose={() => setIsAddUnbilledOpen(false)}
        onSuccess={() => void unbilledQ.refetch()}
        orders={orders}
        existingUnbilledOrderIds={existingUnbilledOrderIds}
        partyNameById={partyNameById}
        mode="create"
      />

      <AddUnbilledOrderModal
        isOpen={Boolean(editRecord)}
        onClose={closeEditModal}
        onSuccess={() => void unbilledQ.refetch()}
        orders={orders}
        existingUnbilledOrderIds={existingUnbilledOrderIds}
        partyNameById={partyNameById}
        mode="edit"
        initialRecord={editRecord}
      />

      <AdminCreateOrderPage
        asModal
        isOpen={Boolean(createTarget)}
        onClose={() => setCreateTarget(null)}
        onCreated={handleCreated}
        portalHome={createOrderPortal}
        initialPartyId={createTarget?.partyId || ""}
        initialAssignedSalesUserId={createTarget?.salesUserId || ""}
        initialLinePrefills={createTarget?.linePrefills}
        modalSubtitle={
          createTarget
            ? `From unbilled order ${createTarget.orderNo} — party, sales rep, and remaining items prefilled.`
            : undefined
        }
      />
    </ModalOverlay>
  );
}

/** @deprecated Use UnbilledOrdersModal */
export const OpenOrdersModal = UnbilledOrdersModal;
export type OpenOrdersModalProps = UnbilledOrdersModalProps;
