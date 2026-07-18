/**
 * After login, register the service worker and POST the push subscription
 * to `/api/subscribe` so the backend can call web-push.sendNotification later.
 *
 * Note: browsers often block Notification.requestPermission() without a user
 * gesture. If permission is still "default", we only register the SW and wait
 * until the user enables alerts (see AdminOverview banner).
 */
"use client";

import { useEffect, useRef } from "react";

import {
  ensurePushSubscription,
  isPushSupported,
  registerPushServiceWorker,
} from "@/lib/push";
import { publicVapidKey } from "@/lib/env";
import {
  useLazyGetVapidPublicKeyQuery,
  useSubscribePushMutation,
} from "@/store/api";

/**
 * @param token - Auth JWT. When present, attempts push subscribe once per session.
 */
export function usePushSubscription(token: string | null | undefined) {
  const attempted = useRef(false);
  const [fetchVapidKey] = useLazyGetVapidPublicKeyQuery();
  const [subscribePush] = useSubscribePushMutation();

  useEffect(() => {
    if (!token || !isPushSupported()) {
      attempted.current = false;
      return;
    }
    if (attempted.current) return;
    attempted.current = true;

    let cancelled = false;

    (async () => {
      try {
        await registerPushServiceWorker();

        // Only auto-subscribe when permission was already granted (no prompt).
        if (Notification.permission !== "granted") return;

        let vapidKey = publicVapidKey();
        if (!vapidKey) {
          const result = await fetchVapidKey().unwrap();
          vapidKey = result.publicKey || "";
        }
        if (!vapidKey || cancelled) return;

        const subscription = await ensurePushSubscription(vapidKey);
        if (!subscription || cancelled) return;

        await subscribePush(subscription).unwrap();
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[push] subscribe skipped", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, fetchVapidKey, subscribePush]);
}
