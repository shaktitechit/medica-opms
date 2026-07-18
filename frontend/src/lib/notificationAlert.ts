/**
 * Local OS notification + reliable alert sound.
 *
 * macOS often suppresses the OS notification sound while the tab is focused,
 * so we also play an in-app chime from a persistent AudioContext unlocked on
 * the Enable / Test alert click.
 */

import { isPushSupported, registerPushServiceWorker } from "@/lib/push";

const SOUND_URL = "/notification.wav?v=alert-1";

type AudioContextCtor = typeof AudioContext;

let sharedAudioCtx: AudioContext | null = null;
let chimeBuffer: AudioBuffer | null = null;
let keepAliveOsc: OscillatorNode | null = null;
let audioUnlocked = false;
let visibilityHooked = false;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext ||
    null
  );
}

function getSharedAudioContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new Ctor();
    chimeBuffer = null;
    keepAliveOsc = null;
  }
  return sharedAudioCtx;
}

function absoluteAssetUrl(path: string): string {
  if (typeof window === "undefined") return path;
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

function hookVisibilityResume(): void {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  const resume = () => {
    const ctx = sharedAudioCtx;
    if (ctx && ctx.state === "suspended") void ctx.resume();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
  window.addEventListener("focus", resume);
}

function startKeepAlive(ctx: AudioContext): void {
  try {
    if (keepAliveOsc) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    osc.frequency.value = 1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    keepAliveOsc = osc;
  } catch {
    /* ignore */
  }
}

async function ensureChimeBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (chimeBuffer) return chimeBuffer;
  try {
    const res = await fetch(SOUND_URL, { cache: "force-cache" });
    const raw = await res.arrayBuffer();
    chimeBuffer = await ctx.decodeAudioData(raw.slice(0));
    return chimeBuffer;
  } catch {
    return null;
  }
}

function playSynthesizedChime(ctx: AudioContext): void {
  const chime = (start: number, freq: number, length = 0.16) => {
    const osc = ctx.createOscillator();
    const partial = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    partial.type = "sine";
    osc.frequency.value = freq;
    partial.frequency.value = freq * 2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain);
    partial.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    partial.start(start);
    osc.stop(start + length);
    partial.stop(start + length);
  };
  const t0 = ctx.currentTime;
  chime(t0, 1175);
  chime(t0 + 0.1, 1397);
  chime(t0 + 0.21, 1760, 0.22);
}

/**
 * Must run inside a click handler (Enable / Test alert) so later timer sounds work.
 */
export async function unlockNotificationAudio(): Promise<boolean> {
  hookVisibilityResume();
  const ctx = getSharedAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") await ctx.resume();
    startKeepAlive(ctx);
    await ensureChimeBuffer(ctx);

    // Also unlock HTMLAudioElement autoplay for this origin.
    const probe = new Audio(SOUND_URL);
    probe.volume = 0.001;
    await probe.play();
    probe.pause();
    probe.currentTime = 0;

    audioUnlocked = ctx.state === "running";
    return audioUnlocked;
  } catch {
    audioUnlocked = ctx.state === "running";
    return audioUnlocked;
  }
}

/** Play alert chime. Returns true if custom audio started. */
export async function playNotificationSound(): Promise<boolean> {
  const ctx = getSharedAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") {
      // Last-resort HTMLAudio (works mainly right after a user gesture).
      try {
        const audio = new Audio(SOUND_URL);
        await audio.play();
        return true;
      } catch {
        return false;
      }
    }

    startKeepAlive(ctx);
    const buffer = await ensureChimeBuffer(ctx);
    if (buffer) {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 1;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      audioUnlocked = true;
      return true;
    }

    playSynthesizedChime(ctx);
    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function isNotificationAudioUnlocked(): boolean {
  return audioUnlocked;
}

/** Request notification permission (+ unlock sound on this click). */
export async function enableNotificationAlerts(): Promise<
  "granted" | "denied" | "default" | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  // Unlock audio on this user gesture before any awaits that might lose it.
  void unlockNotificationAudio();

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  // Re-unlock after permission dialog (gesture chain can break).
  if (permission === "granted") {
    await unlockNotificationAudio();
    if (isPushSupported()) {
      void registerPushServiceWorker().catch(() => undefined);
    }
  }

  return permission;
}

export type LocalAlertOptions = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  /** Default true — play in-app chime (more reliable than OS sound on macOS). */
  playSound?: boolean;
};

export type ShowNotificationResult = {
  ok: boolean;
  method?: "Notification" | "serviceWorker";
  soundPlayed?: boolean;
  error?: string;
};

/** Show OS notification and play in-app alert sound. */
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

  let soundPlayed = false;
  if (options.playSound !== false) {
    soundPlayed = await playNotificationSound();
  }

  const opts: NotificationOptions & {
    renotify?: boolean;
    requireInteraction?: boolean;
  } = {
    body,
    icon,
    badge: icon,
    tag,
    // If our chime played, mute OS sound to avoid double beep.
    // If chime was blocked, let the OS try its notification sound.
    silent: soundPlayed,
    renotify: true,
    requireInteraction: options.requireInteraction !== false,
    data,
  };

  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      if (options.url) window.location.href = options.url;
      n.close();
    };
    return { ok: true, method: "Notification", soundPlayed };
  } catch (err) {
    console.warn("[notify] Notification() failed", err);
  }

  try {
    let registration = await navigator.serviceWorker?.getRegistration("/sw.js");
    if (!registration) {
      registration = (await registerPushServiceWorker()) ?? undefined;
    }
    if (registration) {
      await navigator.serviceWorker.ready;
      await registration.showNotification(title, opts);
      return { ok: true, method: "serviceWorker", soundPlayed };
    }
    return { ok: false, soundPlayed, error: "No service worker registration" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[notify] serviceWorker.showNotification failed", err);
    return { ok: false, soundPlayed, error: message };
  }
}
