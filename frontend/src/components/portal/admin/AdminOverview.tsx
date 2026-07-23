"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminTabAlertOverride } from "./AdminTabAlert";
import AdminOverviewWidgets from "./AdminOverviewWidgets";
import WorkPlannerStatsWidgets from "@/components/portal/admin/workPlanner/WorkPlannerStatsWidgets";
import AdminMonthlyPerformanceChart from "./components/AdminMonthlyPerformanceChart";
import AdminPartyLeaderboard from "./components/AdminPartyLeaderboard";
import AdminProductLeaderboard from "./components/AdminProductLeaderboard";
import AdminSalesLeaderboard from "./components/AdminSalesLeaderboard";
import FeaturedProductGroupSalesUserTable from "./components/FeaturedProductGroupSalesUserTable";
import FeaturedProductGroupFeaturedPartyTable from "./components/FeaturedProductGroupFeaturedPartyTable";
import {
  buildPendingReturnOrderIds,
  computeAdminOrderStats,
} from "./adminOrderUtils";
import {
  useGetDashboardAdminQuery,
  useListOrderReturnsQuery,
  useListOrdersQuery,
  useListPartiesQuery,
  useListUsersQuery,
  useNotifyPushMutation,
  useSubscribePushMutation,
} from "@/store/api";
import {
  enableNotificationAlerts,
  showLocalNotification,
  unlockNotificationAudio,
} from "@/lib/notificationAlert";
import { ensurePushSubscription } from "@/lib/push";
import { publicVapidKey } from "@/lib/env";
import { toast } from "@/lib/toast";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { useAppSelector } from "@/store/hooks";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import {
  buildPartyNameById,
  pickList,
} from "@/components/portal/sales/partyDisplay";
import { buildUserNameById } from "@/components/portal/shared/userDisplay";
import {
  Bell,
  BellOff,
  FilePlus,
  RefreshCw,
  X,
} from "lucide-react";

const ADMIN_PENDING_PUSH_INTERVAL_MS = 300_000;
const ADMIN_PENDING_ALERT_URL = "/admin/orders?tab=pending_admin_approval";

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export default function AdminOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "System Administrator";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardAdminQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: partiesData } = useListPartiesQuery({});
  const { data: usersData } = useListUsersQuery({ department: "sales" });
  const { data: returnsData } = useListOrderReturnsQuery({});
  const [notifyPush] = useNotifyPushMutation();
  const [subscribePush] = useSubscribePushMutation();

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [enablingAlerts, setEnablingAlerts] = useState(false);
  const [lastTestAlert, setLastTestAlert] = useState<{
    title: string;
    body: string;
    at: string;
    osOk: boolean;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    if (!notificationsSupported()) {
      setNotifPermission("unsupported");
      return;
    }
    setNotifPermission(Notification.permission);
  }, []);

  const orders = useMemo(() => pickOrders(ordersData) as any[], [ordersData]);

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orderStats = useMemo(
    () => computeAdminOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  const pendingAdminCount = orderStats.pending_admin_approval.count;
  const pendingAdminCountRef = useRef(pendingAdminCount);
  pendingAdminCountRef.current = pendingAdminCount;
  const hasPendingAdmin = pendingAdminCount > 0;

  useAdminTabAlertOverride(pendingAdminCount);

  const sendPendingReminder = async () => {
    const count = pendingAdminCountRef.current;
    if (count <= 0) return;

    // Put the count in the title — macOS often hides the body preview.
    const title = `${count} Admin Pending`;
    const body =
      count === 1
        ? "1 order is awaiting admin approval. Open Admin Orders to review."
        : `${count} orders are awaiting admin approval. Open Admin Orders to review.`;

    // Always mirror on-screen (OS banners are often suppressed while the tab is focused).
    toast.message(title, {
      id: `admin-pending-${Date.now()}`,
      description: body,
      duration: 8_000,
    });

    if (typeof document !== "undefined") {
      document.title = `(${count}) Admin Dashboard`;
    }

    // OS notification banner + system notification sound (every 5 minutes)
    await showLocalNotification({
      title,
      body,
      url: ADMIN_PENDING_ALERT_URL,
      tag: "admin-pending-reminder",
      requireInteraction: false,
    }).catch(() => undefined);

    // Best-effort Web Push (needs prior subscription; useful when tab is in background)
    try {
      await notifyPush({
        title,
        body,
        url: ADMIN_PENDING_ALERT_URL,
        data: {
          module: "order",
          kind: "admin_pending_reminder",
          count,
          tag: "admin-pending-reminder",
        },
      }).unwrap();
    } catch {
      /* ignore if no subscription yet */
    }
  };

  const sendPendingReminderRef = useRef(sendPendingReminder);
  sendPendingReminderRef.current = sendPendingReminder;
  const refetchOrdersRef = useRef(refetchOrders);
  refetchOrdersRef.current = refetchOrders;

  // Alert immediately when pending exists, then every 5 minutes while overview stays open.
  // Depend only on hasPendingAdmin — including refetchOrders was clearing the timer.
  useEffect(() => {
    if (!hasPendingAdmin) {
      if (typeof document !== "undefined" && document.title.startsWith("(")) {
        document.title = "Admin Dashboard";
      }
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      void sendPendingReminderRef.current();
      void refetchOrdersRef.current();
    };

    // First alert after a short delay so order stats finish settling.
    const first = window.setTimeout(tick, 1_000);
    const id = window.setInterval(tick, ADMIN_PENDING_PUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
      if (typeof document !== "undefined" && document.title.startsWith("(")) {
        document.title = "Admin Dashboard";
      }
    };
  }, [hasPendingAdmin]);

  const handleEnableAlerts = async () => {
    setEnablingAlerts(true);
    try {
      // Unlock sound on this click, then request permission.
      await unlockNotificationAudio();
      const result = await enableNotificationAlerts();
      setNotifPermission(result === "unsupported" ? "unsupported" : result);

      if (result !== "granted") {
        const msg =
          result === "denied"
            ? "Notifications are blocked. Allow them for this site in the browser address bar / OS Settings → Notifications."
            : "Notifications are not supported in this browser.";
        toast.error(msg);
        setLastTestAlert({
          title: "Alerts blocked",
          body: msg,
          at: new Date().toLocaleTimeString(),
          osOk: false,
          detail: `permission=${result}`,
        });
        return;
      }

      await unlockNotificationAudio();

      const count = pendingAdminCountRef.current;
      const title =
        count > 0 ? `${count} Admin Pending` : "Medica test alert";
      const body =
        count > 0
          ? `${count} order${count === 1 ? "" : "s"} awaiting admin approval.`
          : "Alerts are working. You will be notified when admin orders are pending.";

      toast.success(title, { description: body, duration: 8_000 });

      const shown = await showLocalNotification({
        title,
        body,
        url: ADMIN_PENDING_ALERT_URL,
        tag: "admin-test-alert",
        requireInteraction: true,
      });

      setLastTestAlert({
        title,
        body,
        at: new Date().toLocaleTimeString(),
        osOk: shown.ok,
        detail: [
          shown.ok ? `banner via ${shown.method}` : shown.error || "banner failed",
          shown.soundPlayed ? "sound played" : "sound blocked — click Test alert again",
        ].join(" · "),
      });

      if (!shown.ok) {
        toast.error(
          "In-app alert shown, but OS banner failed. Check System Settings → Notifications for your browser.",
          { duration: 10_000 },
        );
      } else if (!shown.soundPlayed) {
        toast.error(
          "Notification shown but sound was blocked. Click Test alert once more to unlock audio.",
          { duration: 8_000 },
        );
      }

      // 4) Background push subscribe (must never block the test alert)
      void (async () => {
        try {
          const sub = await Promise.race([
            ensurePushSubscription(publicVapidKey()),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
          ]);
          if (sub) await subscribePush(sub).unwrap();
        } catch {
          /* ignore */
        }
      })();
    } catch (err) {
      console.warn("[admin] test alert failed", err);
      toast.error("Failed to send test alert.");
      setLastTestAlert({
        title: "Test alert failed",
        body: err instanceof Error ? err.message : "Unknown error",
        at: new Date().toLocaleTimeString(),
        osOk: false,
      });
    } finally {
      setEnablingAlerts(false);
    }
  };

  const partyNameById = useMemo(
    () => buildPartyNameById(partiesData),
    [partiesData],
  );

  const userNameById = useMemo(
    () => buildUserNameById(usersData),
    [usersData],
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
      ]);
    } catch (e) {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  const showEnableBanner =
    hasPendingAdmin &&
    notifPermission !== "granted" &&
    notifPermission !== "unsupported";

  return (
    <div className="space-y-8 pb-10">
      {lastTestAlert ? (
        <div
          className={`relative rounded-xl border px-4 py-3 ${
            lastTestAlert.osOk
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
              : "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
          }`}
        >
          <button
            type="button"
            onClick={() => setLastTestAlert(null)}
            className="absolute right-3 top-3 rounded p-1 text-slate-500 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="pr-8 text-sm font-semibold text-slate-900 dark:text-slate-50">
            {lastTestAlert.title}
          </p>
          <p className="mt-1 pr-8 text-sm text-slate-700 dark:text-slate-200">
            {lastTestAlert.body}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {lastTestAlert.at}
            {lastTestAlert.detail ? ` · ${lastTestAlert.detail}` : ""}
            {lastTestAlert.osOk
              ? " · If you did not hear a sound, check OS notification settings for this browser."
              : ""}
          </p>
        </div>
      ) : null}

      {showEnableBanner ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
            <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Browser alerts are off. Enable them to get an OS notification
              (with system sound) every 5 minutes while admin orders are pending.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleEnableAlerts()}
            disabled={enablingAlerts}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
          >
            <Bell className="h-4 w-4" />
            {enablingAlerts ? "Enabling…" : "Enable alerts"}
          </button>
        </div>
      ) : null}

      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            Admin Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Welcome,{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {userName}
            </span>{" "}
            (Admin). Here is the system-wide status report for today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="admin" variant="headerButton" />

          <button
            type="button"
            onClick={() => void handleEnableAlerts()}
            disabled={enablingAlerts || notifPermission === "unsupported"}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title={
              notifPermission === "unsupported"
                ? "Notifications not supported"
                : notifPermission === "granted"
                  ? "Send a test OS notification"
                  : "Enable OS notifications"
            }
          >
            <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            {enablingAlerts
              ? "Sending…"
              : notifPermission === "granted"
                ? "Test alert"
                : "Enable alerts"}
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""
                }`}
            />
            Refresh Console
          </button>

          <Link
            href="/admin/create-order"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/10 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <FilePlus className="h-4 w-4" />
            New Order Draft
          </Link>
        </div>
      </div>

      {/* KPI METRICS WIDGETS */}
      <AdminOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <WorkPlannerStatsWidgets portalHome="/admin" />

      <AdminMonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AdminProductLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <AdminPartyLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
        />
        <AdminSalesLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
        />
      </div>

      <div className="space-y-6">
        <FeaturedProductGroupSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <FeaturedProductGroupFeaturedPartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
      </div>
    </div>
  );
}
