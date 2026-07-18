"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatchTabAlertOverride } from "./DispatchTabAlert";
import DispatchOverviewWidgets from "./components/DispatchOverviewWidgets";
import {
  buildPendingReturnOrderIds,
  computeDispatchOrderStats,
} from "./dispatchOrderUtils";
import {
  useGetDashboardDispatchQuery,
  useListOrdersQuery,
  useListOrderReturnsQuery,
  useNotifyPushMutation,
  useSubscribePushMutation,
} from "@/store/api";
import {
  enableNotificationAlerts,
  showLocalNotification,
} from "@/lib/notificationAlert";
import { ensurePushSubscription } from "@/lib/push";
import { publicVapidKey } from "@/lib/env";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/store/hooks";
import { OverviewFlagsWidget } from "@/components/portal/shared/OverviewFlagsWidget";
import { pickOrders } from "@/components/portal/shared/pickOrders";
import { pickList } from "@/components/portal/sales/partyDisplay";
import {
  Bell,
  BellOff,
  RefreshCw,
  X,
} from "lucide-react";

const TRANSPORT_RETURN_PENDING_PUSH_INTERVAL_MS = 60_000;
const TRANSPORT_RETURN_PENDING_ALERT_URL =
  "/dispatch/orders?tab=transport_return_pending";

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export default function DispatchOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Dispatch Specialist";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardDispatchQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData, refetch: refetchReturns } = useListOrderReturnsQuery({});
  const [notifyPush] = useNotifyPushMutation();
  const [subscribePush] = useSubscribePushMutation();

  const [notifPermission, setNotifPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
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

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orders = useMemo(
    () => pickOrders(ordersData) as Record<string, unknown>[],
    [ordersData],
  );

  const orderStats = useMemo(
    () => computeDispatchOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  const pendingTransportReturnCount = orderStats.transport_return_pending.count;
  const pendingTransportReturnCountRef = useRef(pendingTransportReturnCount);
  pendingTransportReturnCountRef.current = pendingTransportReturnCount;
  const hasPendingTransportReturn = pendingTransportReturnCount > 0;

  useDispatchTabAlertOverride(pendingTransportReturnCount);

  const sendPendingReminder = async () => {
    const count = pendingTransportReturnCountRef.current;
    if (count <= 0) return;

    const title = `${count} Transport/Return Pending`;
    const body =
      count === 1
        ? "1 order is awaiting transport or return handling. Open Dispatch Orders to review."
        : `${count} orders are awaiting transport or return handling. Open Dispatch Orders to review.`;

    toast.message(title, {
      id: `transport-return-pending-${Date.now()}`,
      description: body,
      duration: 8_000,
    });

    if (typeof document !== "undefined") {
      document.title = `(${count}) Dispatch Overview`;
    }

    await showLocalNotification({
      title,
      body,
      url: TRANSPORT_RETURN_PENDING_ALERT_URL,
      tag: "transport-return-pending-reminder",
      requireInteraction: false,
    }).catch(() => undefined);

    try {
      await notifyPush({
        title,
        body,
        url: TRANSPORT_RETURN_PENDING_ALERT_URL,
        data: {
          module: "order",
          kind: "transport_return_pending_reminder",
          count,
          tag: "transport-return-pending-reminder",
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
  const refetchReturnsRef = useRef(refetchReturns);
  refetchReturnsRef.current = refetchReturns;

  // Alert immediately when pending exists, then every 60s while overview stays open.
  useEffect(() => {
    if (!hasPendingTransportReturn) {
      if (typeof document !== "undefined" && document.title.startsWith("(")) {
        document.title = "Dispatch Overview";
      }
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      void sendPendingReminderRef.current();
      void refetchOrdersRef.current();
      void refetchReturnsRef.current();
    };

    const first = window.setTimeout(tick, 1_000);
    const id = window.setInterval(
      tick,
      TRANSPORT_RETURN_PENDING_PUSH_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
      if (typeof document !== "undefined" && document.title.startsWith("(")) {
        document.title = "Dispatch Overview";
      }
    };
  }, [hasPendingTransportReturn]);

  const handleEnableAlerts = async () => {
    setEnablingAlerts(true);
    try {
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

      const count = pendingTransportReturnCountRef.current;
      const title =
        count > 0 ? `${count} Transport/Return Pending` : "Medica test alert";
      const body =
        count > 0
          ? `${count} order${count === 1 ? "" : "s"} awaiting transport or return handling.`
          : "OS notifications are working. You will be alerted when transport/return orders are pending.";

      toast.success(title, { description: body, duration: 8_000 });

      const shown = await showLocalNotification({
        title,
        body,
        url: TRANSPORT_RETURN_PENDING_ALERT_URL,
        tag: "transport-return-test-alert",
        requireInteraction: true,
      });

      setLastTestAlert({
        title,
        body,
        at: new Date().toLocaleTimeString(),
        osOk: shown.ok,
        detail: shown.ok
          ? `OS notification via ${shown.method}`
          : shown.error || "OS notification failed",
      });

      if (!shown.ok) {
        toast.error(
          "In-app alert shown, but OS banner failed. Check macOS System Settings → Notifications for your browser (Banners + Sounds on).",
          { duration: 10_000 },
        );
      }

      void (async () => {
        try {
          const sub = await Promise.race([
            ensurePushSubscription(publicVapidKey()),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 4_000),
            ),
          ]);
          if (sub) await subscribePush(sub).unwrap();
        } catch {
          /* ignore */
        }
      })();
    } catch (err) {
      console.warn("[dispatch] test alert failed", err);
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

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchKpi().unwrap(),
        refetchOrders().unwrap(),
        refetchReturns().unwrap(),
      ]);
    } catch {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  const showEnableBanner =
    hasPendingTransportReturn &&
    notifPermission !== "granted" &&
    notifPermission !== "unsupported";

  return (
    <div className="space-y-8 pb-10 font-sans">
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
              (with system sound) every 60s while transport/return orders are
              pending.
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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-sans">
            Dispatch Overview
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome,{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {userName}
            </span>{" "}
            (Dispatch). Supervise outbound warehouse dispatches, driver assignments, and vehicle routes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="dispatch" variant="headerButton" />

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
              className={`h-4 w-4 text-slate-500 dark:text-slate-400 ${isAnyLoading ? "animate-spin" : ""}`}
            />
            Refresh Console
          </button>
        </div>
      </div>

      <DispatchOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />
    </div>
  );
}
