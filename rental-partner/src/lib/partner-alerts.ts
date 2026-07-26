let sharedCtx: AudioContext | null = null;
let audioUnlocked = false;
let pendingChime = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx) sharedCtx = new Ctx();
  return sharedCtx;
}

function scheduleChime(ctx: AudioContext) {
  const notes = [720, 960, 1200];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = ctx.currentTime + i * 0.15;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

/** Débloque l'audio après la première interaction utilisateur (politique autoplay). */
export function initPartnerAudioUnlock() {
  if (typeof window === "undefined" || audioUnlocked) return;
  const unlock = () => {
    audioUnlocked = true;
    const ctx = getAudioContext();
    void ctx?.resume().then(() => {
      if (pendingChime) {
        pendingChime = false;
        void playPartnerAlertChime();
      }
    });
  };
  for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(event, unlock, { once: true, passive: true });
  }
}

/** Bip sonore via Web Audio (aucun fichier requis). */
export async function playPartnerAlertChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }
    if (ctx.state !== "running") {
      if (!audioUnlocked) {
        pendingChime = true;
        return;
      }
      await ctx.resume().catch(() => undefined);
    }
    if (ctx.state !== "running") {
      pendingChime = true;
      return;
    }
    scheduleChime(ctx);
  } catch {
    /* audio indisponible */
  }
}

const recentAlertKeys = new Set<string>();

export function requestPartnerNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => undefined);
  }
}

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

  if (options.playSound !== false) {
    void playPartnerAlertChime();
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(options.title, {
      body: options.body,
      tag: options.tag ?? options.key,
    });
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
