let sharedCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let pendingChime = false;
let toast: { title: string; body: string } | null = null;
let repeatTimer: number | null = null;
let unlockInFlight: Promise<void> | null = null;

const SOUND_PREF_KEY = "mova_restaurant_sound_pref";

export type PartnerAlertUi = {
  soundEnabled: boolean;
  toast: { title: string; body: string } | null;
};

const uiListeners = new Set<(ui: PartnerAlertUi) => void>();
const unlockListeners = new Set<() => void>();

function readSoundPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(SOUND_PREF_KEY) === "1") return true;
    // Migration depuis l’ancien stockage session-only.
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
  if (!audioUnlocked && readSoundPref()) {
    audioUnlocked = true;
  }
}

export function getPartnerAlertUi(): PartnerAlertUi {
  if (typeof window !== "undefined") restoreSoundPref();
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
  const notes = [880, 1175];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.28, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.34);
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
    // play() resolved = gesture accepted. Don't require !paused (some PWAs pause briefly).
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
 * `fromBanner: true` = geste explicite : on masque la bannière dès que le contexte audio reprend,
 * même si la détection du bip est floue sur certains navigateurs PWA.
 */
export async function unlockPartnerAlerts(opts?: { fromBanner?: boolean }) {
  if (typeof window === "undefined") return;
  if (unlockInFlight) {
    await unlockInFlight;
    // Le clic bannière peut arriver après un unlockInFlight déjà terminé sans succès.
    if (audioUnlocked || opts?.fromBanner !== true) return;
  }

  const fromBanner = opts?.fromBanner === true;

  unlockInFlight = (async () => {
    // Kick HTML play before awaiting AudioContext.resume — keeps the gesture chain.
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
      emitUi();
      return;
    }

    audioUnlocked = true;
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

/** Précharge le WAV. Retourne un cleanup pour le listener de geste (Strict Mode / unmount). */
export function initPartnerAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => undefined;
  restoreSoundPref();
  getHtmlAudio();
  emitUi();

  let armed = true;
  let needsResume = true;
  // Ne pas auto-unlock sur chaque geste : ça volait le clic « Activer le son »
  // (capture) et pouvait échouer sans fromBanner. Reprise AudioContext seulement.
  const resumeOnGesture = () => {
    if (!armed || !audioUnlocked || !needsResume) return;
    needsResume = false;
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
