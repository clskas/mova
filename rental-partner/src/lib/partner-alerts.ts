let sharedCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
/** Sticky: user already tapped « Activer le son » once. */
let prefWantsSound = false;
/** This tab can actually play audio (gesture + context OK). */
let sessionReady = false;
let pendingChime = false;
let toast: { title: string; body: string } | null = null;
let repeatTimer: number | null = null;
let unlockInFlight: Promise<void> | null = null;

const SOUND_PREF_KEY = "mova_rental_sound_pref";

export type PartnerAlertUi = {
  soundEnabled: boolean;
  needsUnlock: boolean;
  toast: { title: string; body: string } | null;
};

const uiListeners = new Set<(ui: PartnerAlertUi) => void>();
const unlockListeners = new Set<() => void>();

function readSoundPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(SOUND_PREF_KEY) === "1") return true;
    if (sessionStorage.getItem(SOUND_PREF_KEY) === "1") {
      localStorage.setItem(SOUND_PREF_KEY, "1");
      sessionStorage.removeItem(SOUND_PREF_KEY);
      return true;
    }
  } catch {
    /* private mode */
  }
  return false;
}

function writeSoundPref() {
  try {
    localStorage.setItem(SOUND_PREF_KEY, "1");
    sessionStorage.removeItem(SOUND_PREF_KEY);
  } catch {
    /* private mode */
  }
}

function restoreSoundPref() {
  prefWantsSound = readSoundPref();
}

export function getPartnerAlertUi(): PartnerAlertUi {
  if (typeof window !== "undefined") restoreSoundPref();
  return {
    soundEnabled: sessionReady,
    needsUnlock: !sessionReady,
    toast,
  };
}

function emitUi() {
  const snapshot = getPartnerAlertUi();
  uiListeners.forEach((fn) => fn(snapshot));
}

export function subscribePartnerAlertUi(fn: (ui: PartnerAlertUi) => void) {
  uiListeners.add(fn);
  fn(getPartnerAlertUi());
  return () => {
    uiListeners.delete(fn);
  };
}

export function onPartnerAlertsUnlocked(fn: () => void) {
  unlockListeners.add(fn);
  return () => {
    unlockListeners.delete(fn);
  };
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) sharedCtx = new Ctx();
  return sharedCtx;
}

function getHtmlAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!htmlAudio) {
    htmlAudio = new Audio("/alert-chime.wav");
    htmlAudio.preload = "auto";
    htmlAudio.setAttribute("playsinline", "true");
    (htmlAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  }
  return htmlAudio;
}

function scheduleOscillatorChime(ctx: AudioContext) {
  const notes = [720, 960, 1200];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

function beginHtmlChime(): Promise<boolean> {
  const audio = getHtmlAudio();
  if (!audio) return Promise.resolve(false);
  try {
    if (audio.readyState < 2) {
      try {
        audio.load();
      } catch {
        /* ignore */
      }
    }
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    audio.muted = false;
    audio.volume = 1;
    return audio
      .play()
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

async function playWebAudioChime(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
  if (ctx.state !== "running") return false;
  scheduleOscillatorChime(ctx);
  return true;
}

export async function playPartnerAlertChime(): Promise<boolean> {
  try {
    let ok = (await beginHtmlChime()) || (await playWebAudioChime());
    if (ok) {
      sessionReady = true;
      emitUi();
      return true;
    }
    pendingChime = true;
    emitUi();
    return false;
  } catch {
    pendingChime = true;
    emitUi();
    return false;
  }
}

function stopRepeat() {
  if (repeatTimer != null && typeof window !== "undefined") {
    window.clearInterval(repeatTimer);
    repeatTimer = null;
  }
}

function startRepeat() {
  stopRepeat();
  if (typeof window === "undefined") return;
  let remaining = 8;
  repeatTimer = window.setInterval(() => {
    remaining -= 1;
    void playPartnerAlertChime();
    if (remaining <= 0) stopRepeat();
  }, 2800);
}

export function dismissPartnerToast() {
  toast = null;
  stopRepeat();
  emitUi();
}

export async function unlockPartnerAlerts(opts?: { fromBanner?: boolean }) {
  if (typeof window === "undefined") return;
  if (unlockInFlight) {
    await unlockInFlight;
    if (sessionReady || opts?.fromBanner !== true) return;
  }

  const fromBanner = opts?.fromBanner === true;

  unlockInFlight = (async () => {
    restoreSoundPref();
    const htmlPlay = beginHtmlChime();
    const ctx = getAudioContext();
    const resume =
      ctx?.state === "suspended" ? ctx.resume().catch(() => undefined) : Promise.resolve();

    let played = await htmlPlay;
    await resume;
    if (!played) {
      played = await playWebAudioChime();
    }
    const ctxReady = ctx?.state === "running";
    if (!played && !ctxReady && !fromBanner) {
      sessionReady = false;
      emitUi();
      return;
    }

    sessionReady = true;
    prefWantsSound = true;
    writeSoundPref();

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => undefined);
    }

    if (pendingChime) {
      pendingChime = false;
      window.setTimeout(() => {
        void playPartnerAlertChime();
      }, 400);
    }

    emitUi();
    unlockListeners.forEach((fn) => fn());
  })();

  try {
    await unlockInFlight;
  } finally {
    unlockInFlight = null;
  }
}

export function initPartnerAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;
  restoreSoundPref();
  getHtmlAudio();
  emitUi();

  let armed = true;
  const resumeOnGesture = () => {
    if (!armed) return;
    if (prefWantsSound && !sessionReady) {
      void unlockPartnerAlerts({ fromBanner: true });
      return;
    }
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
  };

  window.addEventListener("pointerdown", resumeOnGesture, { capture: true });
  window.addEventListener("keydown", resumeOnGesture, { capture: true });

  return () => {
    armed = false;
    window.removeEventListener("pointerdown", resumeOnGesture, true);
    window.removeEventListener("keydown", resumeOnGesture, true);
  };
}

/** Play chime when a push arrives while a tab is open (SW postMessage). */
export function bindPartnerPushSoundFromServiceWorker(): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => undefined;
  }
  const onMsg = (event: MessageEvent) => {
    const data = event.data as { type?: string; title?: string; body?: string; tag?: string } | null;
    if (!data || data.type !== "MOVA_PARTNER_ALERT") return;
    notifyPartnerAlert({
      key: `push:${data.tag ?? Date.now()}`,
      title: data.title ?? "SENGA Location",
      body: data.body ?? "Nouvelle activité",
      tag: data.tag ?? "mova-partner",
    });
  };
  navigator.serviceWorker.addEventListener("message", onMsg);
  return () => navigator.serviceWorker.removeEventListener("message", onMsg);
}

export function requestPartnerNotificationPermission() {
  /* permission demandée après clic — voir unlockPartnerAlerts */
}

const recentAlertKeys = new Set<string>();

export function notifyPartnerAlert(options: {
  key: string;
  title: string;
  body: string;
  tag?: string;
  playSound?: boolean;
}) {
  if (recentAlertKeys.has(options.key)) return;
  recentAlertKeys.add(options.key);
  setTimeout(() => recentAlertKeys.delete(options.key), 60_000);

  toast = { title: options.title, body: options.body };
  emitUi();

  if (options.playSound !== false) {
    void playPartnerAlertChime().then((ok) => {
      if (!ok && !sessionReady) {
        emitUi();
      }
    });
    startRepeat();
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(options.title, {
        body: options.body,
        tag: options.tag ?? options.key,
      });
    } catch {
      /* Safari hors PWA */
    }
  }
}

export function alertNewRentalBooking(inquiryId: string, body?: string) {
  notifyPartnerAlert({
    key: `rental:${inquiryId}`,
    title: "Nouvelle réservation SENGA",
    body: body ?? `Demande #${inquiryId.slice(0, 8)} à confirmer`,
    tag: "mova-new-rental",
  });
}
