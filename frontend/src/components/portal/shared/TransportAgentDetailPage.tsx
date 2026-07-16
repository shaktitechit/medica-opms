"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit,
  Trash2,
  FileText,
  Plus,
  ExternalLink,
  Building2,
  User,
  Truck,
  Route,
  Search,
  X,
  RefreshCw,
  Phone,
  Scale,
  Key,
  Download,
  FileSpreadsheet,
} from "lucide-react";

import { mutationRejectedMessage, mutationSuccessCopy } from "@/lib/mutationMessages";
import { toast } from "@/lib/toast";
import {
  useDeleteAttachmentMutation,
  useDeleteTransportAgentMutation,
  useGetTransportAgentQuery,
  useLazyGetFileViewQuery,
  useListAttachmentsQuery,
  useListDriversQuery,
  useListVehiclesQuery,
  useListTransportsQuery,
  useDeleteDriverMutation,
  useDeleteVehicleMutation,
} from "@/store/api";

import { TransportAgentDetailModal } from "./modals/TransportAgentDetailModal";
import { AddTransportAgentDocumentModal } from "./modals/AddTransportAgentDocumentModal";
import { ConfirmDeleteTransportAgentModal } from "./modals/ConfirmDeleteTransportAgentModal";
import { PortalBusyOverlay } from "@/components/portal/shared/PortalBusyOverlay";
import { OrderListPaginationBar } from "@/components/portal/shared/orderList/OrderListPaginationBar";
import {
  DATE_FILTER_OPTIONS,
  orderMatchesDateFilter,
} from "@/components/portal/shared/orderList/orderListDateFilter";
import {
  downloadTablePdf,
  downloadTableXlsx,
} from "@/components/portal/shared/exportTableDownloads";

// Modals for Drivers & Vehicles
import { DriverDetailModal } from "./modals/DriverDetailModal";
import { ConfirmDeleteDriverModal } from "./modals/ConfirmDeleteDriverModal";
import { VehicleDetailModal } from "./modals/VehicleDetailModal";
import { ConfirmDeleteVehicleModal } from "./modals/ConfirmDeleteVehicleModal";

// Helpers & Components for fleet
import { formatVehicleCapacity } from "./fleetDisplay";

const labelClass = "text-xs font-semibold text-slate-500 dark:text-slate-400";
const valueClass = "text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5";

type AgentTab = "documents" | "drivers" | "vehicles" | "transports";

function stringField(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

function idFromRef(ref: unknown): string {
  if (ref == null || ref === "") return "";
  if (typeof ref === "string" || typeof ref === "number") return String(ref).trim();
  if (typeof ref === "object") {
    const o = ref as Record<string, unknown>;
    // Prefer explicit ids; some payloads only expose nested agent fields after populate.
    const direct = o._id ?? o.id;
    if (direct != null && typeof direct !== "object") return String(direct).trim();
    if (direct && typeof direct === "object") {
      const nested = direct as Record<string, unknown>;
      const nestedId = nested._id ?? nested.id;
      if (nestedId != null) return String(nestedId).trim();
    }
  }
  return "";
}

function asRecordList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  return pickList(raw) as Record<string, unknown>[];
}

/** Keep rows that belong to this agent; if ref is missing, trust the API filter. */
function belongsToTransportAgent(row: Record<string, unknown>, agentId: string): boolean {
  if (!agentId) return false;
  const refId = idFromRef(row.transport_agent);
  if (!refId) return true;
  return refId === agentId;
}

function orderNoFromTransport(tr: Record<string, unknown>): string {
  const order = tr.order;
  if (order && typeof order === "object") {
    const o = order as Record<string, unknown>;
    const no = o.order_no ?? o.order_number;
    if (typeof no === "string" && no.trim()) return no.trim();
  }
  return "";
}

function partyNameFromTransport(tr: Record<string, unknown>): string {
  const order = tr.order;
  if (!order || typeof order !== "object") return "";
  const o = order as Record<string, unknown>;
  for (const key of ["party", "customer"] as const) {
    const ref = o[key];
    if (ref && typeof ref === "object") {
      const name = (ref as Record<string, unknown>).party_name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  if (typeof o.party_name === "string" && o.party_name.trim()) return o.party_name.trim();
  return "";
}

function vehicleNoFromTransport(tr: Record<string, unknown>): string {
  const v = tr.vehicle_number ?? tr.vehicle_no;
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function driverNameFromTransport(tr: Record<string, unknown>): string {
  const d = tr.driver_name;
  return typeof d === "string" ? d.trim() : d != null ? String(d).trim() : "";
}

function shipmentStatusFromTransport(tr: Record<string, unknown>): string {
  return String(tr.shipment_status ?? tr.status ?? "created").toLowerCase();
}

const SHIPMENT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "created", label: "Created" },
  { value: "transporter_assigned", label: "Transporter Assigned" },
  { value: "vehicle_assigned", label: "Vehicle Assigned" },
  { value: "pickup_pending", label: "Pickup Pending" },
  { value: "picked_up", label: "Picked Up" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "delivery_failed", label: "Delivery Failed" },
  { value: "returned", label: "Returned" },
] as const;

const transportFilterSelectClass =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";

const transportDateInputClass =
  "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100";

function formatDateReadOnly(dateVal: unknown): string {
  if (!dateVal) return "—";
  const d = new Date(String(dateVal));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active" || s === "available") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-700/10 dark:bg-emerald-950/30 dark:text-emerald-400">
        Active
      </span>
    );
  }
  if (s === "assigned") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-950/30 dark:text-blue-400">
        Assigned
      </span>
    );
  }
  if (s === "on_trip" || s === "in_transit") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-700/10 dark:bg-amber-955/30 dark:text-amber-400">
        On Trip
      </span>
    );
  }
  if (s === "maintenance" || s === "leave") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10 dark:bg-white/5 dark:text-slate-400">
        {s.replace(/_/g, " ")}
      </span>
    );
  }
  if (s === "inactive") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-700/10 dark:bg-rose-955/30 dark:text-rose-455">
        Inactive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-600/10 dark:bg-white/10 dark:text-slate-300 capitalize">
      {s.replace(/_/g, " ")}
    </span>
  );
}

function shipmentStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "delivered") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-955/30 dark:text-emerald-400">
        Delivered
      </span>
    );
  }
  if (s === "delivery_failed" || s === "returned") {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-955/30 dark:text-rose-455 capitalize">
        {s.replace(/_/g, " ")}
      </span>
    );
  }
  if (s === "in_transit" || s === "out_for_delivery") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-955/30 dark:text-amber-400 capitalize">
        {s.replace(/_/g, " ")}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-955/30 dark:text-blue-400 capitalize">
      {s.replace(/_/g, " ")}
    </span>
  );
}

export type TransportAgentDetailPageProps = {
  id: string;
  portalHome?: string;
};

export default function TransportAgentDetailPage({
  id,
  portalHome = "/dispatch",
}: TransportAgentDetailPageProps) {
  const router = useRouter();
  
  // Modals visibility states
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentTab>("documents");

  // Drivers Tab State
  const [driverSearchQuery, setDriverSearchQuery] = useState("");
  const [driverStatusFilter, setDriverStatusFilter] = useState("all");
  const [driverCurrentPage, setDriverCurrentPage] = useState(1);
  const [driverItemsPerPage, setDriverItemsPerPage] = useState(10);
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  const [driverEditId, setDriverEditId] = useState<string | null>(null);
  const [driverDeleteTarget, setDriverDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Vehicles Tab State
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState("");
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState("all");
  const [vehicleOwnershipFilter, setVehicleOwnershipFilter] = useState("all");
  const [vehicleCurrentPage, setVehicleCurrentPage] = useState(1);
  const [vehicleItemsPerPage, setVehicleItemsPerPage] = useState(10);
  const [vehicleCreateOpen, setVehicleCreateOpen] = useState(false);
  const [vehicleEditId, setVehicleEditId] = useState<string | null>(null);
  const [vehicleDeleteTarget, setVehicleDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Transports Tab State
  const [transportSearchQuery, setTransportSearchQuery] = useState("");
  const [transportPartyFilter, setTransportPartyFilter] = useState("all");
  const [transportStatusFilter, setTransportStatusFilter] = useState("all");
  const [transportVehicleFilter, setTransportVehicleFilter] = useState("all");
  const [transportDriverFilter, setTransportDriverFilter] = useState("all");
  const [transportDateFilter, setTransportDateFilter] = useState("all");
  const [transportCustomDateFrom, setTransportCustomDateFrom] = useState("");
  const [transportCustomDateTo, setTransportCustomDateTo] = useState("");
  const [transportCurrentPage, setTransportCurrentPage] = useState(1);
  const [transportItemsPerPage, setTransportItemsPerPage] = useState(10);
  const [isExportingTransports, setIsExportingTransports] = useState(false);

  // API Queries & Mutations
  const { data, isLoading, isFetching, isError, refetch } = useGetTransportAgentQuery(id, { skip: !id });
  const detail = data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  const { data: attachmentsData, refetch: refetchAttachments } = useListAttachmentsQuery(
    { entity_type: "transport_agent", entity_id: id },
    { skip: !id },
  );
  const attachments = useMemo(() => pickList(attachmentsData), [attachmentsData]);

  // Fetch Drivers belonging to this transport agent
  const {
    data: driversData,
    isFetching: driversFetching,
    isError: driversError,
    refetch: refetchDrivers,
  } = useListDriversQuery(
    { transport_agent: id },
    { skip: !id, refetchOnMountOrArgChange: true },
  );
  const drivers = useMemo(() => asRecordList(driversData), [driversData]);

  // Fetch Vehicles belonging to this transport agent
  const {
    data: vehiclesData,
    isFetching: vehiclesFetching,
    isError: vehiclesError,
    refetch: refetchVehicles,
  } = useListVehiclesQuery(
    { transport_agent: id },
    { skip: !id, refetchOnMountOrArgChange: true },
  );
  const vehicles = useMemo(() => asRecordList(vehiclesData), [vehiclesData]);

  // Fetch Transports belonging to this transport agent
  const { data: transportsData, isFetching: transportsFetching, refetch: refetchTransports } = useListTransportsQuery(
    { transport_agent: id },
    { skip: !id, refetchOnMountOrArgChange: true },
  );
  const transports = useMemo(() => asRecordList(transportsData), [transportsData]);

  // Mutations
  const [deleteTransportAgent, { isLoading: isDeleting }] = useDeleteTransportAgentMutation();
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [triggerFileView] = useLazyGetFileViewQuery();

  const [deleteDriver, { isLoading: isDeletingDriver }] = useDeleteDriverMutation();
  const [deleteVehicle, { isLoading: isDeletingVehicle }] = useDeleteVehicleMutation();

  // Drivers Filter Logic — API already scopes by transport_agent; only drop clear mismatches.
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (!belongsToTransportAgent(d, id)) return false;

      if (driverStatusFilter !== "all") {
        const dStatus = String(d.status || "available").toLowerCase();
        if (dStatus !== driverStatusFilter) return false;
      }

      if (!driverSearchQuery.trim()) return true;
      const q = driverSearchQuery.toLowerCase();
      const name = String(d.name || "").toLowerCase();
      const code = String(d.driver_code || "").toLowerCase();
      const phone = String(d.phone || "").toLowerCase();
      const lic = String(d.license_no || "").toLowerCase();

      return (
        name.includes(q) ||
        code.includes(q) ||
        phone.includes(q) ||
        lic.includes(q)
      );
    });
  }, [drivers, id, driverSearchQuery, driverStatusFilter]);

  // Vehicles Filter Logic — same membership rule as drivers.
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (!belongsToTransportAgent(v, id)) return false;

      if (vehicleStatusFilter !== "all") {
        const statusStr = String(v.status || "available").toLowerCase();
        if (statusStr !== vehicleStatusFilter) return false;
      }

      if (vehicleOwnershipFilter !== "all") {
        const ownershipStr = String(v.ownership_type || "owned").toLowerCase();
        if (ownershipStr !== vehicleOwnershipFilter) return false;
      }

      if (!vehicleSearchQuery.trim()) return true;
      const q = vehicleSearchQuery.toLowerCase();
      const num = String(v.vehicle_no || "").toLowerCase();
      const type = String(v.vehicle_type || "").toLowerCase();
      const makeModel = `${v.make ?? ""} ${v.model ?? ""}`.toLowerCase();

      return num.includes(q) || type.includes(q) || makeModel.includes(q);
    });
  }, [vehicles, id, vehicleSearchQuery, vehicleStatusFilter, vehicleOwnershipFilter]);

  // Driver pagination slicing
  const paginatedDrivers = useMemo(() => {
    const start = (driverCurrentPage - 1) * driverItemsPerPage;
    const end = start + driverItemsPerPage;
    return filteredDrivers.slice(start, end) as any[];
  }, [filteredDrivers, driverCurrentPage, driverItemsPerPage]);

  const driverTotalPages = Math.max(1, Math.ceil(filteredDrivers.length / driverItemsPerPage));
  const driverStartEntry = filteredDrivers.length > 0 ? (driverCurrentPage - 1) * driverItemsPerPage + 1 : 0;
  const driverEndEntry = Math.min(driverCurrentPage * driverItemsPerPage, filteredDrivers.length);

  // Vehicle pagination slicing
  const paginatedVehicles = useMemo(() => {
    const start = (vehicleCurrentPage - 1) * vehicleItemsPerPage;
    const end = start + vehicleItemsPerPage;
    return filteredVehicles.slice(start, end) as any[];
  }, [filteredVehicles, vehicleCurrentPage, vehicleItemsPerPage]);

  const vehicleTotalPages = Math.max(1, Math.ceil(filteredVehicles.length / vehicleItemsPerPage));
  const vehicleStartEntry = filteredVehicles.length > 0 ? (vehicleCurrentPage - 1) * vehicleItemsPerPage + 1 : 0;
  const vehicleEndEntry = Math.min(vehicleCurrentPage * vehicleItemsPerPage, filteredVehicles.length);

  const transportPartyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const tr of transports) {
      const name = partyNameFromTransport(tr);
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [transports]);

  const transportVehicleOptions = useMemo(() => {
    const nums = new Set<string>();
    for (const tr of transports) {
      const num = vehicleNoFromTransport(tr);
      if (num) nums.add(num);
    }
    return Array.from(nums).sort((a, b) => a.localeCompare(b));
  }, [transports]);

  const transportDriverOptions = useMemo(() => {
    const names = new Set<string>();
    for (const tr of transports) {
      const name = driverNameFromTransport(tr);
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [transports]);

  const transportFiltersActive =
    transportSearchQuery.trim() !== "" ||
    transportPartyFilter !== "all" ||
    transportStatusFilter !== "all" ||
    transportVehicleFilter !== "all" ||
    transportDriverFilter !== "all" ||
    transportDateFilter !== "all";

  const resetTransportFilters = useCallback(() => {
    setTransportSearchQuery("");
    setTransportPartyFilter("all");
    setTransportStatusFilter("all");
    setTransportVehicleFilter("all");
    setTransportDriverFilter("all");
    setTransportDateFilter("all");
    setTransportCustomDateFrom("");
    setTransportCustomDateTo("");
    setTransportCurrentPage(1);
  }, []);

  const filteredTransports = useMemo(() => {
    return transports.filter((tr) => {
      if (transportPartyFilter !== "all") {
        if (partyNameFromTransport(tr) !== transportPartyFilter) return false;
      }

      if (transportStatusFilter !== "all") {
        if (shipmentStatusFromTransport(tr) !== transportStatusFilter) return false;
      }

      if (transportVehicleFilter !== "all") {
        if (vehicleNoFromTransport(tr) !== transportVehicleFilter) return false;
      }

      if (transportDriverFilter !== "all") {
        if (driverNameFromTransport(tr) !== transportDriverFilter) return false;
      }

      if (
        !orderMatchesDateFilter(
          { order_date: tr.dispatch_date },
          transportDateFilter,
          transportCustomDateFrom,
          transportCustomDateTo,
        )
      ) {
        return false;
      }

      if (!transportSearchQuery.trim()) return true;
      const q = transportSearchQuery.toLowerCase().trim();
      const haystack = [
        tr.shipment_no,
        orderNoFromTransport(tr),
        partyNameFromTransport(tr),
        shipmentStatusFromTransport(tr).replace(/_/g, " "),
        vehicleNoFromTransport(tr),
        driverNameFromTransport(tr),
        tr.lr_number,
        tr.tracking_number,
        tr.eway_bill_no,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [
    transports,
    transportSearchQuery,
    transportPartyFilter,
    transportStatusFilter,
    transportVehicleFilter,
    transportDriverFilter,
    transportDateFilter,
    transportCustomDateFrom,
    transportCustomDateTo,
  ]);

  // Transport pagination slicing
  const paginatedTransports = useMemo(() => {
    const start = (transportCurrentPage - 1) * transportItemsPerPage;
    const end = start + transportItemsPerPage;
    return filteredTransports.slice(start, end) as any[];
  }, [filteredTransports, transportCurrentPage, transportItemsPerPage]);

  const transportTotalPages = Math.max(1, Math.ceil(filteredTransports.length / transportItemsPerPage));
  const transportStartEntry =
    filteredTransports.length > 0 ? (transportCurrentPage - 1) * transportItemsPerPage + 1 : 0;
  const transportEndEntry = Math.min(
    transportCurrentPage * transportItemsPerPage,
    filteredTransports.length,
  );

  const handleDelete = useCallback(async () => {
    try {
      await deleteTransportAgent(id).unwrap();
      toast.success(mutationSuccessCopy("deleteTransportAgent"));
      router.push(`${portalHome}/transport-agents`);
    } catch (rejected) {
      toast.error(mutationRejectedMessage(rejected));
    }
  }, [deleteTransportAgent, id, router]);

  const handleViewFile = async (url: string) => {
    try {
      const match = url.match(/\/files\/([^/]+)\/view/);
      const fileId = match ? match[1] : url;
      const blob = await triggerFileView(fileId).unwrap();
      window.open(window.URL.createObjectURL(blob), "_blank");
    } catch {
      toast.error("Failed to view document.");
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await deleteAttachment(attId).unwrap();
      toast.success("Document deleted successfully.");
      refetchAttachments();
    } catch {
      toast.error("Failed to delete document.");
    }
  };

  if (isError || (!isLoading && !detail)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="text-4xl">⚠️</div>
        <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Transport agent not found</h2>
        <Link href={`${portalHome}/transport-agents`} className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          <ArrowLeft className="h-4 w-4" />
          Back to transport agents
        </Link>
      </div>
    );
  }

  if (!detail) {
    return <PortalBusyOverlay active message="Loading transport agent…" />;
  }

  const agentName = stringField(detail.agent_name) || "Transport Agent";
  const agentCode = stringField(detail.agent_code);

  const transportExportColumns = [
    { key: "shipment_no", label: "Shipment", width: 1.2 },
    { key: "order_no", label: "Order No", width: 1.1 },
    { key: "party", label: "Party", width: 1.6 },
    { key: "status", label: "Status", width: 1.2 },
    { key: "vehicle", label: "Vehicle", width: 1.1 },
    { key: "driver", label: "Driver", width: 1.2 },
    { key: "weight", label: "Weight", width: 0.9 },
    { key: "dispatch_date", label: "Dispatch Date", width: 1.1 },
  ] as const;

  const buildTransportExportRows = () =>
    filteredTransports.map((tr) => {
      const weight =
        tr.weight != null ? `${tr.weight} ${tr.weight_unit || "Kg"}` : "";
      return {
        shipment_no: String(tr.shipment_no ?? ""),
        order_no: orderNoFromTransport(tr),
        party: partyNameFromTransport(tr),
        status: shipmentStatusFromTransport(tr).replace(/_/g, " "),
        vehicle: vehicleNoFromTransport(tr),
        driver: driverNameFromTransport(tr),
        weight,
        dispatch_date: formatDateReadOnly(tr.dispatch_date),
      };
    });

  const transportExportFilenameBase = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = (agentCode || agentName || "agent")
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    return `transport-shipments_${slug}_${stamp}`;
  };

  const handleDownloadTransportsXlsx = () => {
    if (filteredTransports.length === 0) {
      toast.error("No shipments to export.");
      return;
    }
    try {
      downloadTableXlsx({
        filename: transportExportFilenameBase(),
        sheetName: "Shipments",
        title: `Transport Shipments — ${agentName}`,
        columns: [...transportExportColumns],
        rows: buildTransportExportRows(),
      });
      toast.success("XLSX downloaded.");
    } catch {
      toast.error("Failed to download XLSX.");
    }
  };

  const handleDownloadTransportsPdf = async () => {
    if (filteredTransports.length === 0) {
      toast.error("No shipments to export.");
      return;
    }
    setIsExportingTransports(true);
    try {
      await downloadTablePdf({
        filename: transportExportFilenameBase(),
        title: `Transport Shipments — ${agentName}`,
        subtitle: `${agentCode ? `${agentCode} · ` : ""}${filteredTransports.length} shipment${filteredTransports.length === 1 ? "" : "s"} · Exported ${new Date().toLocaleString()}`,
        columns: [...transportExportColumns],
        rows: buildTransportExportRows(),
      });
      toast.success("PDF downloaded.");
    } catch {
      toast.error("Failed to download PDF.");
    } finally {
      setIsExportingTransports(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {editOpen ? (
        <TransportAgentDetailModal
          transportAgentId={id}
          onClose={() => {
            setEditOpen(false);
            void refetch();
          }}
        />
      ) : null}

      <AddTransportAgentDocumentModal
        open={addDocOpen}
        transportAgentId={id}
        transportAgentLabel={agentName}
        onClose={() => setAddDocOpen(false)}
        onUploaded={() => void refetchAttachments()}
      />

      <ConfirmDeleteTransportAgentModal
        transportAgentId={deleteOpen ? id : null}
        transportAgentLabel={agentName}
        isDeleting={isDeleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      {/* Driver modals */}
      {driverCreateOpen ? (
        <DriverDetailModal
          driverId={null}
          create
          defaultTransportAgentId={id}
          onClose={() => {
            setDriverCreateOpen(false);
            void refetchDrivers();
          }}
        />
      ) : null}

      {driverEditId ? (
        <DriverDetailModal
          driverId={driverEditId}
          onClose={() => {
            setDriverEditId(null);
            void refetchDrivers();
          }}
        />
      ) : null}

      <ConfirmDeleteDriverModal
        driverId={driverDeleteTarget?.id ?? null}
        driverLabel={driverDeleteTarget?.label ?? ""}
        isDeleting={isDeletingDriver}
        onClose={() => setDriverDeleteTarget(null)}
        onConfirm={async () => {
          if (!driverDeleteTarget) return;
          try {
            await deleteDriver(driverDeleteTarget.id).unwrap();
            toast.success(mutationSuccessCopy("deleteDriver"));
            setDriverDeleteTarget(null);
            void refetchDrivers();
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
          }
        }}
      />

      {/* Vehicle modals */}
      {vehicleCreateOpen ? (
        <VehicleDetailModal
          vehicleId={null}
          create
          defaultTransportAgentId={id}
          onClose={() => {
            setVehicleCreateOpen(false);
            void refetchVehicles();
          }}
        />
      ) : null}

      {vehicleEditId ? (
        <VehicleDetailModal
          vehicleId={vehicleEditId}
          onClose={() => {
            setVehicleEditId(null);
            void refetchVehicles();
          }}
        />
      ) : null}

      <ConfirmDeleteVehicleModal
        vehicleId={vehicleDeleteTarget?.id ?? null}
        vehicleLabel={vehicleDeleteTarget?.label ?? ""}
        isDeleting={isDeletingVehicle}
        onClose={() => setVehicleDeleteTarget(null)}
        onConfirm={async () => {
          if (!vehicleDeleteTarget) return;
          try {
            await deleteVehicle(vehicleDeleteTarget.id).unwrap();
            toast.success(mutationSuccessCopy("deleteVehicle"));
            setVehicleDeleteTarget(null);
            void refetchVehicles();
          } catch (rejected) {
            toast.error(mutationRejectedMessage(rejected));
          }
        }}
      />

      {/* Top Banner Card */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/10 bg-gradient-to-r from-blue-600/5 to-indigo-600/10 p-6 shadow-sm dark:from-blue-500/5 dark:to-indigo-500/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white dark:bg-white dark:text-slate-900">
                Transport Agent
              </span>
              {statusBadge(stringField(detail.status) || "active")}
            </div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-55">
              <Building2 className="h-7 w-7 text-blue-500 shrink-0" />
              {agentName}
              {agentCode ? <span className="font-mono text-sm font-semibold text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">{agentCode}</span> : null}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
              {stringField(detail.agent_type).replace(/_/g, " ") || "—"} · {stringField(detail.mobile) || "No mobile"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${portalHome}/transport-agents`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-55 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
              <ArrowLeft className="h-3.5 w-3.5" />
              All agents
            </Link>
            <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            <button type="button" onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-400">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Agent details */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-55">Agent details</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className={labelClass}>Code</dt><dd className={`${valueClass} font-mono`}>{agentCode || "—"}</dd></div>
          <div><dt className={labelClass}>Name</dt><dd className={valueClass}>{agentName}</dd></div>
          <div><dt className={labelClass}>Type</dt><dd className={`${valueClass} capitalize`}>{stringField(detail.agent_type).replace(/_/g, " ") || "—"}</dd></div>
          <div><dt className={labelClass}>Status</dt><dd className={`${valueClass} capitalize`}>{stringField(detail.status) || "—"}</dd></div>
          <div><dt className={labelClass}>Mobile</dt><dd className={valueClass}>{stringField(detail.mobile) || "—"}</dd></div>
          <div><dt className={labelClass}>Alternate Mobile</dt><dd className={valueClass}>{stringField(detail.alternate_mobile) || "—"}</dd></div>
          <div><dt className={labelClass}>Contact Person</dt><dd className={valueClass}>{stringField(detail.contact_person) || "—"}</dd></div>
          <div><dt className={labelClass}>Email</dt><dd className={valueClass}>{stringField(detail.email) || "—"}</dd></div>
          <div><dt className={labelClass}>GST No</dt><dd className={valueClass}>{stringField(detail.gst_no) || "—"}</dd></div>
          <div><dt className={labelClass}>PAN No</dt><dd className={valueClass}>{stringField(detail.pan_no) || "—"}</dd></div>
          <div className="sm:col-span-2"><dt className={labelClass}>Remarks</dt><dd className={valueClass}>{stringField(detail.remarks) || "—"}</dd></div>
        </dl>
      </section>

      {/* Tab Switcher Area */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-white/10 overflow-x-auto scrollbar-none">
          
          {/* Documents Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 whitespace-nowrap ${
              activeTab === "documents"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <FileText className="h-4 w-4" />
            Documents
            {attachments.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {attachments.length}
              </span>
            ) : null}
          </button>

          {/* Drivers Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("drivers")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 whitespace-nowrap ${
              activeTab === "drivers"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <User className="h-4 w-4" />
            Drivers
            {drivers.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {drivers.length}
              </span>
            ) : null}
          </button>

          {/* Vehicles Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("vehicles")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 whitespace-nowrap ${
              activeTab === "vehicles"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Truck className="h-4 w-4" />
            Vehicles
            {vehicles.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {vehicles.length}
              </span>
            ) : null}
          </button>

          {/* Transports Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("transports")}
            className={`border-b-2 px-6 py-3.5 text-sm font-semibold transition -mb-px flex items-center gap-2 whitespace-nowrap ${
              activeTab === "transports"
                ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-500"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Route className="h-4 w-4" />
            Transports
            {transports.length > 0 ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                {transports.length}
              </span>
            ) : null}
          </button>

        </div>

        <div className="p-5">
          
          {/* Documents Content */}
          {activeTab === "documents" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Agreements, registration, and other agent-related files.
                </p>
                <button
                  type="button"
                  onClick={() => setAddDocOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add document
                </button>
              </div>

              {attachments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No documents yet. Click Add document to upload.
                </p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attRaw) => {
                    const att = attRaw as Record<string, unknown>;
                    const attId = String(att._id ?? att.id ?? "");
                    return (
                      <div
                        key={attId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/40"
                      >
                        <div className="min-w-0">
                          <span
                            className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block"
                            title={String(att.original_name ?? att.file_name ?? "")}
                          >
                            {String(att.original_name ?? att.file_name ?? "Document")}
                          </span>
                          {typeof att.remarks === "string" && att.remarks.trim() ? (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                              {att.remarks}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {typeof att.url === "string" ? (
                            <button
                              type="button"
                              onClick={() => void handleViewFile(att.url as string)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            >
                              View
                            </button>
                          ) : null}
                          {attId ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteAttachment(attId)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                            >
                              Delete
                            </button>
                          ) : null}
                          {typeof att.url === "string" ? (
                            <a
                              href={att.url as string}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* Drivers Content */}
          {activeTab === "drivers" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Drivers associated with this transport agent.
                </p>
                <button
                  type="button"
                  onClick={() => setDriverCreateOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add driver
                </button>
              </div>

              {/* Driver Filters */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-150 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-955/20">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={driverSearchQuery}
                    onChange={(e) => {
                      setDriverSearchQuery(e.target.value);
                      setDriverCurrentPage(1);
                    }}
                    placeholder="Search by driver name, code, phone, license..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-650/30 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                  />
                  {driverSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setDriverSearchQuery("");
                        setDriverCurrentPage(1);
                      }}
                      className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={driverStatusFilter}
                  onChange={(e) => {
                    setDriverStatusFilter(e.target.value);
                    setDriverCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="on_trip">On Trip</option>
                  <option value="leave">Leave</option>
                  <option value="inactive">Inactive</option>
                </select>

                {(driverSearchQuery || driverStatusFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setDriverSearchQuery("");
                      setDriverStatusFilter("all");
                      setDriverCurrentPage(1);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Driver List */}
              {driversFetching ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : driversError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                    Failed to load drivers
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchDrivers()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              ) : filteredDrivers.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No drivers found.
                </p>
              ) : (
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white dark:border-white/10 dark:bg-slate-900">
                  <OrderListPaginationBar
                    startEntry={driverStartEntry}
                    endEntry={driverEndEntry}
                    totalEntries={filteredDrivers.length}
                    itemsPerPage={driverItemsPerPage}
                    onItemsPerPageChange={(value) => {
                      setDriverItemsPerPage(value);
                      setDriverCurrentPage(1);
                    }}
                    currentPage={driverCurrentPage}
                    totalPages={driverTotalPages}
                    onPageChange={setDriverCurrentPage}
                  />
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {paginatedDrivers.map((d) => {
                      const driverId = d._id ?? d.id;
                      const code = d.driver_code ?? "—";
                      const name = d.name ?? "Unnamed Driver";
                      const phone = d.phone ?? "—";
                      const lic = d.license_no ?? "—";
                      const statusStr = (d.status || "available").toLowerCase();

                      return (
                        <div
                          key={driverId}
                          className="p-4 hover:bg-slate-50/50 dark:hover:bg-white/5 transition duration-155 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                              <User className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-50 truncate">
                                  {name}
                                </h3>
                                {statusBadge(statusStr)}
                              </div>
                              <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                                <span>Code: {code}</span>
                              </p>
                            </div>
                          </div>

                          {/* Metadata */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[11px] lg:flex-[2] max-w-lg w-full">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-mono">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              <span>{phone}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-mono">
                              <FileText className="h-3.5 w-3.5 text-slate-400" />
                              <span>License: {lic}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 justify-end shrink-0">
                            <Link
                              href={`/dispatch/drivers/${driverId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-250 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 text-xs font-semibold shadow-sm transition"
                            >
                              View Profile
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDriverEditId(driverId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-250 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 text-xs font-semibold shadow-sm transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDriverDeleteTarget({ id: driverId, label: name })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-250 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-455 text-xs font-semibold shadow-sm transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Vehicles Content */}
          {activeTab === "vehicles" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Vehicles associated with this transport agent.
                </p>
                <button
                  type="button"
                  onClick={() => setVehicleCreateOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add vehicle
                </button>
              </div>

              {/* Vehicle Filters */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-150 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-955/20">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={vehicleSearchQuery}
                    onChange={(e) => {
                      setVehicleSearchQuery(e.target.value);
                      setVehicleCurrentPage(1);
                    }}
                    placeholder="Search by registration number, type, model..."
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-650/30 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                  />
                  {vehicleSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleSearchQuery("");
                        setVehicleCurrentPage(1);
                      }}
                      className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={vehicleStatusFilter}
                  onChange={(e) => {
                    setVehicleStatusFilter(e.target.value);
                    setVehicleCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_transit">In Transit</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>

                <select
                  value={vehicleOwnershipFilter}
                  onChange={(e) => {
                    setVehicleOwnershipFilter(e.target.value);
                    setVehicleCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-600 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All Ownerships</option>
                  <option value="owned">Owned</option>
                  <option value="attached">Attached</option>
                  <option value="rented">Rented</option>
                  <option value="third_party">Third Party</option>
                </select>

                {(vehicleSearchQuery || vehicleStatusFilter !== "all" || vehicleOwnershipFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setVehicleSearchQuery("");
                      setVehicleStatusFilter("all");
                      setVehicleOwnershipFilter("all");
                      setVehicleCurrentPage(1);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              {/* Vehicle List */}
              {vehiclesFetching ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : vehiclesError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                    Failed to load vehicles
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchVehicles()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              ) : filteredVehicles.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No vehicles found.
                </p>
              ) : (
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white dark:border-white/10 dark:bg-slate-900">
                  <OrderListPaginationBar
                    startEntry={vehicleStartEntry}
                    endEntry={vehicleEndEntry}
                    totalEntries={filteredVehicles.length}
                    itemsPerPage={vehicleItemsPerPage}
                    onItemsPerPageChange={(value) => {
                      setVehicleItemsPerPage(value);
                      setVehicleCurrentPage(1);
                    }}
                    currentPage={vehicleCurrentPage}
                    totalPages={vehicleTotalPages}
                    onPageChange={setVehicleCurrentPage}
                  />
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {paginatedVehicles.map((v) => {
                      const vehicleId = v._id ?? v.id;
                      const num = v.vehicle_no ?? "Unnamed Vehicle";
                      const type = v.vehicle_type ?? "pickup";
                      const cap = formatVehicleCapacity(v);
                      const owner = v.ownership_type ?? "owned";
                      const statusStr = (v.status || "available").toLowerCase();

                      return (
                        <div
                          key={vehicleId}
                          className="p-4 hover:bg-slate-50/50 dark:hover:bg-white/5 transition duration-155 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/5 dark:text-blue-400 shrink-0">
                              <Truck className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xs font-bold text-slate-905 dark:text-slate-50 truncate font-mono uppercase tracking-wider">
                                  {num}
                                </h3>
                                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 capitalize font-sans">
                                  {owner}
                                </span>
                                {statusBadge(statusStr)}
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500 capitalize">
                                {type.replace(/_/g, " ")}
                              </p>
                            </div>
                          </div>

                          {/* Metadata */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[11px] lg:flex-[2] max-w-lg w-full">
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-sans">
                              <Scale className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>Capacity: <strong>{cap}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-sans">
                              <Key className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="capitalize">Model: <strong>{v.make || v.model ? `${v.make ?? ""} ${v.model ?? ""}` : "—"}</strong></span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 justify-end shrink-0">
                            <Link
                              href={`/dispatch/vehicles/${vehicleId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-250 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 text-xs font-semibold shadow-sm transition"
                            >
                              View Profile
                            </Link>
                            <button
                              type="button"
                              onClick={() => setVehicleEditId(vehicleId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-250 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 text-xs font-semibold shadow-sm transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setVehicleDeleteTarget({ id: vehicleId, label: num })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-250 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-455 text-xs font-semibold shadow-sm transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Transports Content */}
          {activeTab === "transports" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Shipments assigned to this transport agent.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadTransportsPdf()}
                    disabled={filteredTransports.length === 0 || isExportingTransports}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isExportingTransports ? "Generating PDF…" : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTransportsXlsx}
                    disabled={filteredTransports.length === 0 || isExportingTransports}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Download XLSX
                  </button>
                </div>
              </div>

              {/* Transport Filters */}
              <div className="space-y-2 rounded-lg border border-slate-150 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-955/20">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[200px] flex-1">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      value={transportSearchQuery}
                      onChange={(e) => {
                        setTransportSearchQuery(e.target.value);
                        setTransportCurrentPage(1);
                      }}
                      placeholder="Search by shipment, order #, party, vehicle, driver..."
                      className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-8 text-xs text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-650/30 dark:border-white/10 dark:bg-slate-950 dark:text-slate-50"
                    />
                    {transportSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTransportSearchQuery("");
                          setTransportCurrentPage(1);
                        }}
                        className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <select
                    value={transportPartyFilter}
                    onChange={(e) => {
                      setTransportPartyFilter(e.target.value);
                      setTransportCurrentPage(1);
                    }}
                    className={`${transportFilterSelectClass} min-w-[9rem] max-w-[14rem]`}
                    aria-label="Filter by party"
                  >
                    <option value="all">All Parties</option>
                    {transportPartyOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={transportStatusFilter}
                    onChange={(e) => {
                      setTransportStatusFilter(e.target.value);
                      setTransportCurrentPage(1);
                    }}
                    className={`${transportFilterSelectClass} min-w-[9rem]`}
                    aria-label="Filter by status"
                  >
                    {SHIPMENT_STATUS_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={transportVehicleFilter}
                    onChange={(e) => {
                      setTransportVehicleFilter(e.target.value);
                      setTransportCurrentPage(1);
                    }}
                    className={`${transportFilterSelectClass} min-w-[8rem]`}
                    aria-label="Filter by vehicle"
                  >
                    <option value="all">All Vehicles</option>
                    {transportVehicleOptions.map((num) => (
                      <option key={num} value={num}>
                        {num}
                      </option>
                    ))}
                  </select>

                  <select
                    value={transportDriverFilter}
                    onChange={(e) => {
                      setTransportDriverFilter(e.target.value);
                      setTransportCurrentPage(1);
                    }}
                    className={`${transportFilterSelectClass} min-w-[8rem] max-w-[12rem]`}
                    aria-label="Filter by driver"
                  >
                    <option value="all">All Drivers</option>
                    {transportDriverOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={transportDateFilter}
                    onChange={(e) => {
                      setTransportDateFilter(e.target.value);
                      setTransportCurrentPage(1);
                    }}
                    className={`${transportFilterSelectClass} min-w-[8rem]`}
                    aria-label="Filter by dispatch date"
                  >
                    {DATE_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.id === "all" ? "All Dispatch Dates" : opt.label}
                      </option>
                    ))}
                  </select>

                  {transportFiltersActive ? (
                    <button
                      type="button"
                      onClick={resetTransportFilters}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Reset Filters
                    </button>
                  ) : null}
                </div>

                {transportDateFilter === "custom" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Dispatch date
                    </span>
                    <input
                      type="date"
                      value={transportCustomDateFrom}
                      onChange={(e) => {
                        setTransportCustomDateFrom(e.target.value);
                        setTransportCurrentPage(1);
                      }}
                      className={transportDateInputClass}
                      title="From date"
                      aria-label="Dispatch date from"
                    />
                    <span className="text-[10px] text-slate-400">—</span>
                    <input
                      type="date"
                      value={transportCustomDateTo}
                      onChange={(e) => {
                        setTransportCustomDateTo(e.target.value);
                        setTransportCurrentPage(1);
                      }}
                      className={transportDateInputClass}
                      title="To date"
                      aria-label="Dispatch date to"
                    />
                  </div>
                ) : null}
              </div>

              {transportsFetching ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : transports.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No transport shipments linked to this agent yet.
                </p>
              ) : filteredTransports.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                  No shipments match the current filters.
                </p>
              ) : (
                <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/90 dark:border-white/10">
                  <OrderListPaginationBar
                    startEntry={transportStartEntry}
                    endEntry={transportEndEntry}
                    totalEntries={filteredTransports.length}
                    itemsPerPage={transportItemsPerPage}
                    onItemsPerPageChange={(value) => {
                      setTransportItemsPerPage(value);
                      setTransportCurrentPage(1);
                    }}
                    currentPage={transportCurrentPage}
                    totalPages={transportTotalPages}
                    onPageChange={setTransportCurrentPage}
                  />
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Shipment</th>
                        <th className="px-3 py-2.5">Order No</th>
                        <th className="px-3 py-2.5">Party</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Vehicle</th>
                        <th className="px-3 py-2.5">Driver</th>
                        <th className="px-3 py-2.5">Weight</th>
                        <th className="px-3 py-2.5">Dispatch date</th>
                        <th className="px-3 py-2.5 text-right">Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {paginatedTransports.map((tr) => {
                        const trId = idFromRef(tr._id ?? tr.id);
                        const shipmentNo = tr.shipment_no ?? "—";
                        const shipmentStatus = tr.shipment_status ?? tr.status ?? "created";
                        const vehicleNumber = tr.vehicle_number ?? tr.vehicle_no ?? "—";
                        const dName = tr.driver_name ?? "—";
                        const orderId = idFromRef(tr.order);
                        const orderNo = orderNoFromTransport(tr);
                        const partyName = partyNameFromTransport(tr);

                        return (
                          <tr key={trId || shipmentNo} className="bg-white dark:bg-slate-900">
                            <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {shipmentNo}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap font-mono font-bold text-slate-800 dark:text-slate-200">
                              {orderId && orderNo ? (
                                <Link
                                  href={`${portalHome}/order/${orderId}`}
                                  className="text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {orderNo}
                                </Link>
                              ) : (
                                orderNo || "—"
                              )}
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200 max-w-[14rem]">
                              <span className="line-clamp-2 break-words">{partyName || "—"}</span>
                            </td>
                            <td className="px-3 py-3">
                              {shipmentStatusBadge(shipmentStatus)}
                            </td>
                            <td className="px-3 py-3 font-mono uppercase text-slate-700 dark:text-slate-300">
                              {vehicleNumber}
                            </td>
                            <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
                              {dName}
                            </td>
                            <td className="px-3 py-3 text-slate-700 dark:text-slate-300 font-mono">
                              {tr.weight != null ? `${tr.weight} ${tr.weight_unit || "Kg"}` : "—"}
                            </td>
                            <td className="px-3 py-3 tabular-nums text-slate-500 font-mono">
                              {formatDateReadOnly(tr.dispatch_date)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {orderId ? (
                                <Link
                                  href={`${portalHome}/order/${orderId}`}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                                >
                                  View order
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
