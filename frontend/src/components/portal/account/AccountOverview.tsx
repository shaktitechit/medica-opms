"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccountTabAlertOverride } from "./AccountTabAlert";
import AccountOverviewWidgets from "./components/AccountOverviewWidgets";
import TransportPlannerStatsWidgets from "@/components/portal/shared/transportPlanner/TransportPlannerStatsWidgets";
import AccountMonthlyPerformanceChart from "./components/AccountMonthlyPerformanceChart";
import AccountPartyLeaderboard from "./components/AccountPartyLeaderboard";
import AccountProductLeaderboard from "./components/AccountProductLeaderboard";
import AccountSalesLeaderboard from "./components/AccountSalesLeaderboard";
import AccountFeaturedProductGroupSalesUserTable from "./components/AccountFeaturedProductGroupSalesUserTable";
import AccountFeaturedProductGroupFeaturedPartyTable from "./components/AccountFeaturedProductGroupFeaturedPartyTable";
import {
  buildPendingReturnOrderIds,
  computeAccountOrderStats,
} from "./accountOrderUtils";
import {
  useGetDashboardAccountQuery,
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
  RefreshCw,
  X,
} from "lucide-react";

const ACCOUNT_PENDING_PUSH_INTERVAL_MS = 300_000;
const DUE_SHEET_PENDING_ALERT_URL = "/account/orders?tab=due_sheet_pending";
const ACCOUNT_PENDING_ALERT_URL = "/account/orders?tab=pending_account_approval";
const OPEN_DISPATCH_PENDING_ALERT_URL = "/account/orders?tab=open_dispatched";

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function updateAccountDocumentTitle(
  dueSheet: number,
  account: number,
  openDispatch: number,
) {
  if (typeof document === "undefined") return;
  if (dueSheet <= 0 && account <= 0 && openDispatch <= 0) {
    document.title = "Account Overview";
    return;
  }
  const parts: string[] = [];
  if (dueSheet > 0) parts.push(`${dueSheet} DS`);
  if (account > 0) parts.push(`${account} AP`);
  if (openDispatch > 0) parts.push(`${openDispatch} OD`);
  document.title = `(${parts.join(" · ")}) Account Overview`;
}

export default function AccountOverview() {
  const user = useAppSelector((state) => state.auth.user);
  const userName =
    typeof user?.name === "string" ? user.name : "Account Specialist";

  const {
    isFetching: isKpiFetching,
    refetch: refetchKpi,
  } = useGetDashboardAccountQuery();

  const {
    data: ordersData,
    isFetching: isOrdersFetching,
    refetch: refetchOrders,
  } = useListOrdersQuery({});

  const { data: returnsData } = useListOrderReturnsQuery({});
  const { data: partiesData } = useListPartiesQuery({});
  const { data: usersData } = useListUsersQuery({ department: "sales" });
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

  const orders = useMemo(
    () => pickOrders(ordersData) as Record<string, unknown>[],
    [ordersData],
  );

  const pendingReturnOrderIds = useMemo(
    () => buildPendingReturnOrderIds(pickList(returnsData)),
    [returnsData],
  );

  const categoryOptions = useMemo(
    () => ({ pendingReturnOrderIds }),
    [pendingReturnOrderIds],
  );

  const orderStats = useMemo(
    () => computeAccountOrderStats(orders, categoryOptions),
    [orders, categoryOptions],
  );

  const pendingDueSheetCount = orderStats.due_sheet_pending.count;
  const pendingAccountCount = orderStats.pending_account_approval.count;
  const pendingOpenDispatchCount = orderStats.open_dispatched.count;

  const pendingDueSheetCountRef = useRef(pendingDueSheetCount);
  pendingDueSheetCountRef.current = pendingDueSheetCount;
  const pendingAccountCountRef = useRef(pendingAccountCount);
  pendingAccountCountRef.current = pendingAccountCount;
  const pendingOpenDispatchCountRef = useRef(pendingOpenDispatchCount);
  pendingOpenDispatchCountRef.current = pendingOpenDispatchCount;

  const hasPendingDueSheet = pendingDueSheetCount > 0;
  const hasPendingAccount = pendingAccountCount > 0;
  const hasPendingOpenDispatch = pendingOpenDispatchCount > 0;
  const hasAnyPending =
    hasPendingDueSheet || hasPendingAccount || hasPendingOpenDispatch;

  useAccountTabAlertOverride(pendingAccountCount);

  const syncDocumentTitle = () => {
    updateAccountDocumentTitle(
      pendingDueSheetCountRef.current,
      pendingAccountCountRef.current,
      pendingOpenDispatchCountRef.current,
    );
  };

  const sendDueSheetReminder = async () => {
    const count = pendingDueSheetCountRef.current;
    if (count <= 0) return;

    const title = `${count} Due Sheet Pending`;
    const body =
      count === 1
        ? "1 order needs a due sheet. Open Account Orders to review."
        : `${count} orders need a due sheet. Open Account Orders to review.`;

    toast.message(title, {
      id: `due-sheet-pending-${Date.now()}`,
      description: body,
      duration: 8_000,
    });

    syncDocumentTitle();

    await showLocalNotification({
      title,
      body,
      url: DUE_SHEET_PENDING_ALERT_URL,
      tag: "due-sheet-pending-reminder",
      requireInteraction: false,
    }).catch(() => undefined);

    try {
      await notifyPush({
        title,
        body,
        url: DUE_SHEET_PENDING_ALERT_URL,
        data: {
          module: "order",
          kind: "due_sheet_pending_reminder",
          count,
          tag: "due-sheet-pending-reminder",
        },
      }).unwrap();
    } catch {
      /* ignore if no subscription yet */
    }
  };

  const sendAccountPendingReminder = async () => {
    const count = pendingAccountCountRef.current;
    if (count <= 0) return;

    const title = `${count} Account Pending`;
    const body =
      count === 1
        ? "1 order is awaiting account approval. Open Account Orders to review."
        : `${count} orders are awaiting account approval. Open Account Orders to review.`;

    toast.message(title, {
      id: `account-pending-${Date.now()}`,
      description: body,
      duration: 8_000,
    });

    syncDocumentTitle();

    await showLocalNotification({
      title,
      body,
      url: ACCOUNT_PENDING_ALERT_URL,
      tag: "account-pending-reminder",
      requireInteraction: false,
    }).catch(() => undefined);

    try {
      await notifyPush({
        title,
        body,
        url: ACCOUNT_PENDING_ALERT_URL,
        data: {
          module: "order",
          kind: "account_pending_reminder",
          count,
          tag: "account-pending-reminder",
        },
      }).unwrap();
    } catch {
      /* ignore if no subscription yet */
    }
  };

  const sendOpenDispatchReminder = async () => {
    const count = pendingOpenDispatchCountRef.current;
    if (count <= 0) return;

    const title = `${count} Dispatch Pending`;
    const body =
      count === 1
        ? "1 order is awaiting dispatch. Open Account Orders to review."
        : `${count} orders are awaiting dispatch. Open Account Orders to review.`;

    toast.message(title, {
      id: `open-dispatch-pending-${Date.now()}`,
      description: body,
      duration: 8_000,
    });

    syncDocumentTitle();

    await showLocalNotification({
      title,
      body,
      url: OPEN_DISPATCH_PENDING_ALERT_URL,
      tag: "open-dispatch-pending-reminder",
      requireInteraction: false,
    }).catch(() => undefined);

    try {
      await notifyPush({
        title,
        body,
        url: OPEN_DISPATCH_PENDING_ALERT_URL,
        data: {
          module: "order",
          kind: "open_dispatch_pending_reminder",
          count,
          tag: "open-dispatch-pending-reminder",
        },
      }).unwrap();
    } catch {
      /* ignore if no subscription yet */
    }
  };

  const sendDueSheetReminderRef = useRef(sendDueSheetReminder);
  sendDueSheetReminderRef.current = sendDueSheetReminder;
  const sendAccountPendingReminderRef = useRef(sendAccountPendingReminder);
  sendAccountPendingReminderRef.current = sendAccountPendingReminder;
  const sendOpenDispatchReminderRef = useRef(sendOpenDispatchReminder);
  sendOpenDispatchReminderRef.current = sendOpenDispatchReminder;
  const refetchOrdersRef = useRef(refetchOrders);
  refetchOrdersRef.current = refetchOrders;

  // Separate 5-minute stream for due sheet pending
  useEffect(() => {
    if (!hasPendingDueSheet) {
      syncDocumentTitle();
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void sendDueSheetReminderRef.current();
      void refetchOrdersRef.current();
    };

    const first = window.setTimeout(tick, 1_000);
    const id = window.setInterval(tick, ACCOUNT_PENDING_PUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
      syncDocumentTitle();
    };
  }, [hasPendingDueSheet]);

  // Separate 5-minute stream for account pending
  useEffect(() => {
    if (!hasPendingAccount) {
      syncDocumentTitle();
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void sendAccountPendingReminderRef.current();
      void refetchOrdersRef.current();
    };

    const first = window.setTimeout(tick, 1_500);
    const id = window.setInterval(tick, ACCOUNT_PENDING_PUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
      syncDocumentTitle();
    };
  }, [hasPendingAccount]);

  // Separate 5-minute stream for dispatch pending
  useEffect(() => {
    if (!hasPendingOpenDispatch) {
      syncDocumentTitle();
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void sendOpenDispatchReminderRef.current();
      void refetchOrdersRef.current();
    };

    const first = window.setTimeout(tick, 2_000);
    const id = window.setInterval(tick, ACCOUNT_PENDING_PUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
      syncDocumentTitle();
    };
  }, [hasPendingOpenDispatch]);

  const handleEnableAlerts = async () => {
    setEnablingAlerts(true);
    try {
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

      const dueSheet = pendingDueSheetCountRef.current;
      const account = pendingAccountCountRef.current;
      const openDispatch = pendingOpenDispatchCountRef.current;

      const results: Array<{
        ok: boolean;
        method?: string;
        error?: string;
        soundPlayed?: boolean;
      }> = [];

      if (dueSheet > 0) {
        const title = `${dueSheet} Due Sheet Pending`;
        const body = `${dueSheet} order${dueSheet === 1 ? "" : "s"} need a due sheet.`;
        toast.success(title, { description: body, duration: 8_000 });
        results.push(
          await showLocalNotification({
            title,
            body,
            url: DUE_SHEET_PENDING_ALERT_URL,
            tag: "due-sheet-test-alert",
            requireInteraction: true,
          }),
        );
      }

      if (account > 0) {
        const title = `${account} Account Pending`;
        const body = `${account} order${account === 1 ? "" : "s"} awaiting account approval.`;
        toast.success(title, { description: body, duration: 8_000 });
        results.push(
          await showLocalNotification({
            title,
            body,
            url: ACCOUNT_PENDING_ALERT_URL,
            tag: "account-test-alert",
            requireInteraction: true,
          }),
        );
      }

      if (openDispatch > 0) {
        const title = `${openDispatch} Dispatch Pending`;
        const body = `${openDispatch} order${openDispatch === 1 ? "" : "s"} awaiting dispatch.`;
        toast.success(title, { description: body, duration: 8_000 });
        results.push(
          await showLocalNotification({
            title,
            body,
            url: OPEN_DISPATCH_PENDING_ALERT_URL,
            tag: "open-dispatch-test-alert",
            requireInteraction: true,
          }),
        );
      }

      if (dueSheet <= 0 && account <= 0 && openDispatch <= 0) {
        const title = "Medica test alert";
        const body =
          "OS notifications are working. You will be alerted for due sheet, account, and dispatch pending orders.";
        toast.success(title, { description: body, duration: 8_000 });
        results.push(
          await showLocalNotification({
            title,
            body,
            url: ACCOUNT_PENDING_ALERT_URL,
            tag: "account-test-alert",
            requireInteraction: true,
          }),
        );
      }

      const anyOk = results.some((r) => r.ok);
      const anySound = results.some((r) => r.soundPlayed);
      const detail = [
        ...results.map((r) =>
          r.ok ? `OK via ${r.method}` : r.error || "failed",
        ),
        anySound ? "sound played" : "sound blocked — click Test alert again",
      ].join(" · ");

      const hasCounts = dueSheet > 0 || account > 0 || openDispatch > 0;
      setLastTestAlert({
        title: hasCounts
          ? `Due sheet: ${dueSheet} · Account: ${account} · Dispatch Pending: ${openDispatch}`
          : "Medica test alert",
        body: hasCounts
          ? "Separate notifications were sent for each pending type that has items."
          : "Alerts are enabled for due sheet, account, and dispatch pending.",
        at: new Date().toLocaleTimeString(),
        osOk: anyOk,
        detail,
      });

      if (!anyOk) {
        toast.error(
          "In-app alert shown, but OS banner failed. Check System Settings → Notifications for your browser.",
          { duration: 10_000 },
        );
      } else if (!anySound) {
        toast.error(
          "Notification shown but sound was blocked. Click Test alert once more to unlock audio.",
          { duration: 8_000 },
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
      console.warn("[account] test alert failed", err);
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
    } catch {
      // Ignore errors
    } finally {
      setIsRefreshing(false);
    }
  };

  const isAnyLoading =
    isKpiFetching || isOrdersFetching || isRefreshing;

  const showEnableBanner =
    hasAnyPending &&
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
              Browser alerts are off. Enable them to get separate OS
              notifications every 5 minutes for due sheet, account, and dispatch
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
            Account Overview
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 font-sans">
            Welcome,{" "}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {userName}
            </span>{" "}
            (Account). Review billing clearances and dispatch handoffs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OverviewFlagsWidget currentDepartment="account" variant="headerButton" />

          <button
            type="button"
            onClick={() => void handleEnableAlerts()}
            disabled={enablingAlerts || notifPermission === "unsupported"}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title={
              notifPermission === "unsupported"
                ? "Notifications not supported"
                : notifPermission === "granted"
                  ? "Send test OS notifications"
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

      <AccountOverviewWidgets
        orders={orders}
        isOrdersFetching={isOrdersFetching}
        categoryOptions={categoryOptions}
      />

      <TransportPlannerStatsWidgets portalHome="/account" />

      <AccountMonthlyPerformanceChart
        orders={orders}
        isOrdersFetching={isOrdersFetching}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AccountProductLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <AccountPartyLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          partyNameById={partyNameById}
        />
        <AccountSalesLeaderboard
          orders={orders}
          isOrdersFetching={isOrdersFetching}
          userNameById={userNameById}
        />
      </div>

      <div className="space-y-6">
        <AccountFeaturedProductGroupSalesUserTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
        <AccountFeaturedProductGroupFeaturedPartyTable
          orders={orders}
          isOrdersFetching={isOrdersFetching}
        />
      </div>
    </div>
  );
}
