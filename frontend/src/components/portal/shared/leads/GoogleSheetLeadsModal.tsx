"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X,
  Search,
  Download,
  SlidersHorizontal,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Phone,
  Mail,
  Building2,
  UserCheck,
  CheckCircle2,
  CalendarPlus,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  ChevronDown,
  Package,
  ShieldAlert,
} from "lucide-react";
import { LargeModalPortal } from "@/components/portal/shared/LargeModalPortal";
import {
  useListLeadsQuery,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useBulkDeleteLeadsMutation,
  useListLeadSourcesQuery,
  useListUsersQuery,
  type LeadRecord,
  type LeadStatus,
  type LeadPriority,
  type LeadProductItem,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { toast } from "@/lib/toast";
import { mutationRejectedMessage } from "@/lib/mutationMessages";
import {
  formatLeadDate,
  formatCurrencyINR,
  isFollowUpOverdue,
  isFollowUpToday,
  isLeadAdmin,
  canAssignLead,
  canDeleteLead,
  canScheduleFollowUp,
  canViewLeadPricing,
  leadEstimatedValue,
  ALLOWED_STATUS_TRANSITIONS,
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
} from "./leadUtils";
import { AssignLeadModal } from "./AssignLeadModal";
import { FollowUpModal } from "./FollowUpModal";
import { ConfirmDeleteLeadModal } from "./ConfirmDeleteLeadModal";
import { DownloadLeadsPreviewModal } from "./DownloadLeadsPreviewModal";

export type GoogleSheetLeadsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  portalHome?: string;
};

type LeadRow = {
  _id: string;
  lead_no: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  status: LeadStatus;
  priority: LeadPriority;
  source: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  total_quantity: number;
  estimated_value: number;
  products_list: LeadProductItem[];
  products_summary: string;
  city?: string;
  state?: string;
  industry?: string;
  requirement?: string;
  next_follow_up_at?: string;
  lost_reason?: string;
  lost_remarks?: string;
  notes?: string;
  createdAt?: string;
  raw: LeadRecord;
};

type SelectedCell = {
  leadId: string;
  colKey: keyof LeadRow;
} | null;

function formatProductsSummary(products?: LeadProductItem[], requirement?: string): string {
  const parts: string[] = [];
  if (Array.isArray(products) && products.length > 0) {
    const prodLines = products.map((p) => {
      const name = p.product_name || "Product";
      const qty = Number(p.quantity || 0);
      const unit = p.unit ? ` ${p.unit}` : " pcs";
      return `${name} - ${qty}${unit}`;
    });
    parts.push(prodLines.join(", "));
  }
  if (requirement && requirement.trim()) {
    parts.push(requirement.trim());
  }
  return parts.join(" • ") || "—";
}

const COLUMNS: {
  key: keyof LeadRow;
  label: string;
  headerLetter: string;
  readonly?: boolean;
  type: "text" | "number" | "select" | "date";
  options?: string[];
  widthPdf?: number;
}[] = [
  { key: "lead_no", label: "Lead No", headerLetter: "A", readonly: true, type: "text", widthPdf: 1.2 },
  { key: "name", label: "Contact Person*", headerLetter: "B", type: "text", widthPdf: 1.4 },
  { key: "company_name", label: "Company / Clinic", headerLetter: "C", type: "text", widthPdf: 1.5 },
  { key: "phone", label: "Phone", headerLetter: "D", type: "text", widthPdf: 1.2 },
  { key: "email", label: "Email", headerLetter: "E", type: "text", widthPdf: 1.5 },
  {
    key: "status",
    label: "Status*",
    headerLetter: "F",
    type: "select",
    options: [
      "new",
      "follow_up",
      "quotation",
      "won",
      "lost",
      "converted",
    ],
    widthPdf: 1.1,
  },
  {
    key: "priority",
    label: "Priority",
    headerLetter: "G",
    type: "select",
    options: ["low", "medium", "high", "urgent"],
    widthPdf: 1.0,
  },
  { key: "source", label: "Source*", headerLetter: "H", type: "text", widthPdf: 1.2 },
  { key: "assigned_to_name", label: "Assigned To", headerLetter: "I", type: "select", widthPdf: 1.3 },
  { key: "total_quantity", label: "Est. Qty", headerLetter: "J", type: "number", widthPdf: 0.9 },
  { key: "estimated_value", label: "Est. Value", headerLetter: "K", type: "number", widthPdf: 1.2 },
  { key: "products_summary", label: "Requirements & Products (- Qty)", headerLetter: "L", type: "text", widthPdf: 2.2 },
  { key: "city", label: "City", headerLetter: "M", type: "text", widthPdf: 1.1 },
  { key: "state", label: "State", headerLetter: "N", type: "text", widthPdf: 1.1 },
  { key: "industry", label: "Industry", headerLetter: "O", type: "text", widthPdf: 1.2 },
  { key: "next_follow_up_at", label: "Next Follow-up", headerLetter: "P", type: "date", widthPdf: 1.3 },
  { key: "lost_reason", label: "Lost Reason", headerLetter: "Q", type: "text", widthPdf: 1.3 },
  { key: "createdAt", label: "Created Date", headerLetter: "R", readonly: true, type: "text", widthPdf: 1.1 },
];

export function GoogleSheetLeadsModal({
  isOpen,
  onClose,
  onSuccess,
  portalHome = "",
}: GoogleSheetLeadsModalProps) {
  const authUser = useAppSelector((state) => state.auth?.user);
  const isAdmin = isLeadAdmin(authUser, portalHome);
  const isSales = !isAdmin;
  const showPricing = canViewLeadPricing(authUser, portalHome);
  const canAssign = canAssignLead(authUser, portalHome);
  const canDelete = canDeleteLead(authUser, portalHome);

  const visibleColumns = useMemo(() => {
    const cols = showPricing
      ? COLUMNS
      : COLUMNS.filter((c) => c.key !== "estimated_value");
    return cols.map((c, i) => ({
      ...c,
      headerLetter: String.fromCharCode(65 + i),
    }));
  }, [showPricing]);

  const authUserId = authUser?._id
    ? String(authUser._id)
    : authUser?.id
    ? String(authUser.id)
    : undefined;

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [formulaValue, setFormulaValue] = useState<string>("");
  const [localRows, setLocalRows] = useState<LeadRow[]>([]);
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: keyof LeadRow;
    direction: "asc" | "desc";
  } | null>(null);

  // Filter panel state & options
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterSalesUser, setFilterSalesUser] = useState<string>("all");
  const [filterFollowUpState, setFilterFollowUpState] = useState<string>("all");
  const [filterDatePreset, setFilterDatePreset] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [filterMinQty, setFilterMinQty] = useState<string>("");
  const [filterMaxQty, setFilterMaxQty] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("all");
  const [filterState, setFilterState] = useState<string>("all");

  const [downloadPreviewOpen, setDownloadPreviewOpen] = useState<boolean>(false);

  // Sub-modals inside sheet
  const [assignTarget, setAssignTarget] = useState<LeadRecord | null>(null);
  const [followUpTarget, setFollowUpTarget] = useState<LeadRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadRecord | null>(null);

  // Resizable column widths
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    lead_no: 120,
    name: 160,
    company_name: 170,
    phone: 130,
    email: 160,
    status: 120,
    priority: 100,
    source: 130,
    assigned_to_name: 150,
    total_quantity: 90,
    estimated_value: 120,
    products_summary: 260,
    city: 110,
    state: 110,
    industry: 120,
    next_follow_up_at: 140,
    lost_reason: 140,
    createdAt: 110,
  });

  // Query args with User/Admin scoping
  const queryArgs = useMemo(() => {
    return {
      paginate: "false" as const,
      assigned_to: isSales ? authUserId : undefined,
    };
  }, [isSales, authUserId]);

  // RTK Queries & Mutations
  const { data: leadsData, isLoading, isFetching, refetch } = useListLeadsQuery(
    queryArgs,
    { skip: !isOpen }
  );
  const { data: sources } = useListLeadSourcesQuery(undefined, { skip: !isOpen });
  const { data: usersData } = useListUsersQuery(undefined, { skip: !isOpen });

  const [updateLead] = useUpdateLeadMutation();
  const [deleteLead] = useDeleteLeadMutation();
  const [bulkDeleteLeads, { isLoading: isBulkDeleting }] = useBulkDeleteLeadsMutation();

  const rawUsers = Array.isArray(usersData)
    ? usersData
    : (usersData as { data?: Array<{ _id: string; name: string; department?: string }> })?.data || [];
  const salesUsers = useMemo(() => {
    return rawUsers.filter((u) => u.department === "sales" || !u.department);
  }, [rawUsers]);

  const userMap = useMemo(() => {
    const map = new Map<string, { _id: string; name: string }>();
    rawUsers.forEach((u) => {
      if (u._id) map.set(u._id, u);
    });
    return map;
  }, [rawUsers]);

  // Transform backend leads into flattened LeadRow array
  const rawItems = useMemo<LeadRecord[]>(() => {
    if (!leadsData) return [];
    if (Array.isArray(leadsData)) return leadsData;
    if (Array.isArray((leadsData as any).items)) return (leadsData as any).items;
    if (Array.isArray((leadsData as any).data)) return (leadsData as any).data;
    return [];
  }, [leadsData]);

  useEffect(() => {
    if (rawItems) {
      const rows: LeadRow[] = rawItems.map((lead) => {
        const totalQty = Array.isArray(lead.products)
          ? lead.products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
          : 0;

        const assignedId = lead.assigned_to
          ? typeof lead.assigned_to === "object"
            ? lead.assigned_to._id
            : String(lead.assigned_to)
          : undefined;

        const assignedName = lead.assigned_to
          ? typeof lead.assigned_to === "object"
            ? lead.assigned_to.name
            : userMap.get(String(lead.assigned_to))?.name || "Assigned"
          : "";

        const productsSummary = formatProductsSummary(lead.products, lead.requirement);

        return {
          _id: lead._id,
          lead_no: lead.lead_no || "—",
          name: lead.name || "",
          company_name: lead.company_name || "",
          phone: lead.phone || "",
          email: lead.email || "",
          status: lead.status || "new",
          priority: lead.priority || "medium",
          source: lead.source || "",
          assigned_to_id: assignedId,
          assigned_to_name: assignedName,
          total_quantity: totalQty,
          estimated_value: leadEstimatedValue(lead),
          products_list: lead.products || [],
          products_summary: productsSummary,
          city: lead.billing_address?.city || "",
          state: lead.billing_address?.state || "",
          industry: lead.industry || "",
          requirement: lead.requirement || "",
          next_follow_up_at: lead.next_follow_up_at || "",
          lost_reason: lead.lost_info?.lost_reason || "",
          lost_remarks: lead.lost_info?.lost_remarks || "",
          notes: lead.notes || "",
          createdAt: lead.createdAt ? formatLeadDate(lead.createdAt) : "",
          raw: lead,
        };
      });
      setLocalRows(rows);
    }
  }, [rawItems, userMap]);

  // Sync formula bar input back to selected cell
  useEffect(() => {
    if (selectedCell) {
      const row = localRows.find((r) => r._id === selectedCell.leadId);
      if (row) {
        const val = row[selectedCell.colKey];
        setFormulaValue(val !== undefined && val !== null ? String(val) : "");
      }
    } else {
      setFormulaValue("");
    }
  }, [selectedCell, localRows]);

  // Close modal on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (assignTarget || followUpTarget || deleteTarget) return;
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, onClose, assignTarget, followUpTarget, deleteTarget]);

  // Column Resizing handlers
  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 120;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(70, startWidth + deltaX);
      setColWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const totalWidth = useMemo(() => {
    const columnsSum = visibleColumns.reduce((sum, col) => sum + (colWidths[col.key] || 120), 0);
    const checkboxWidth = canDelete ? 48 : 0;
    return 48 + checkboxWidth + 110 + columnsSum;
  }, [colWidths, canDelete, visibleColumns]);

  // Save edited cell to backend with Access Control checks
  const saveCell = useCallback(
    async (leadId: string, colKey: keyof LeadRow, val: any) => {
      const originalRow = localRows.find((r) => r._id === leadId);
      if (!originalRow) return;

      if (originalRow.status === "converted") {
        toast.error("Converted leads cannot be edited or deleted");
        return;
      }

      // Access control check for Assignment
      if (colKey === "assigned_to_name" && !canAssign) {
        toast.error("Only administrators can reassign leads to executives");
        return;
      }

      // Follow-up scheduling check for closed leads
      if (colKey === "next_follow_up_at" && !canScheduleFollowUp(originalRow.status)) {
        toast.error("Follow-up scheduling is not available for closed leads (Won, Lost, or Converted)");
        return;
      }

      // Access control check for Status transitions
      if (colKey === "status" && !isAdmin) {
        const allowed = ALLOWED_STATUS_TRANSITIONS[originalRow.status] || [];
        if (!allowed.includes(val) && val !== originalRow.status) {
          toast.error(
            `Unauthorized transition: ${originalRow.status} cannot be changed directly to ${val}`
          );
          return;
        }
      }

      if (colKey === "estimated_value" && !showPricing) {
        toast.error("Only administrators can edit lead pricing");
        return;
      }

      let parsedVal: any = val;
      if (colKey === "total_quantity" || colKey === "estimated_value") {
        parsedVal = val === "" ? 0 : Number(val);
        if (isNaN(parsedVal)) {
          toast.error("Invalid number value");
          return;
        }
      }

      if (originalRow[colKey] === parsedVal) return;

      // Optimistic update
      setLocalRows((prev) =>
        prev.map((row) => (row._id === leadId ? { ...row, [colKey]: parsedVal } : row))
      );

      setSavingRows((prev) => ({ ...prev, [leadId]: true }));
      try {
        const patchPayload: Record<string, any> = {};

        if (colKey === "city" || colKey === "state") {
          patchPayload.billing_address = {
            ...(originalRow.raw.billing_address || {}),
            [colKey]: parsedVal,
          };
        } else if (colKey === "assigned_to_name") {
          const userObj = rawUsers.find((u) => u.name === parsedVal || u._id === parsedVal);
          if (userObj) {
            patchPayload.assigned_to = userObj._id;
          }
        } else if (colKey === "lost_reason") {
          patchPayload.lost_info = {
            ...(originalRow.raw.lost_info || {}),
            lost_reason: parsedVal,
          };
        } else if (colKey === "lost_remarks") {
          patchPayload.lost_info = {
            ...(originalRow.raw.lost_info || {}),
            lost_remarks: parsedVal,
          };
        } else if (colKey === "products_summary") {
          patchPayload.requirement = parsedVal;
        } else {
          patchPayload[colKey] = parsedVal;
        }

        await updateLead({
          id: leadId,
          body: patchPayload,
        }).unwrap();
      } catch (err: any) {
        toast.error(mutationRejectedMessage(err) || "Failed to save update");
        refetch();
      } finally {
        setSavingRows((prev) => ({ ...prev, [leadId]: false }));
      }
    },
    [localRows, rawUsers, updateLead, refetch, canAssign, isAdmin, showPricing]
  );

  // Quick Delete Row (Admin only)
  const handleDeleteRow = async (leadId: string) => {
    if (!canDelete) {
      toast.error("Only administrators can delete leads");
      return;
    }
    const target = localRows.find((r) => r._id === leadId);
    if (target?.status === "converted") {
      toast.error("Converted leads cannot be deleted");
      return;
    }
    if (!confirm("Are you sure you want to delete this lead?")) return;
    try {
      await deleteLead(leadId).unwrap();
      toast.success("Lead deleted successfully");
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to delete lead");
    }
  };

  // Bulk Delete (Admin only)
  const handleBulkDelete = async () => {
    if (!canDelete) {
      toast.error("Only administrators can bulk delete leads");
      return;
    }
    const idsToDelete = Object.keys(selectedIds).filter(
      (id) =>
        selectedIds[id] &&
        localRows.some((r) => r._id === id && r.status !== "converted")
    );
    if (idsToDelete.length === 0) {
      toast.error("Converted leads cannot be deleted");
      return;
    }

    if (!confirm(`Are you sure you want to delete ${idsToDelete.length} selected leads?`)) return;

    try {
      await bulkDeleteLeads(idsToDelete).unwrap();
      toast.success(`Successfully deleted ${idsToDelete.length} leads`);
      setSelectedIds({});
      refetch();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(mutationRejectedMessage(err) || "Failed to delete selected leads");
    }
  };

  // Metadata for filter options
  const uniqueCities = useMemo(() => {
    const cities = new Set<string>();
    localRows.forEach((r) => {
      if (r.city && r.city.trim()) cities.add(r.city.trim());
    });
    return Array.from(cities).sort();
  }, [localRows]);

  const hasActiveFilters = useMemo(() => {
    return (
      filterStatus !== "all" ||
      filterPriority !== "all" ||
      filterSource !== "all" ||
      (isAdmin && filterSalesUser !== "all") ||
      filterFollowUpState !== "all" ||
      filterDatePreset !== "all" ||
      filterStartDate.trim() !== "" ||
      filterEndDate.trim() !== "" ||
      filterMinQty.trim() !== "" ||
      filterMaxQty.trim() !== "" ||
      filterCity !== "all" ||
      filterState !== "all"
    );
  }, [
    filterStatus,
    filterPriority,
    filterSource,
    filterSalesUser,
    isAdmin,
    filterFollowUpState,
    filterDatePreset,
    filterStartDate,
    filterEndDate,
    filterMinQty,
    filterMaxQty,
    filterCity,
    filterState,
  ]);

  const handleClearFilters = () => {
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterSource("all");
    setFilterSalesUser("all");
    setFilterFollowUpState("all");
    setFilterDatePreset("all");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterMinQty("");
    setFilterMaxQty("");
    setFilterCity("all");
    setFilterState("all");
  };

  // Filtered Rows
  const filteredRows = useMemo(() => {
    let rows = [...localRows];

    // 1. Text Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.lead_no?.toLowerCase().includes(q) ||
          r.name?.toLowerCase().includes(q) ||
          r.company_name?.toLowerCase().includes(q) ||
          r.phone?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.source?.toLowerCase().includes(q) ||
          r.assigned_to_name?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.state?.toLowerCase().includes(q) ||
          r.industry?.toLowerCase().includes(q) ||
          r.products_summary?.toLowerCase().includes(q) ||
          r.requirement?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q)
      );
    }

    // 2. Status Filter
    if (filterStatus !== "all") {
      rows = rows.filter((r) => r.status === filterStatus);
    }

    // 3. Priority Filter
    if (filterPriority !== "all") {
      rows = rows.filter((r) => r.priority === filterPriority);
    }

    // 4. Source Filter
    if (filterSource !== "all") {
      rows = rows.filter((r) => r.source === filterSource);
    }

    // 5. Assigned Sales User Filter (Admin only)
    if (isAdmin && filterSalesUser !== "all") {
      if (filterSalesUser === "unassigned") {
        rows = rows.filter((r) => !r.assigned_to_id);
      } else {
        rows = rows.filter((r) => r.assigned_to_id === filterSalesUser);
      }
    }

    // 6. Follow-up State Filter
    if (filterFollowUpState !== "all") {
      rows = rows.filter((r) => {
        if (!r.next_follow_up_at) return filterFollowUpState === "no_followup";
        if (filterFollowUpState === "today") return isFollowUpToday(r.next_follow_up_at);
        if (filterFollowUpState === "overdue") return isFollowUpOverdue(r.next_follow_up_at);
        if (filterFollowUpState === "upcoming") {
          return !isFollowUpToday(r.next_follow_up_at) && !isFollowUpOverdue(r.next_follow_up_at);
        }
        return true;
      });
    }

    // 7. Date Range Filter (based on raw.createdAt)
    if (filterDatePreset !== "all") {
      rows = rows.filter((r) => {
        const rawDateStr = r.raw.createdAt;
        if (!rawDateStr) return false;
        const d = new Date(rawDateStr);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (filterDatePreset === "today") {
          return d >= startOfToday;
        }
        if (filterDatePreset === "yesterday") {
          const startOfYesterday = new Date(startOfToday);
          startOfYesterday.setDate(startOfYesterday.getDate() - 1);
          return d >= startOfYesterday && d < startOfToday;
        }
        if (filterDatePreset === "last_7") {
          const sevenDaysAgo = new Date(startOfToday);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          return d >= sevenDaysAgo;
        }
        if (filterDatePreset === "last_30") {
          const thirtyDaysAgo = new Date(startOfToday);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return d >= thirtyDaysAgo;
        }
        if (filterDatePreset === "custom") {
          if (filterStartDate) {
            const start = new Date(filterStartDate);
            if (!isNaN(start.getTime()) && d < start) return false;
          }
          if (filterEndDate) {
            const end = new Date(filterEndDate);
            if (!isNaN(end.getTime())) {
              const endOfDay = new Date(
                end.getFullYear(),
                end.getMonth(),
                end.getDate(),
                23,
                59,
                59,
                999
              );
              if (d > endOfDay) return false;
            }
          }
        }
        return true;
      });
    }

    // 8. Qty Filter
    if (filterMinQty.trim()) {
      const min = Number(filterMinQty);
      if (!isNaN(min)) rows = rows.filter((r) => (r.total_quantity || 0) >= min);
    }
    if (filterMaxQty.trim()) {
      const max = Number(filterMaxQty);
      if (!isNaN(max)) rows = rows.filter((r) => (r.total_quantity || 0) <= max);
    }

    // 9. City Filter
    if (filterCity !== "all") {
      rows = rows.filter((r) => r.city?.trim() === filterCity);
    }

    // 10. State Filter
    if (filterState !== "all") {
      rows = rows.filter((r) => r.state?.trim() === filterState);
    }

    // 11. Sorting
    if (sortConfig) {
      rows.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];

        if (valA == null || valA === "") return sortConfig.direction === "asc" ? 1 : -1;
        if (valB == null || valB === "") return sortConfig.direction === "asc" ? -1 : 1;

        if (typeof valA === "number" && typeof valB === "number") {
          return sortConfig.direction === "asc" ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();

        if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
        if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return rows;
  }, [
    localRows,
    searchQuery,
    filterStatus,
    filterPriority,
    filterSource,
    filterSalesUser,
    isAdmin,
    filterFollowUpState,
    filterDatePreset,
    filterStartDate,
    filterEndDate,
    filterMinQty,
    filterMaxQty,
    filterCity,
    filterState,
    sortConfig,
  ]);

  // Selection counts
  const selectedCount = useMemo(() => {
    return Object.keys(selectedIds).filter(
      (id) => selectedIds[id] && localRows.some((r) => r._id === id)
    ).length;
  }, [selectedIds, localRows]);

  const selectableRows = useMemo(
    () => filteredRows.filter((r) => r.status !== "converted"),
    [filteredRows]
  );

  const isAllSelected = useMemo(() => {
    if (selectableRows.length === 0) return false;
    return selectableRows.every((r) => selectedIds[r._id]);
  }, [selectableRows, selectedIds]);

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (isAllSelected) {
        selectableRows.forEach((r) => {
          delete next[r._id];
        });
      } else {
        selectableRows.forEach((r) => {
          next[r._id] = true;
        });
      }
      return next;
    });
  };

  // KPIs
  const totalQuantitySum = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (r.total_quantity || 0), 0);
  }, [filteredRows]);

  const totalEstimatedValueSum = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.estimated_value) || 0), 0);
  }, [filteredRows]);

  const overdueCount = useMemo(() => {
    return filteredRows.filter((r) => isFollowUpOverdue(r.next_follow_up_at)).length;
  }, [filteredRows]);

  if (!isOpen) return null;

  const isSavingAny = Object.values(savingRows).some(Boolean);

  return (
    <LargeModalPortal>
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans select-none"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 px-4 py-2.5 shrink-0 backdrop-blur">
          <div className="flex items-center gap-3">
            {/* Google Sheets Logo */}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                  Leads Master Spreadsheet
                </span>
                {/* Role Badge */}
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  }`}
                >
                  {isAdmin ? "Admin Access" : "My Leads (Sales)"}
                </span>

                {/* Cloud Sync Status */}
                <div className="flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isSavingAny ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span>Saved to Cloud</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isAdmin
                  ? "Full administrative access: edit leads, change any stage, reassign sales executives, and manage records"
                  : "Sales representative access: view and update your assigned leads, qualify prospects, and schedule follow-ups"}
              </p>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
              title="Refresh leads"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>

            {/* Download Button triggering Preview Modal */}
            <button
              type="button"
              onClick={() => setDownloadPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Download
            </button>

            {/* Filter Toggle */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                isFilterPanelOpen || hasActiveFilters
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {hasActiveFilters && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">
                  !
                </span>
              )}
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Interactive Spreadsheet View */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
            {/* Formula & Search Bar */}
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2 shrink-0">
              {/* Search Bar */}
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in sheet (Name, No, Phone, City, Product)..."
                  className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1 text-xs text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Formula Bar FX */}
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-1.5 border-r border-slate-200 pr-2 font-mono text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <span className="italic text-emerald-600 dark:text-emerald-400">fx</span>
                  <span className="min-w-[32px] text-slate-700 dark:text-slate-200">
                    {selectedCell
                      ? `${
                          visibleColumns.find((c) => c.key === selectedCell.colKey)?.headerLetter || ""
                        }${filteredRows.findIndex((r) => r._id === selectedCell.leadId) + 1}`
                      : "—"}
                  </span>
                </div>
                <input
                  type="text"
                  value={formulaValue}
                  onChange={(e) => {
                    setFormulaValue(e.target.value);
                    if (selectedCell) {
                      saveCell(selectedCell.leadId, selectedCell.colKey, e.target.value);
                    }
                  }}
                  placeholder={
                    selectedCell
                      ? `Editing ${
                          visibleColumns.find((c) => c.key === selectedCell.colKey)?.label || ""
                        }`
                      : "Select a cell to view/edit formula..."
                  }
                  disabled={
                    !selectedCell ||
                    visibleColumns.find((c) => c.key === selectedCell.colKey)?.readonly ||
                    localRows.find((r) => r._id === selectedCell.leadId)?.status === "converted" ||
                    (selectedCell.colKey === "assigned_to_name" && !canAssign) ||
                    (selectedCell.colKey === "next_follow_up_at" &&
                      !canScheduleFollowUp(
                        localRows.find((r) => r._id === selectedCell.leadId)?.status || "new"
                      ))
                  }
                  className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-white disabled:opacity-50"
                />
              </div>

              {/* KPI Ribbon */}
              <div className="hidden lg:flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">Total Leads:</span>
                  <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-slate-800 dark:bg-slate-800 dark:text-white">
                    {filteredRows.length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">Total Est. Qty:</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                    {totalQuantitySum.toLocaleString()} units
                  </span>
                </div>
                {showPricing && (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400">Est. Value:</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300">
                      {formatCurrencyINR(totalEstimatedValueSum)}
                    </span>
                  </div>
                )}
                {overdueCount > 0 && (
                  <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{overdueCount} Overdue</span>
                  </div>
                )}
              </div>
            </div>

            {/* Spreadsheet Grid Container */}
            <div className="flex-1 overflow-auto bg-slate-100/60 dark:bg-slate-950">
              <div style={{ minWidth: `${totalWidth}px` }} className="border-collapse">
                {/* Table Header (Letters Row) */}
                <div className="sticky top-0 z-20 flex border-b border-slate-300 bg-slate-200/90 dark:border-slate-700 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 shadow-sm">
                  {/* Corner Cell */}
                  <div className="w-12 shrink-0 border-r border-slate-300 px-2 py-1.5 text-center dark:border-slate-700 bg-slate-200 dark:bg-slate-800">
                    #
                  </div>

                  {/* Checkbox All (Admin only) */}
                  {canDelete && (
                    <div className="w-12 shrink-0 border-r border-slate-300 px-2 py-1.5 text-center dark:border-slate-700 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                  )}

                  {/* Actions Column */}
                  <div className="w-28 shrink-0 border-r border-slate-300 px-3 py-1.5 text-center dark:border-slate-700">
                    Actions
                  </div>

                  {/* Dynamic Data Columns */}
                  {visibleColumns.map((col) => {
                    const isSorted = sortConfig?.key === col.key;
                    return (
                      <div
                        key={col.key}
                        style={{ width: `${colWidths[col.key] || 120}px` }}
                        className="relative flex shrink-0 items-center justify-between border-r border-slate-300 px-2.5 py-1.5 dark:border-slate-700 hover:bg-slate-300/60 dark:hover:bg-slate-700 transition group"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSortConfig((prev) => {
                              if (prev?.key === col.key) {
                                return prev.direction === "asc"
                                  ? { key: col.key, direction: "desc" }
                                  : null;
                              }
                              return { key: col.key, direction: "asc" };
                            });
                          }}
                          className="flex items-center gap-1 text-left font-bold text-slate-800 dark:text-slate-100 truncate w-full"
                        >
                          <span className="font-mono text-[10px] text-slate-400 group-hover:text-emerald-600">
                            {col.headerLetter}
                          </span>
                          <span className="truncate">{col.label}</span>
                          {isSorted &&
                            (sortConfig.direction === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-emerald-600" />
                            ))}
                        </button>

                        {/* Resize Handle */}
                        <div
                          onMouseDown={(e) => handleResizeStart(col.key, e)}
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Table Body Rows */}
                {isLoading ? (
                  <div className="flex h-64 items-center justify-center text-slate-400">
                    <RefreshCw className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
                    Loading leads spreadsheet...
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                    <FileSpreadsheet className="h-10 w-10 text-slate-300 mb-2" />
                    <p className="font-semibold">No leads found in this view</p>
                    <p className="text-xs text-slate-500">
                      {isSales
                        ? "You currently have no leads assigned to you"
                        : "Try adjusting your search query or filters"}
                    </p>
                  </div>
                ) : (
                  filteredRows.map((row, rowIdx) => {
                    const isRowSelected = Boolean(selectedIds[row._id]);
                    const isOverdue = isFollowUpOverdue(row.next_follow_up_at);
                    const isToday = isFollowUpToday(row.next_follow_up_at);
                    const statusCfg = LEAD_STATUS_CONFIG[row.status];
                    const priorityCfg = LEAD_PRIORITY_CONFIG[row.priority];

                    const isRowConverted = row.status === "converted";
                    const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[row.status] || [];
                    const statusOptions: LeadStatus[] = isAdmin
                      ? (visibleColumns.find((c) => c.key === "status")?.options as LeadStatus[]) || []
                      : [row.status, ...(allowedTransitions.filter((s) => s !== row.status) as LeadStatus[])];
                    const isStatusEditable = !isRowConverted && (isAdmin || allowedTransitions.length > 0);

                    return (
                      <div
                        key={row._id}
                        className={`flex border-b border-slate-200 dark:border-slate-800 text-xs transition ${
                          isRowSelected
                            ? "bg-emerald-50/70 dark:bg-emerald-950/30"
                            : rowIdx % 2 === 0
                            ? "bg-white dark:bg-slate-900"
                            : "bg-slate-50/60 dark:bg-slate-900/50"
                        } hover:bg-emerald-50/40 dark:hover:bg-slate-800/40`}
                      >
                        {/* Row Number */}
                        <div className="w-12 shrink-0 border-r border-slate-200 px-2 py-2 text-center font-mono text-[11px] text-slate-400 dark:border-slate-800 flex items-center justify-center bg-slate-100/50 dark:bg-slate-800/30">
                          {rowIdx + 1}
                        </div>

                        {/* Checkbox (Admin only) */}
                        {canDelete && (
                          <div className="w-12 shrink-0 border-r border-slate-200 px-2 py-2 text-center dark:border-slate-800 flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isRowSelected}
                              disabled={isRowConverted}
                              onChange={() => {
                                if (isRowConverted) return;
                                setSelectedIds((prev) => ({
                                  ...prev,
                                  [row._id]: !prev[row._id],
                                }));
                              }}
                              title={isRowConverted ? "Converted leads cannot be deleted" : "Select lead"}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </div>
                        )}

                        {/* Row Action Buttons */}
                        <div className="w-28 shrink-0 border-r border-slate-200 px-2 py-1.5 dark:border-slate-800 flex items-center justify-center gap-1">
                          {canScheduleFollowUp(row.status) && (
                            <button
                              type="button"
                              onClick={() => setFollowUpTarget(row.raw)}
                              title="Add Follow-up"
                              className="rounded p-1 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canAssign && !isRowConverted && (
                            <button
                              type="button"
                              onClick={() => setAssignTarget(row.raw)}
                              title="Assign Executive"
                              className="rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && !isRowConverted && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row._id)}
                              title="Delete Lead"
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Lead Cells */}
                        {visibleColumns.map((col) => {
                          const isCellSelected =
                            selectedCell?.leadId === row._id && selectedCell?.colKey === col.key;
                          const cellValue = row[col.key];

                          return (
                            <div
                              key={col.key}
                              style={{ width: `${colWidths[col.key] || 120}px` }}
                              onClick={() => setSelectedCell({ leadId: row._id, colKey: col.key })}
                              className={`relative shrink-0 border-r border-slate-200 dark:border-slate-800 px-2.5 py-1.5 flex items-center transition ${
                                isCellSelected
                                  ? "ring-2 ring-emerald-500 ring-inset bg-emerald-50/40 dark:bg-emerald-950/40 z-10 font-semibold"
                                  : ""
                              }`}
                            >
                              {/* Specific Cell Editors & Displays */}
                              {col.key === "lead_no" ? (
                                <span className="font-bold text-blue-600 dark:text-blue-400 truncate">
                                  {row.lead_no}
                                </span>
                              ) : col.key === "status" ? (
                                isStatusEditable ? (
                                  <select
                                    value={row.status}
                                    onChange={(e) =>
                                      saveCell(row._id, "status", e.target.value as LeadStatus)
                                    }
                                    className={`w-full rounded px-1.5 py-0.5 text-xs font-semibold border focus:outline-none cursor-pointer ${
                                      statusCfg?.bg || "bg-slate-100"
                                    } ${statusCfg?.text || "text-slate-800"} ${
                                      statusCfg?.border || "border-slate-300"
                                    }`}
                                  >
                                    {statusOptions.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {LEAD_STATUS_CONFIG[opt]?.label || opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span
                                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                      statusCfg?.bg || "bg-slate-100"
                                    } ${statusCfg?.text || "text-slate-800"}`}
                                  >
                                    {statusCfg?.label || row.status}
                                  </span>
                                )
                              ) : col.key === "priority" ? (
                                isRowConverted ? (
                                  <span
                                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                      priorityCfg?.bg || "bg-slate-100"
                                    } ${priorityCfg?.text || "text-slate-800"}`}
                                  >
                                    {priorityCfg?.label || row.priority}
                                  </span>
                                ) : (
                                  <select
                                    value={row.priority}
                                    onChange={(e) =>
                                      saveCell(row._id, "priority", e.target.value as LeadPriority)
                                    }
                                    className={`w-full rounded px-1.5 py-0.5 text-xs font-semibold border focus:outline-none cursor-pointer ${
                                      priorityCfg?.bg || "bg-slate-100"
                                    } ${priorityCfg?.text || "text-slate-800"} ${
                                      priorityCfg?.border || "border-slate-300"
                                    }`}
                                  >
                                    {col.options?.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {LEAD_PRIORITY_CONFIG[opt as LeadPriority]?.label || opt}
                                      </option>
                                    ))}
                                  </select>
                                )
                              ) : col.key === "source" ? (
                                isRowConverted ? (
                                  <span className="text-slate-700 dark:text-slate-300 truncate">
                                    {row.source || "—"}
                                  </span>
                                ) : (
                                  <select
                                    value={row.source}
                                    onChange={(e) => saveCell(row._id, "source", e.target.value)}
                                    className="w-full bg-transparent border-0 px-1 py-0.5 text-xs text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-800 rounded focus:ring-1 focus:ring-emerald-500 truncate"
                                  >
                                    <option value={row.source}>{row.source || "Select Source"}</option>
                                    {sources
                                      ?.filter((s) => s.name !== row.source)
                                      .map((s) => (
                                        <option key={s._id} value={s.name}>
                                          {s.name}
                                        </option>
                                      ))}
                                  </select>
                                )
                              ) : col.key === "assigned_to_name" ? (
                                canAssign && !isRowConverted ? (
                                  <select
                                    value={row.assigned_to_id || ""}
                                    onChange={(e) =>
                                      saveCell(row._id, "assigned_to_name", e.target.value)
                                    }
                                    className="w-full bg-transparent border-0 px-1 py-0.5 text-xs text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-800 rounded focus:ring-1 focus:ring-emerald-500 truncate"
                                  >
                                    <option value="">Unassigned</option>
                                    {salesUsers.map((u) => (
                                      <option key={u._id} value={u._id}>
                                        {u.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-slate-700 dark:text-slate-300 truncate">
                                    {row.assigned_to_name || "Unassigned"}
                                  </span>
                                )
                              ) : col.key === "products_summary" ? (
                                <div className="w-full truncate text-xs">
                                  {row.products_list && row.products_list.length > 0 ? (
                                    <div className="flex flex-wrap items-center gap-1.5 truncate">
                                      {row.products_list.map((p, pIdx) => (
                                        <span
                                          key={pIdx}
                                          className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                        >
                                          <span>{p.product_name || "Item"}</span>
                                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                            - {p.quantity} {p.unit || "pcs"}
                                          </span>
                                        </span>
                                      ))}
                                      {row.requirement && (
                                        <span className="text-[11px] text-slate-500 italic truncate max-w-[120px]">
                                          ({row.requirement})
                                        </span>
                                      )}
                                    </div>
                                  ) : row.requirement ? (
                                    <span className="text-slate-700 dark:text-slate-300 truncate">
                                      {row.requirement}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-normal">—</span>
                                  )}
                                </div>
                              ) : col.key === "next_follow_up_at" ? (
                                canScheduleFollowUp(row.status) ? (
                                  <div className="flex items-center gap-1 w-full truncate">
                                    <input
                                      type="datetime-local"
                                      value={
                                        row.next_follow_up_at
                                          ? new Date(row.next_follow_up_at).toISOString().slice(0, 16)
                                          : ""
                                      }
                                      onChange={(e) =>
                                        saveCell(
                                          row._id,
                                          "next_follow_up_at",
                                          e.target.value
                                            ? new Date(e.target.value).toISOString()
                                            : undefined
                                        )
                                      }
                                      className={`w-full bg-transparent text-xs rounded border-0 px-1 py-0.5 focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-emerald-500 ${
                                        isOverdue
                                          ? "font-bold text-rose-600 dark:text-rose-400"
                                          : isToday
                                          ? "font-bold text-amber-600 dark:text-amber-400"
                                          : "text-slate-700 dark:text-slate-300"
                                      }`}
                                    />
                                    {isOverdue && (
                                      <span
                                        title="Overdue Follow-up"
                                        className="h-2 w-2 rounded-full bg-rose-500 shrink-0"
                                      />
                                    )}
                                    {isToday && (
                                      <span
                                        title="Due Today"
                                        className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-normal truncate">
                                    {row.next_follow_up_at ? formatLeadDate(row.next_follow_up_at) : "—"}
                                  </span>
                                )
                              ) : col.key === "estimated_value" ? (
                                isRowConverted ? (
                                  <span className="truncate text-right font-semibold text-slate-800 dark:text-slate-200">
                                    {Number(row.estimated_value) > 0
                                      ? formatCurrencyINR(row.estimated_value)
                                      : "—"}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={
                                      row.estimated_value !== undefined && row.estimated_value !== null
                                        ? String(row.estimated_value)
                                        : ""
                                    }
                                    onChange={(e) => {
                                      const newVal = e.target.value;
                                      setLocalRows((prev) =>
                                        prev.map((r) =>
                                          r._id === row._id
                                            ? { ...r, estimated_value: newVal === "" ? 0 : Number(newVal) }
                                            : r
                                        )
                                      );
                                    }}
                                    onBlur={(e) => saveCell(row._id, "estimated_value", e.target.value)}
                                    className="w-full bg-transparent border-0 px-1 py-0.5 text-xs text-right font-semibold text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-800 rounded focus:ring-1 focus:ring-emerald-500 truncate"
                                  />
                                )
                              ) : col.key === "createdAt" ? (
                                <span className="text-slate-500 text-[11px] truncate">
                                  {row.createdAt}
                                </span>
                              ) : isRowConverted ? (
                                <span className="truncate text-slate-700 dark:text-slate-300">
                                  {cellValue !== undefined && cellValue !== null && String(cellValue).trim()
                                    ? String(cellValue)
                                    : "—"}
                                </span>
                              ) : (
                                <input
                                  type={col.type === "number" ? "number" : "text"}
                                  value={cellValue !== undefined && cellValue !== null ? String(cellValue) : ""}
                                  onChange={(e) => {
                                    const newVal = e.target.value;
                                    setLocalRows((prev) =>
                                      prev.map((r) =>
                                        r._id === row._id ? { ...r, [col.key]: newVal } : r
                                      )
                                    );
                                  }}
                                  onBlur={(e) => saveCell(row._id, col.key, e.target.value)}
                                  className="w-full bg-transparent border-0 px-1 py-0.5 text-xs text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-800 rounded focus:ring-1 focus:ring-emerald-500 truncate"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bulk Action Bar (Admin only) */}
            {canDelete && selectedCount > 0 && (
              <div className="border-t border-emerald-500 bg-emerald-900 text-white px-4 py-2.5 flex items-center justify-between shadow-2xl shrink-0 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-emerald-800 px-2 py-0.5 text-xs font-bold">
                    {selectedCount} Selected
                  </span>
                  <span className="text-xs text-emerald-200">
                    Bulk actions on selected leads
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds({})}
                    className="rounded-lg border border-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/10"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow hover:bg-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected ({selectedCount})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filter Drawer / Panel (Right Slide-out) */}
          {isFilterPanelOpen && (
            <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col justify-between overflow-y-auto shadow-2xl z-30 animate-in slide-in-from-right-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      Filters Panel
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterPanelOpen(false)}
                    className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lead Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Statuses</option>
                    {Object.keys(LEAD_STATUS_CONFIG).map((st) => (
                      <option key={st} value={st}>
                        {LEAD_STATUS_CONFIG[st as LeadStatus]?.label || st}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Source Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lead Source
                  </label>
                  <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Sources</option>
                    {sources?.map((s) => (
                      <option key={s._id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assigned Sales Rep (Admin only) */}
                {isAdmin && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Assigned Executive
                    </label>
                    <select
                      value={filterSalesUser}
                      onChange={(e) => setFilterSalesUser(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="all">All Executives</option>
                      <option value="unassigned">Unassigned Only</option>
                      {salesUsers.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Follow-up State Filter */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Follow-up Urgency
                  </label>
                  <select
                    value={filterFollowUpState}
                    onChange={(e) => setFilterFollowUpState(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Follow-ups</option>
                    <option value="today">Due Today</option>
                    <option value="overdue">Overdue</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="no_followup">No Follow-up Scheduled</option>
                  </select>
                </div>

                {/* Date Range Preset */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Created Date Range
                  </label>
                  <select
                    value={filterDatePreset}
                    onChange={(e) => setFilterDatePreset(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_7">Last 7 Days</option>
                    <option value="last_30">Last 30 Days</option>
                    <option value="custom">Custom Date Range</option>
                  </select>

                  {filterDatePreset === "custom" && (
                    <div className="mt-2 space-y-1.5">
                      <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Quantity Range */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Est. Quantity Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min Qty"
                      value={filterMinQty}
                      onChange={(e) => setFilterMinQty(e.target.value)}
                      className="w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <input
                      type="number"
                      placeholder="Max Qty"
                      value={filterMaxQty}
                      onChange={(e) => setFilterMaxQty(e.target.value)}
                      className="w-1/2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Location Filter */}
                {uniqueCities.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      City
                    </label>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="all">All Cities</option>
                      {uniqueCities.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterPanelOpen(false)}
                  className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sub-modals for Action buttons inside the sheet */}
        {assignTarget && canAssign && (
          <AssignLeadModal
            lead={assignTarget}
            open={Boolean(assignTarget)}
            onClose={() => setAssignTarget(null)}
            onSuccess={() => refetch()}
          />
        )}

        {followUpTarget && (
          <FollowUpModal
            lead={followUpTarget}
            open={Boolean(followUpTarget)}
            onClose={() => setFollowUpTarget(null)}
            onSuccess={() => refetch()}
          />
        )}

        {deleteTarget && canDelete && (
          <ConfirmDeleteLeadModal
            lead={deleteTarget}
            open={Boolean(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
            onSuccess={() => refetch()}
          />
        )}

        {downloadPreviewOpen && (
          <DownloadLeadsPreviewModal
            open={downloadPreviewOpen}
            onClose={() => setDownloadPreviewOpen(false)}
            leads={filteredRows}
            availableColumns={visibleColumns.map((c) => ({
              key: c.key,
              label: c.label,
              widthPdf: c.widthPdf,
            }))}
          />
        )}
      </div>
    </LargeModalPortal>
  );
}
