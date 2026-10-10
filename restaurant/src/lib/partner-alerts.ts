let sharedCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
/** Préférence sticky : l’utilisateur a déjà cliqué « Activer le son » une fois. */
let prefWantsSound = false;
/** Cette session peut réellement jouer de l’audio (geste + contexte OK). */
let sessionReady = false;
let soundMuted = false;
let soundStyle: PartnerSoundStyle = "senga";
let pendingChime = false;
let toast: { title: string; body: string } | null = null;
let repeatTimer: number | null = null;
let unlockInFlight: Promise<void> | null = null;

const SOUND_PREF_KEY = "mova_restaurant_sound_pref";
const SOUND_MUTED_KEY = "mova_restaurant_sound_muted_v1";
const SOUND_STYLE_KEY = "mova_restaurant_sound_style_v1";

export type PartnerSoundStyle = "senga" | "chime";

export type PartnerAlertUi = {
  /** true si le navigateur peut jouer le son cette session */
  soundEnabled: boolean;
  /** true si une activation (clic) est encore nécessaire */
  needsUnlock: boolean;
  soundMuted: boolean;
  soundStyle: PartnerSoundStyle;
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

function readMutedPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMutedPref(muted: boolean) {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function readStylePref(): PartnerSoundStyle {
  if (typeof window === "undefined") return "senga";
  try {
    const raw = localStorage.getItem(SOUND_STYLE_KEY);
    return raw === "chime" ? "chime" : "senga";
  } catch {
    return "senga";
  }
}

function writeStylePref(style: PartnerSoundStyle) {
  try {
    localStorage.setItem(SOUND_STYLE_KEY, style);
  } catch {
    /* private mode */
  }
}

function restoreSoundPref() {
  prefWantsSound = readSoundPref();
  soundMuted = readMutedPref();
  soundStyle = readStylePref();
}

export function getPartnerAlertUi(): PartnerAlertUi {
  if (typeof window !== "undefined") restoreSoundPref();
  return {
    soundEnabled: sessionReady && !soundMuted,
    needsUnlock: !soundMuted && !sessionReady,
    soundMuted,
    soundStyle,
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

export function setPartnerSoundMuted(muted: boolean) {
  soundMuted = muted;
  writeMutedPref(muted);
  if (muted) stopRepeat();
  emitUi();
}

export function setPartnerSoundStyle(style: PartnerSoundStyle) {
  soundStyle = style === "chime" ? "chime" : "senga";
  writeStylePref(soundStyle);
  emitUi();
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
    htmlAudio = new Audio("/senga-partner-alert.wav");
    htmlAudio.preload = "auto";
    htmlAudio.setAttribute("playsinline", "true");
    (htmlAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  }
  return htmlAudio;
}

function scheduleOscillatorChime(ctx: AudioContext) {
  const notes = [1568, 1175, 784, 988];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.32, start + 0.025);
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

/** Bip sonore selon le style ; respect du mute. false = échec autoplay → bannière. */
export async function playPartnerAlertChime(): Promise<boolean> {
  if (typeof window !== "undefined") restoreSoundPref();
  if (soundMuted) return false;
  try {
    let ok = false;
    if (soundStyle === "chime") {
      ok = (await playWebAudioChime()) || (await beginHtmlChime());
    } else {
      ok = (await beginHtmlChime()) || (await playWebAudioChime());
    }
    if (ok) {
      sessionReady = true;
      emitUi();
      return true;
    }
    sessionReady = false;
    pendingChime = true;
    emitUi();
    return false;
  } catch {
    sessionReady = false;
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
  if (soundMuted) return;
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
    const preferChime = soundStyle === "chime";
    const htmlPlay = preferChime ? Promise.resolve(false) : beginHtmlChime();
    const ctx = getAudioContext();
    const resume =
      ctx?.state === "suspended" ? ctx.resume().catch(() => undefined) : Promise.resolve();

    let played = await htmlPlay;
    await resume;
    if (!played) {
      played = preferChime
        ? (await playWebAudioChime()) || (await beginHtmlChime())
        : await playWebAudioChime();
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
    if (fromBanner || soundMuted) {
      soundMuted = false;
      writeMutedPref(false);
    }

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
  // Ne pas marquer sessionReady depuis le sticky pref seul — un geste est requis.
  emitUi();

  let armed = true;
  const resumeOnGesture = () => {
    if (!armed || soundMuted) return;
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

  if (options.playSound !== false && !soundMuted) {
    void playPartnerAlertChime();
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

export function alertNewRestaurantOrder(deliveryId: string, body?: string) {
  notifyPartnerAlert({
    key: `order:${deliveryId}`,
    title: "Nouvelle commande SENGA",
    body: body ?? `Commande #${deliveryId.slice(0, 8)} à confirmer (paiement après acceptation)`,
    tag: "mova-new-order",
  });
}

export function alertRestaurantOrderPaid(deliveryId: string) {
  notifyPartnerAlert({
    key: `paid:${deliveryId}`,
    title: "Paiement reçu",
    body: `Commande #${deliveryId.slice(0, 8)} payée — vous pouvez préparer`,
    tag: "mova-order-paid",
  });
}
