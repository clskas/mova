import { authHeaders, getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Enregistre l'abonnement Web Push côté serveur (portail location). */
export async function registerPartnerWebPush(appFlavor: "restaurant" | "rental_partner") {
  if (typeof window === "undefined" || !getToken()) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const keyRes = await fetch(`${API_BASE}/api/notifications/push/vapid-public-key`);
    if (!keyRes.ok) return;
    const { publicKey } = (await keyRes.json()) as { publicKey?: string | null };
    if (!publicKey) return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await fetch(`${API_BASE}/api/notifications/push-tokens`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        token: JSON.stringify(subscription.toJSON()),
        platform: "web",
        appFlavor,
      }),
    });
  } catch {
    /* push non disponible */
  }
}
