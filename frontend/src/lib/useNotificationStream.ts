/**
 * useNotificationStream
 *
 * Opens a Server-Sent Events connection to `/api/notifications/stream`.
 * When the server pushes a `notification` event, it calls `onNew()` directly
 * so the caller can trigger a refetch immediately.
 *
 * Features:
 * - Auto-reconnects with exponential back-off (up to 30 s) on disconnect / error
 * - Stops when the user logs out (no token)
 * - Cleans up properly on unmount
 */
"use client";

import { useEffect, useRef } from "react";
import { publicApiOrigin } from "@/lib/env";

const BASE_DELAY = 1_500; // ms
const MAX_DELAY = 30_000; // ms

/**
 * @param token  - Auth JWT from Redux store. Pass null/undefined when logged out.
 * @param onNew  - Callback fired whenever a new `notification` SSE event arrives.
 *                 Typically the `refetch` function from `useListNotificationsQuery`.
 */
export function useNotificationStream(
  token: string | null | undefined,
  onNew: () => void
) {
  // Keep a stable ref to onNew so the effect doesn't re-run when it changes
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  });

  const esRef = useRef<EventSource | null>(null);
  const retryDelay = useRef(BASE_DELAY);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;

    if (!token) {
      // No auth — close any open stream and stop
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    function connect() {
      if (unmounted.current) return;

      // EventSource cannot set custom headers, so pass token as query param.
      // The backend auth middleware reads ?token= when no Authorization header is present.
      const url = `${publicApiOrigin()}/api/notifications/stream?token=${encodeURIComponent(
        token as string
      )}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("connected", () => {
        // Successfully connected — reset back-off
        retryDelay.current = BASE_DELAY;
      });

      es.addEventListener("notification", () => {
        // Call onNew directly — triggers refetch() on the bell component immediately
        onNewRef.current();
      });

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (unmounted.current) return;

        // Exponential back-off before reconnecting
        const delay = retryDelay.current;
        retryDelay.current = Math.min(delay * 2, MAX_DELAY);
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [token]); // only re-run when token changes; onNew is stable via ref
}
