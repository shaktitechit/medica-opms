/**
 * Local OS notification (system banner + OS notification sound).
 */

import { isPushSupported, registerPushServiceWorker } from "@/lib/push";

function absoluteAssetUrl(path: string): string {
  if (typeof window === "undefined") return path;
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

/** Request notification permission only — never waits on push subscribe. */
export async function enableNotificationAlerts(): Promise<
  "granted" | "denied" | "default" | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission === "granted" && isPushSupported()) {
    // Fire-and-forget — do not block the Test alert on SW/push.
    void registerPushServiceWorker().catch(() => undefined);
  }

  return permission;
}

export type LocalAlertOptions = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

export type ShowNotificationResult = {
  ok: boolean;
  method?: "Notification" | "serviceWorker";
  error?: string;
};

/** Show an OS notification with the system sound. */
export async function showLocalNotification(
  options: LocalAlertOptions
): Promise<ShowNotificationResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, error: "Notification API unavailable" };
  }

  if (Notification.permission !== "granted") {
    return {
      ok: false,
      error: `Permission is "${Notification.permission}" (need granted)`,
    };
  }

  const title = String(options.title || "Medica").trim() || "Medica";
  const body = String(options.body || "").trim();
  const icon = absoluteAssetUrl("/medica-logo.png");
  const data = { url: options.url || "/" };
  const tag = `${options.tag || "medica-alert"}-${Date.now()}`;

  const opts: NotificationOptions & {
    renotify?: boolean;
    requireInteraction?: boolean;
  } = {
    body,
    icon,
    badge: icon,
    tag,
    silent: false,
    renotify: true,
    requireInteraction: options.requireInteraction !== false,
    data,
  };

  // 1) Constructor path (works best from a click handler)
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      if (options.url) window.location.href = options.url;
      n.close();
    };
    return { ok: true, method: "Notification" };
  } catch (err) {
    console.warn("[notify] Notification() failed", err);
  }

  // 2) Service worker path
  try {
    let registration = await navigator.serviceWorker?.getRegistration("/sw.js");
    if (!registration) {
      registration = (await registerPushServiceWorker()) ?? undefined;
    }
    if (registration) {
      await navigator.serviceWorker.ready;
      await registration.showNotification(title, opts);
      return { ok: true, method: "serviceWorker" };
    }
    return { ok: false, error: "No service worker registration" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[notify] serviceWorker.showNotification failed", err);
    return { ok: false, error: message };
  }
}
