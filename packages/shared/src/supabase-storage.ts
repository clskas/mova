/** Supabase Storage helpers — documents KYC / uploads SENGA (service role côté serveur). */

import type { EnvGetter } from './africas-talking';

export const SUPABASE_ENV_KEYS = {
  url: 'SUPABASE_URL',
  serviceRoleKey: 'SUPABASE_SERVICE_ROLE_KEY',
  uploadsBucket: 'SUPABASE_UPLOADS_BUCKET',
  kycBucket: 'SUPABASE_KYC_BUCKET',
} as const;

export function isSupabaseStorageConfigured(get: EnvGetter): boolean {
  return Boolean(get(SUPABASE_ENV_KEYS.url)?.trim() && get(SUPABASE_ENV_KEYS.serviceRoleKey)?.trim());
}

export function supabaseUploadsBucket(get: EnvGetter): string {
  return get(SUPABASE_ENV_KEYS.uploadsBucket)?.trim() || 'uploads';
}

export function supabaseKycBucket(get: EnvGetter): string {
  return get(SUPABASE_ENV_KEYS.kycBucket)?.trim() || 'kyc-docs';
}

export type SupabaseUploadResult = {
  success: boolean;
  path?: string;
  bucket?: string;
  publicUrl?: string;
  signedUrl?: string;
  message?: string;
};

/**
 * Upload binaire via Storage REST (Authorization: service_role).
 * Buckets privés : retourne une signed URL (1h) si possible.
 */
export async function supabaseUploadObject(
  get: EnvGetter,
  params: {
    bucket: string;
    objectPath: string;
    body: Buffer | Uint8Array;
    contentType: string;
    signedUrlExpiresIn?: number;
  },
): Promise<SupabaseUploadResult> {
  const url = get(SUPABASE_ENV_KEYS.url)?.trim()?.replace(/\/$/, '');
  const key = get(SUPABASE_ENV_KEYS.serviceRoleKey)?.trim();
  if (!url || !key) {
    return {
      success: false,
      message: `Supabase Storage non configuré (${SUPABASE_ENV_KEYS.url}, ${SUPABASE_ENV_KEYS.serviceRoleKey}).`,
    };
  }

  const objectPath = params.objectPath.replace(/^\/+/, '');
  const uploadUrl = `${url}/storage/v1/object/${encodeURIComponent(params.bucket)}/${objectPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': params.contentType,
        'x-upsert': 'true',
      },
      body: params.body as BodyInit,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        success: false,
        message: `Échec upload Supabase (${res.status}): ${text.slice(0, 200)}`,
      };
    }

    const expiresIn = params.signedUrlExpiresIn ?? 3600;
    const signRes = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(params.bucket)}/${objectPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    });
    const signData = (await signRes.json().catch(() => ({}))) as { signedURL?: string; signedUrl?: string };
    const signedPath = signData.signedURL ?? signData.signedUrl;
    const signedUrl = signedPath
      ? signedPath.startsWith('http')
        ? signedPath
        : `${url}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`
      : undefined;

    return {
      success: true,
      bucket: params.bucket,
      path: objectPath,
      signedUrl,
      publicUrl: `${url}/storage/v1/object/authenticated/${params.bucket}/${objectPath}`,
    };
  } catch {
    return { success: false, message: 'Supabase Storage temporairement indisponible.' };
  }
}
