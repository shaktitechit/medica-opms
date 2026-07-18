/* Medica Web Push service worker */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Medica", body: "", data: {} };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || "Medica",
        body: parsed.body || parsed.message || "",
        data: parsed.data || {},
      };
    }
  } catch {
    try {
      const text = event.data ? event.data.text() : "";
      if (text) payload.body = text;
    } catch {
      /* ignore */
    }
  }

  const data = {
    ...payload.data,
    url: payload.data?.url || "/",
  };

  const title = String(payload.title || "Medica").trim() || "Medica";
  const body = String(payload.body || "").trim();
  // Unique tag so each push shows a fresh banner with title/body text.
  const tagBase = data.tag || data.notificationId || "push";
  const tag = `medica-${tagBase}-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/medica-logo.png",
      badge: "/medica-logo.png",
      // OS / browser default notification sound
      silent: false,
      renotify: true,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      tag,
      data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            if ("navigate" in client && url) {
              try {
                client.navigate(url);
              } catch {
                /* ignore navigate errors */
              }
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return undefined;
      })
  );
});
