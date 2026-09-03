let sharedCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let pendingChime = false;
let toast: { title: string; body: string } | null = null;
let repeatTimer: number | null = null;

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

async function playHtmlChime(): Promise<boolean> {
  const audio = getHtmlAudio();
  if (!audio) return false;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 1;
    await audio.play();
    return !audio.paused;
  } catch {
    return false;
  }
}

/** Bip sonore : fichier WAV (fiable) puis Web Audio en secours. */
export async function playPartnerAlertChime() {
  try {
    if (await playHtmlChime()) return;
    const ctx = getAudioContext();
    if (!ctx) {
      if (!audioUnlocked) pendingChime = true;
      return;
    }
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    if (ctx.state !== "running") {
      pendingChime = true;
      return;
    }
    scheduleOscillatorChime(ctx);
  } catch {
    pendingChime = true;
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
 */
export async function unlockPartnerAlerts() {
  if (typeof window === "undefined") return;
  audioUnlocked = true;

  const ctx = getAudioContext();
  if (ctx?.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }

  await playPartnerAlertChime();

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
}

/** Précharge le WAV. Le déblocage réel se fait via le bouton (geste utilisateur). */
export function initPartnerAudioUnlock() {
  if (typeof window === "undefined") return;
  getHtmlAudio();
  emitUi();
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
      /* Safari hors PWA : Notification peut exister mais échouer */
    }
  }
}

export function alertNewRestaurantOrder(deliveryId: string, body?: string) {
  notifyPartnerAlert({
    key: `order:${deliveryId}`,
    title: "Nouvelle commande SENGA",
    body: body ?? `Commande #${deliveryId.slice(0, 8)} à confirmer`,
    tag: "mova-new-order",
  });
}
