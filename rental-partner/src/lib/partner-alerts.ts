let sharedCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let pendingChime = false;
let toast: { title: string; body: string } | null = null;
let repeatTimer: number | null = null;
let unlockInFlight: Promise<void> | null = null;

const SOUND_PREF_KEY = "mova_rental_sound_pref";

export type PartnerAlertUi = {
  soundEnabled: boolean;
  toast: { title: string; body: string } | null;
};

const uiListeners = new Set<(ui: PartnerAlertUi) => void>();
const unlockListeners = new Set<() => void>();

export function getPartnerAlertUi(): PartnerAlertUi {
  return { soundEnabled: audioUnlocked, toast };
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

/** Start HTML play in the same turn as the user gesture (before other awaits). */
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
      /* ignore seek errors before metadata */
    }
    audio.muted = false;
    audio.volume = 1;
    return audio
      .play()
      .then(() => !audio.paused)
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

/** Bip sonore : fichier WAV (fiable) puis Web Audio en secours. */
export async function playPartnerAlertChime(): Promise<boolean> {
  try {
    if (await beginHtmlChime()) return true;
    if (await playWebAudioChime()) return true;
    pendingChime = true;
    return false;
  } catch {
    pendingChime = true;
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

/**
 * À appeler depuis un clic (bouton « Activer le son »).
 * Débloque l'autoplay, joue un bip de test, demande la permission de notification.
 * Ne masque la bannière que si le bip a réellement joué.
 */
export async function unlockPartnerAlerts() {
  if (typeof window === "undefined") return;
  if (unlockInFlight) {
    await unlockInFlight;
    return;
  }

  unlockInFlight = (async () => {
    const htmlPlay = beginHtmlChime();
    const ctx = getAudioContext();
    const resume =
      ctx?.state === "suspended" ? ctx.resume().catch(() => undefined) : Promise.resolve();

    let played = await htmlPlay;
    await resume;
    if (!played) {
      played = await playWebAudioChime();
    }
    if (!played) {
      emitUi();
      return;
    }

    audioUnlocked = true;
    try {
      sessionStorage.setItem(SOUND_PREF_KEY, "1");
    } catch {
      /* private mode */
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

/** Précharge le WAV. Retourne un cleanup pour le listener de geste (Strict Mode / unmount). */
export function initPartnerAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;
  getHtmlAudio();
  emitUi();

  if (audioUnlocked) return () => undefined;

  let armed = true;
  const unlockOnGesture = () => {
    if (!armed || audioUnlocked) return;
    void unlockPartnerAlerts();
  };

  window.addEventListener("pointerdown", unlockOnGesture, { capture: true });
  window.addEventListener("keydown", unlockOnGesture, { capture: true });

  return () => {
    armed = false;
    window.removeEventListener("pointerdown", unlockOnGesture, true);
    window.removeEventListener("keydown", unlockOnGesture, true);
  };
}

/** Conservé pour compat : la permission n'est demandée que dans unlockPartnerAlerts. */
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
      if (!ok && !audioUnlocked) {
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
      /* Safari hors PWA : Notification peut exister mais échouer */
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
