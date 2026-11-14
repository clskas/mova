/**
 * External platforms SENGA depends on, for the super admin's control page (Admin → Plateformes
 * externes). `envAny`: the platform counts as configured on the servers when one of these
 * variables is set (only presence is ever reported, never a value).
 */
export type ExternalPlatform = {
  key: string;
  name: string;
  category: 'hosting' | 'stores' | 'payments' | 'messaging' | 'maps' | 'ai' | 'identity' | 'monitoring';
  usedFor: string;
  consoleUrl: string;
  /** Configured when any of these variables is present on a server; empty = managed elsewhere. */
  envAny: string[];
  /** Required for the platform to work (shown when missing). */
  envRequired?: string[];
  /** Where the super admin controls it inside SENGA. */
  adminControls?: { label: string; href: string }[];
  optional?: boolean;
  /** Matching row in « Hébergements & plateformes » (billing dates), by provider name. */
  vendorProvider?: string;
};

export const EXTERNAL_PLATFORMS: ExternalPlatform[] = [
  // Hosting & data
  { key: 'render', name: 'Render', category: 'hosting', usedFor: 'Hébergement des serveurs, de la base de données et des sites (API, admin, portails).', consoleUrl: 'https://dashboard.render.com', envAny: [], vendorProvider: 'Render', adminControls: [{ label: 'Mode maintenance', href: '/maintenance' }] },
  { key: 'supabase', name: 'Supabase', category: 'hosting', usedFor: 'Stockage des photos et documents (KYC, véhicules, colis, menus).', consoleUrl: 'https://supabase.com/dashboard', envAny: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], envRequired: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], vendorProvider: 'Supabase' },
  { key: 'redis', name: 'Redis', category: 'hosting', usedFor: 'Messages entre services, tâches planifiées, files d’attente.', consoleUrl: 'https://dashboard.render.com', envAny: ['REDIS_URL'], envRequired: ['REDIS_URL'] },
  { key: 'github', name: 'GitHub', category: 'hosting', usedFor: 'Code source, vérifications automatiques, mises en production, sauvegardes, suivi iOS.', consoleUrl: 'https://github.com/clskas/mova', envAny: [], vendorProvider: 'GitHub', adminControls: [{ label: 'Automatisations', href: '/automatisations' }] },
  { key: 'domain', name: 'Domaine afri-soft.com', category: 'hosting', usedFor: 'Adresses api.afri-soft.com, admin.afri-soft.com et portails partenaires.', consoleUrl: 'https://dash.cloudflare.com', envAny: [], vendorProvider: 'Registrar DNS' },
  { key: 'hub-vps', name: 'Serveur AfriSoft Pay (VPS)', category: 'hosting', usedFor: 'Hub de paiement Mobile Money et d’envoi des SMS.', consoleUrl: 'https://pay.afri-soft.com/health', envAny: ['AFRISOFT_PAY_HUB_URL', 'PAY_HUB_URL', 'AFRISOFT_SMS_HUB_URL'], vendorProvider: 'AfriSoft Pay' },
  // Stores
  { key: 'apple', name: 'Apple App Store Connect', category: 'stores', usedFor: 'Publication de SENGA et SENGA Driver sur iPhone (TestFlight, revue Apple).', consoleUrl: 'https://appstoreconnect.apple.com', envAny: [], vendorProvider: 'Apple' },
  { key: 'google-play', name: 'Google Play Console', category: 'stores', usedFor: 'Publication de SENGA et SENGA Driver sur Android.', consoleUrl: 'https://play.google.com/console', envAny: [], vendorProvider: 'Google Play' },
  // Payments
  { key: 'afrisoft-pay', name: 'AfriSoft Pay (hub)', category: 'payments', usedFor: 'Recharges et paiements Mobile Money via le hub SENGA.', consoleUrl: 'https://pay.afri-soft.com', envAny: ['AFRISOFT_PAY_HUB_URL', 'PAY_HUB_URL', 'AFRISOFT_HUB_API_KEY'], adminControls: [{ label: 'Opérateurs Mobile Money', href: '/operateurs-mm' }], vendorProvider: 'AfriSoft Pay' },
  { key: 'serdipay', name: 'SerdiPay', category: 'payments', usedFor: 'Agrégateur Mobile Money (M-Pesa, Airtel, Orange) derrière le hub.', consoleUrl: 'https://serdipay.com', envAny: ['SERDIPAY_API_ID', 'SERDIPAY_CLIENT_ID', 'SERDIPAY_MERCHANT_CODE'], adminControls: [{ label: 'Opérateurs Mobile Money', href: '/operateurs-mm' }] },
  { key: 'mpesa', name: 'M-Pesa (Vodacom) — direct', category: 'payments', usedFor: 'Connexion directe M-Pesa (si utilisée sans agrégateur).', consoleUrl: 'https://developer.vodacom.cd', envAny: ['MPESA_CONSUMER_KEY'], optional: true },
  { key: 'orange-money', name: 'Orange Money — direct', category: 'payments', usedFor: 'Connexion directe Orange Money (si utilisée sans agrégateur).', consoleUrl: 'https://developer.orange.com', envAny: ['ORANGE_MONEY_API_KEY'], optional: true },
  { key: 'airtel-money', name: 'Airtel Money — direct', category: 'payments', usedFor: 'Connexion directe Airtel Money (si utilisée sans agrégateur).', consoleUrl: 'https://developers.airtel.africa', envAny: ['AIRTEL_MONEY_CLIENT_ID'], optional: true },
  { key: 'cinetpay', name: 'CinetPay', category: 'payments', usedFor: 'Passerelle de paiement de secours.', consoleUrl: 'https://app.cinetpay.com', envAny: ['CINETPAY_SECRET_KEY'], optional: true },
  // Messaging
  { key: 'firebase', name: 'Firebase Cloud Messaging', category: 'messaging', usedFor: 'Notifications push des applications (offres, statuts, alertes).', consoleUrl: 'https://console.firebase.google.com', envAny: ['FCM_SERVICE_ACCOUNT_JSON', 'FCM_SERVICE_ACCOUNT_JSON_BASE64', 'FCM_SERVER_KEY'], envRequired: ['FCM_PROJECT_ID'], vendorProvider: 'Google Firebase' },
  { key: 'sms-hub', name: 'AfriSoft SMS (hub)', category: 'messaging', usedFor: 'Codes de connexion par SMS et SMS d’alerte.', consoleUrl: 'https://pay.afri-soft.com', envAny: ['AFRISOFT_SMS_HUB_URL', 'SERDIPAY_SMS_API_ID'], adminControls: [{ label: 'SMS des alertes SOS', href: '/alertes-sos' }], vendorProvider: 'AfriSoft SMS' },
  { key: 'africastalking', name: "Africa's Talking", category: 'messaging', usedFor: 'Fournisseur SMS (envoi et accusés de réception).', consoleUrl: 'https://account.africastalking.com', envAny: ['AFRICAS_TALKING_API_KEY'], optional: true },
  { key: 'twilio', name: 'Twilio', category: 'messaging', usedFor: 'Fournisseur SMS de secours.', consoleUrl: 'https://console.twilio.com', envAny: ['TWILIO_ACCOUNT_SID'], optional: true },
  { key: 'email', name: 'E-mail (Resend / SMTP)', category: 'messaging', usedFor: 'E-mails de code, reçus et notifications.', consoleUrl: 'https://resend.com/overview', envAny: ['RESEND_API_KEY', 'SMTP_HOST'] },
  // Maps
  { key: 'mapbox', name: 'Mapbox', category: 'maps', usedFor: 'Itinéraires et recherche d’adresses (priorité aux itinéraires Mapbox).', consoleUrl: 'https://account.mapbox.com', envAny: ['MAPBOX_ACCESS_TOKEN'], envRequired: ['MAPBOX_ACCESS_TOKEN'], vendorProvider: 'Mapbox' },
  { key: 'osm', name: 'OpenStreetMap (OSRM, Nominatim, tuiles)', category: 'maps', usedFor: 'Cartes affichées dans les apps et itinéraires / adresses de secours (gratuit).', consoleUrl: 'https://www.openstreetmap.org', envAny: ['OSRM_BASE_URL', 'NOMINATIM_BASE_URL', 'OSRM_ENABLED', 'NOMINATIM_ENABLED'], optional: true },
  // AI
  { key: 'anthropic', name: 'Anthropic (Claude)', category: 'ai', usedFor: 'Lecture des documents, contrôle anti-fraude, assistant, commande vocale, traductions.', consoleUrl: 'https://console.anthropic.com', envAny: ['ANTHROPIC_API_KEY'], adminControls: [{ label: 'Interrupteur IA', href: '/services-senga' }], vendorProvider: 'Anthropic' },
  { key: 'openai', name: 'OpenAI', category: 'ai', usedFor: 'Lecture de documents de secours (comparaison).', consoleUrl: 'https://platform.openai.com', envAny: ['OPENAI_API_KEY'], optional: true, adminControls: [{ label: 'Interrupteur IA', href: '/services-senga' }] },
  { key: 'document-ai', name: 'Google Document AI', category: 'ai', usedFor: 'Lecture des dates d’expiration des documents (comparaison).', consoleUrl: 'https://console.cloud.google.com/ai/document-ai', envAny: ['GOOGLE_DOCUMENT_AI_PROCESSOR_ID', 'GOOGLE_DOCUMENT_AI_CREDENTIALS'], optional: true },
  // Identity & sign-in
  { key: 'smile-id', name: 'Smile ID', category: 'identity', usedFor: 'Vérification d’identité des chauffeurs (document + selfie en direct).', consoleUrl: 'https://portal.usesmileid.com', envAny: ['SMILE_ID_API_KEY', 'SMILE_ID_PARTNER_ID'], optional: true, adminControls: [{ label: 'Règles plateforme (Smile ID)', href: '/regles-plateforme' }] },
  { key: 'google-signin', name: 'Connexion Google', category: 'identity', usedFor: 'Se connecter avec un compte Google dans les apps.', consoleUrl: 'https://console.cloud.google.com/apis/credentials', envAny: ['GOOGLE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_ANDROID_CLIENT_ID', 'GOOGLE_IOS_CLIENT_ID'], optional: true },
  { key: 'apple-signin', name: 'Connexion Apple', category: 'identity', usedFor: 'Se connecter avec Apple sur iPhone.', consoleUrl: 'https://developer.apple.com/account', envAny: ['APPLE_CLIENT_ID', 'APPLE_SIGN_IN_CLIENT_IDS', 'APPLE_BUNDLE_IDS'], optional: true },
  // Monitoring
  { key: 'sentry', name: 'Sentry', category: 'monitoring', usedFor: 'Remontée des erreurs des applications et des serveurs ; résumé quotidien.', consoleUrl: 'https://afrisoft-g0.sentry.io', envAny: ['SENTRY_DSN', 'SENTRY_READ_TOKEN'], adminControls: [{ label: 'Résumé Sentry', href: '/automatisations' }], vendorProvider: 'Sentry' },
];

/** Every variable name the page asks the servers about. */
export const INTEGRATION_ENV_NAMES: string[] = [
  ...new Set(EXTERNAL_PLATFORMS.flatMap((p) => [...p.envAny, ...(p.envRequired ?? [])])),
];

/** Presence of the given variables on this server (true/false only, never the value). */
export function integrationEnvPresence(names: string[] = INTEGRATION_ENV_NAMES, env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const n of names) out[n] = Boolean(env[n]?.trim());
  return out;
}

/** Status of a platform from the merged presence of all servers (pure, tested). */
export function platformStatus(p: ExternalPlatform, present: Record<string, boolean>): 'configured' | 'missing' | 'partial' | 'external' | 'unused' {
  if (p.envAny.length === 0 && !(p.envRequired ?? []).length) return 'external';
  const any = p.envAny.some((n) => present[n]);
  const missingRequired = (p.envRequired ?? []).filter((n) => !present[n]);
  if (!any && missingRequired.length === (p.envRequired ?? []).length) return p.optional ? 'unused' : 'missing';
  return missingRequired.length ? 'partial' : 'configured';
}
