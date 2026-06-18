"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetDashboardSuperQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListFlagsQuery,
  useListUsersQuery,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  LayoutDashboard,
  RefreshCw,
  Users,
  Package,
  ClipboardList,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Truck,
  BadgeDollarSign,
  Activity,
  ChevronRight,
  ArrowRight,
  Flag,
  TrendingUp,
  Info,
  ExternalLink,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function getStatusBadgeClass(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "draft")
    return "bg-slate-100 text-slate-800 ring-1 ring-slate-600/10 dark:bg-slate-900/40 dark:text-slate-400 dark:ring-white/10";
  if (["submitted", "sales_approved", "on_hold"].includes(s))
    return "bg-amber-50 text-amber-800 ring-1 ring-amber-600/10 dark:bg-amber-950/20 dark:text-amber-400 dark:ring-amber-500/20";
  if (["finance_review", "finance_rejected"].includes(s))
    return "bg-rose-50 text-rose-800 ring-1 ring-rose-600/10 dark:bg-rose-950/20 dark:text-rose-450 dark:ring-rose-500/20";
  if (s.includes("dispatch") || s.includes("transport") || s.includes("transit"))
    return "bg-blue-50 text-blue-800 ring-1 ring-blue-600/10 dark:bg-blue-950/20 dark:text-blue-400 dark:ring-blue-500/20";
  if (s === "delivered" || s.includes("paid") || s === "closed")
    return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/10 dark:bg-emerald-950/20 dark:text-emerald-400 dark:ring-emerald-500/20";
  return "bg-slate-50 text-slate-700 ring-1 ring-slate-600/10 dark:bg-slate-900/20 dark:text-slate-400 dark:ring-white/5";
}

function getSeverityBadgeClass(severity?: string): string {
  const s = (severity || "").toLowerCase();
  if (s === "critical") return "bg-red-100 text-red-800 ring-1 ring-red-600/20 dark:bg-red-950/40 dark:text-red-400";
  if (s === "high") return "bg-rose-100 text-rose-800 ring-1 ring-rose-600/15 dark:bg-rose-950/30 dark:text-rose-400";
  if (s === "medium") return "bg-amber-100 text-amber-800 ring-1 ring-amber-600/15 dark:bg-amber-950/30 dark:text-amber-400";
  return "bg-blue-100 text-blue-800 ring-1 ring-blue-600/15 dark:bg-blue-950/30 dark:text-blue-400";
}

function fmt(status?: string): string {
  if (!status) return "—";
  return status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function extractFlags(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.flags)) return o.flags;
  }
  return [];
}

function extractList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.items)) return o.items;
  }
  return [];
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

type KpiCardProps = {
  label: string;
  sublabel: string;
  value: number | string;
  loading?: boolean;
  accentFrom: string;
  accentTo: string;
  icon: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  textColor: string;
};

function KpiCard({
  label, sublabel, value, loading, accentFrom, accentTo, icon, href, hrefLabel, textColor,
}: KpiCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/10 dark:bg-slate-900">
      <div className={`absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r ${accentFrom} ${accentTo}`} />
      <div className="flex items-center justify-between">
        <div className={`rounded-lg p-2.5 ${accentFrom.replace("from-", "bg-").replace("-450", "-50").replace("-550", "-50")} dark:bg-white/5`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold tracking-widest uppercase ${textColor}`}>{label}</span>
      </div>
      <div className="mt-4">
        <h3 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {loading ? (
            <span className="inline-block h-8 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          ) : value}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</p>
      </div>
      {href && (
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
          <Link href={href} className={`inline-flex items-center gap-1 text-xs font-semibold transition ${textColor}`}>
            {hrefLabel ?? "View"}
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Dept Badge ─────────────────────────────────────────────────────────────

function DeptBadge({ dept }: { dept: string }) {
  const map: Record<string, string> = {
    super_admin: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
    admin: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
    sales: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    finance: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    dispatch: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[dept] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
      {fmt(dept)}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SuperAdminOverview() {
  const user = useAppSelector((s) => s.auth.user);
  const userName = typeof user?.name === "string" ? user.name : "Super Administrator";

  const { data: kpiRaw, isFetching: kpiFetching, isError: kpiError, refetch: refetchKpi } = useGetDashboardSuperQuery();
  const { data: ordersRaw, isFetching: ordersFetching, isError: ordersError, refetch: refetchOrders } = useListOrdersQuery({});
  const { data: partiesRaw, isFetching: partiesFetching, refetch: refetchParties } = useListPartiesQuery({});
  const { data: flagsRaw, isFetching: flagsFetching, isError: flagsError, refetch: refetchFlags } = useListFlagsQuery({});
  const { data: usersRaw, isFetching: usersFetching, refetch: refetchUsers } = useListUsersQuery({});

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
        refetchParties().unwrap(),
        refetchFlags().unwrap(),
        refetchUsers().unwrap(),
      ]);
    } catch { /* silent */ } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading = kpiFetching || ordersFetching || partiesFetching || flagsFetching || usersFetching || isRefreshing;

  // ── kpi data ──────────────────────────────────────────────────────────────
  const kpi = kpiRaw as {
    users?: { total?: number; active?: number };
    orders?: { total?: number; by_status?: Record<string, number> };
    finance?: { queue_size?: number; awaiting_finance?: number };
    dispatch?: { pending_dispatches?: number };
    fleet?: { active_vehicles?: number; active_drivers?: number };
    flags?: { open_flags?: number };
  } | undefined;

  const totalOrders = kpi?.orders?.total ?? 0;
  const totalUsers = kpi?.users?.total ?? 0;
  const activeUsers = kpi?.users?.active ?? 0;
  const openFlags = kpi?.flags?.open_flags ?? 0;
  const pendingDispatches = kpi?.dispatch?.pending_dispatches ?? 0;
  const financeQueue = kpi?.finance?.queue_size ?? 0;
  const activeVehicles = kpi?.fleet?.active_vehicles ?? 0;
  const activeDrivers = kpi?.fleet?.active_drivers ?? 0;

  const ordersByStatus = kpi?.orders?.by_status ?? {};
  const draftCount = ordersByStatus.draft ?? 0;
  const awaitingCount =
    (ordersByStatus.submitted ?? 0) +
    (ordersByStatus.sales_approved ?? 0) +
    (ordersByStatus.finance_review ?? 0) +
    (ordersByStatus.dispatch_pending ?? 0) +
    (ordersByStatus.transport_pending ?? 0);
  const completedCount = (ordersByStatus.delivered ?? 0) + (ordersByStatus.paid ?? 0);
  const otherCount = Math.max(0, totalOrders - draftCount - awaitingCount - completedCount);

  const draftPct = totalOrders > 0 ? (draftCount / totalOrders) * 100 : 0;
  const awaitingPct = totalOrders > 0 ? (awaitingCount / totalOrders) * 100 : 0;
  const completedPct = totalOrders > 0 ? (completedCount / totalOrders) * 100 : 0;
  const otherPct = totalOrders > 0 ? (otherCount / totalOrders) * 100 : 0;

  // ── derived lists ─────────────────────────────────────────────────────────
  const recentOrders = useMemo(() => {
    const list = pickOrders(ordersRaw) as any[];
    return [...list].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    }).slice(0, 6);
  }, [ordersRaw]);

  const partyList = useMemo(() => extractList(partiesRaw) as any[], [partiesRaw]);
  const partyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partyList) {
      const id = String(p._id || p.id || "");
      if (id) map.set(id, p.party_name || p.name || id.slice(0, 8));
    }
    return map;
  }, [partyList]);

  const partySraById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of partyList) {
      const id = String(p._id || p.id || "");
      if (id) map.set(id, p.sra === true);
    }
    return map;
  }, [partyList]);

  const userList = useMemo(() => extractList(usersRaw) as any[], [usersRaw]);
  const recentUsers = useMemo(() => [...userList].slice(0, 5), [userList]);

  const openFlagList = useMemo(() => {
    return extractFlags(flagsRaw).filter((f: any) => f?.status === "open" || f?.status === "in_progress");
  }, [flagsRaw]);

  const orderNoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of pickOrders(ordersRaw) as any[]) {
      const id = String(o._id || o.id || "");
      if (id) map.set(id, o.order_no || o.order_number || "");
    }
    return map;
  }, [ordersRaw]);

  // ── dept breakdown from users ─────────────────────────────────────────────
  const deptBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of userList) {
      const d = u.department || "unknown";
      counts[d] = (counts[d] ?? 0) + 1;
    }
    return counts;
  }, [userList]);

  const deptColors: Record<string, string> = {
    super_admin: "bg-violet-500",
    admin: "bg-indigo-500",
    sales: "bg-emerald-500",
    finance: "bg-blue-500",
    dispatch: "bg-amber-500",
  };

  return (
    <div className="space-y-8 pb-12">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              Super Admin Console
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Welcome,{" "}
            <span className="font-semibold text-violet-600 dark:text-violet-400">{userName}</span>{" "}
            — full system visibility across all departments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${isAnyLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <Link
            href="/super_admin/orders"
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-violet-600/20 transition hover:bg-violet-700"
          >
            <ClipboardList className="h-4 w-4" />
            All Orders
          </Link>
        </div>
      </div>

      {/* ── KPI GRID ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          label="Total Orders"
          sublabel="System-wide across all departments"
          value={totalOrders}
          loading={kpiFetching}
          accentFrom="from-violet-500"
          accentTo="to-indigo-600"
          textColor="text-violet-600 dark:text-violet-400"
          icon={<ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
          href="/super_admin/orders"
          hrefLabel="Manage Orders"
        />
        <KpiCard
          label="System Users"
          sublabel={`${activeUsers} active of ${totalUsers} total`}
          value={totalUsers}
          loading={kpiFetching}
          accentFrom="from-indigo-500"
          accentTo="to-blue-600"
          textColor="text-indigo-600 dark:text-indigo-400"
          icon={<Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />}
          href="/super_admin/users"
          hrefLabel="Manage Users"
        />
        <KpiCard
          label="Open Flags"
          sublabel="Unresolved system blockages"
          value={openFlags}
          loading={kpiFetching}
          accentFrom="from-rose-500"
          accentTo="to-red-600"
          textColor="text-rose-600 dark:text-rose-400"
          icon={<Flag className="h-5 w-5 text-rose-600 dark:text-rose-400" />}
        />
        <KpiCard
          label="Finance Queue"
          sublabel="Payments awaiting finance review"
          value={financeQueue}
          loading={kpiFetching}
          accentFrom="from-blue-500"
          accentTo="to-cyan-600"
          textColor="text-blue-600 dark:text-blue-400"
          icon={<BadgeDollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          href="/super_admin/orders"
          hrefLabel="View Pipeline"
        />
        <KpiCard
          label="Pending Dispatch"
          sublabel="Dispatches awaiting processing"
          value={pendingDispatches}
          loading={kpiFetching}
          accentFrom="from-amber-500"
          accentTo="to-orange-600"
          textColor="text-amber-600 dark:text-amber-400"
          icon={<Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
        />
        <KpiCard
          label="Active Vehicles"
          sublabel="Fleet vehicles in operation"
          value={activeVehicles}
          loading={kpiFetching}
          accentFrom="from-teal-500"
          accentTo="to-emerald-600"
          textColor="text-teal-600 dark:text-teal-400"
          icon={<Truck className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
        />
        <KpiCard
          label="Active Drivers"
          sublabel="Drivers available for dispatch"
          value={activeDrivers}
          loading={kpiFetching}
          accentFrom="from-sky-500"
          accentTo="to-blue-600"
          textColor="text-sky-600 dark:text-sky-400"
          icon={<Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />}
        />
        <KpiCard
          label="Parties"
          sublabel="Total counterparty accounts"
          value={partyList.length}
          loading={partiesFetching}
          accentFrom="from-pink-500"
          accentTo="to-rose-600"
          textColor="text-pink-600 dark:text-pink-400"
          icon={<Building2 className="h-5 w-5 text-pink-600 dark:text-pink-400" />}
          href="/super_admin/parties"
          hrefLabel="View Parties"
        />
      </div>

      {/* ── QUICK ACTIONS ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">System Controls</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { href: "/super_admin/orders", icon: <ClipboardList className="h-5 w-5" />, color: "violet", title: "All Orders", desc: "Full order pipeline across all departments." },
            { href: "/super_admin/users", icon: <Users className="h-5 w-5" />, color: "indigo", title: "User Management", desc: "Create, edit, and manage system user accounts." },
            { href: "/super_admin/parties", icon: <Building2 className="h-5 w-5" />, color: "pink", title: "Party Directory", desc: "Browse and manage counterparty accounts." },
            { href: "/super_admin/products", icon: <Package className="h-5 w-5" />, color: "amber", title: "Product Catalogue", desc: "Manage product inventory and pricing." },
            { href: "/super_admin/orders", icon: <Activity className="h-5 w-5" />, color: "teal", title: "System Activity", desc: "Monitor activity logs and transitions." },
          ].map(({ href, icon, color, title, desc }) => (
            <Link
              key={href + title}
              href={href}
              className={`group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-${color}-500/40 hover:bg-slate-50/50 dark:border-white/10 dark:bg-slate-900 dark:hover:border-${color}-500/40 dark:hover:bg-slate-800/40`}
            >
              <div>
                <div className={`inline-flex rounded-lg bg-${color}-50 p-2 text-${color}-600 dark:bg-${color}-950/30 dark:text-${color}-400`}>
                  {icon}
                </div>
                <h4 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
              <div className={`mt-4 flex items-center text-xs font-medium text-${color}-600 dark:text-${color}-400`}>
                Open
                <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── THREE COLUMN GRID ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Recent Orders */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Recent Orders</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Latest 6 entries across all portals</p>
            </div>
            <Link href="/super_admin/orders" className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">See all</Link>
          </div>

          <div className="overflow-x-auto p-5 pt-4">
            {ordersFetching && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            )}
            {ordersError && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Could not load orders.
              </div>
            )}
            {!ordersFetching && !ordersError && recentOrders.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No orders found.
              </div>
            )}
            {!ordersFetching && !ordersError && recentOrders.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 dark:border-white/5">
                    <th className="pb-2 font-semibold">Ref</th>
                    <th className="pb-2 font-semibold">Party</th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                    <th className="pb-2 font-semibold text-center">Priority</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60 dark:divide-white/5">
                  {recentOrders.map((o: any) => {
                    const id = String(o._id || o.id || "");
                    const ref = o.order_no || id.slice(0, 10) || "—";
                    const total = Number(o.grand_total ?? o.total ?? 0);
                    const pri = o.priority || "normal";
                    const partyId = String(o.party || o.customer || "");
                    const partyName = partyNameById.get(partyId) || partyId.slice(0, 8) || "—";
                    return (
                      <tr key={id} className="hover:bg-slate-50/30 dark:hover:bg-white/[0.02]">
                        <td className="py-2.5 font-mono text-[11px] text-slate-900 dark:text-slate-100">{ref.slice(0, 12)}</td>
                        <td className="max-w-[130px] truncate py-2.5 pr-2 text-slate-800 dark:text-slate-200" title={partyName}>
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="truncate">{partyName}</span>
                            {partySraById.get(partyId) === true && (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-1 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-500/10 dark:text-emerald-400 shrink-0">
                                SRA
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {Number.isFinite(total) ? total.toFixed(2) : "0.00"}
                        </td>
                        <td className="py-2.5 text-center capitalize">
                          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${["high", "urgent"].includes(pri) ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400" : "text-slate-500"}`}>
                            {pri}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium tracking-wide ${getStatusBadgeClass(o.status)}`}>
                            {fmt(o.status)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <Link href={`/super_admin/order/${id}`} className="text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400">View</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Side Column */}
        <div className="space-y-6">

          {/* Order Distribution */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Order Distribution</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">System-wide status breakdown</p>

            <div className="mt-4">
              {kpiFetching ? (
                <div className="h-6 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : totalOrders > 0 ? (
                <div className="space-y-4">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="bg-slate-400 transition-all duration-500" style={{ width: `${draftPct}%` }} title={`Drafts: ${draftCount}`} />
                    <div className="bg-violet-500 transition-all duration-500" style={{ width: `${awaitingPct}%` }} title={`Awaiting: ${awaitingCount}`} />
                    <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${completedPct}%` }} title={`Completed: ${completedCount}`} />
                    <div className="bg-rose-500 transition-all duration-500" style={{ width: `${otherPct}%` }} title={`Other: ${otherCount}`} />
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] font-medium">
                    {[
                      { color: "bg-slate-400", label: "Drafts", count: draftCount, pct: draftPct },
                      { color: "bg-violet-500", label: "Awaiting", count: awaitingCount, pct: awaitingPct },
                      { color: "bg-emerald-500", label: "Completed", count: completedCount, pct: completedPct },
                      { color: "bg-rose-500", label: "Other/Hold", count: otherCount, pct: otherPct },
                    ].map(({ color, label, count, pct }) => (
                      <div key={label} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <span className={`h-2 w-2 rounded-full ${color} shrink-0`} />
                        <span>{label}:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 ml-auto">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-950/20 dark:text-slate-400">
                  <Info className="h-4 w-4 shrink-0" />
                  No order data available.
                </div>
              )}
            </div>
          </div>

          {/* Open Flags */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-500" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100">Active Flags</h3>
              </div>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {openFlagList.length}
              </span>
            </div>

            <div className="mt-4 max-h-72 overflow-auto">
              {flagsFetching && <p className="text-xs text-slate-500 py-2">Loading flags…</p>}
              {flagsError && <p className="text-xs text-rose-600 py-2">Could not load flags.</p>}
              {!flagsFetching && !flagsError && openFlagList.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No active flags.</div>
              )}
              {!flagsFetching && !flagsError && openFlagList.length > 0 && (
                <ul className="space-y-3">
                  {openFlagList.map((flag: any, idx: number) => {
                    const fId = flag._id || flag.id || String(idx);
                    const orderId = String(flag.order || "");
                    const orderNo = orderNoById.get(orderId) || `ID: ${orderId.slice(0, 8)}`;
                    const urlPath = `/super_admin/order/${orderId}`;
                    return (
                      <li key={fId} className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-slate-950/50">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider capitalize ${getSeverityBadgeClass(flag.severity)}`}>
                            {flag.severity || "medium"}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400">{fmt(flag.flag_type)}</span>
                        </div>
                        <h4 className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">{flag.title}</h4>
                        <div className="mt-2 flex items-center justify-between text-[10px] border-t border-slate-100/60 pt-2 dark:border-white/5">
                          <span className="text-slate-500">Order: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{orderNo}</span></span>
                          <Link href={urlPath} className="inline-flex items-center gap-1 text-violet-600 hover:underline dark:text-violet-400 font-medium">
                            View <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── BOTTOM GRID: Users + Dept Breakdown ────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Recent Users */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100">System Users</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Last 5 user accounts</p>
            </div>
            <Link href="/super_admin/users" className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">Manage</Link>
          </div>
          <div className="p-5">
            {usersFetching ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : recentUsers.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No users found.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {recentUsers.map((u: any) => {
                  const uid = String(u._id || u.id || "");
                  return (
                    <li key={uid} className="flex items-center gap-3 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        {(u.name || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{u.name || "—"}</p>
                        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{u.email || "—"}</p>
                      </div>
                      <DeptBadge dept={u.department || "unknown"} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Dept Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <h3 className="font-bold text-slate-900 dark:text-slate-100">Department Breakdown</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">User distribution across departments</p>
          <div className="mt-5 space-y-4">
            {usersFetching ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : Object.keys(deptBreakdown).length === 0 ? (
              <p className="py-4 text-sm text-slate-500">No data.</p>
            ) : (
              Object.entries(deptBreakdown).sort((a, b) => b[1] - a[1]).map(([dept, count]) => {
                const maxCount = Math.max(...Object.values(deptBreakdown));
                const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const barColor = deptColors[dept] ?? "bg-slate-400";
                return (
                  <div key={dept}>
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <DeptBadge dept={dept} />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{count} user{count !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full ${barColor} transition-all duration-500 rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
