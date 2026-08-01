import 'server-only';

import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase server configuration is missing.');
  }
  return { url, key };
}

function findAccessToken(
  values: ReadonlyArray<{ name: string; value: string }>,
) {
  const direct = values.find((cookie) => cookie.name === 'sb-access-token');
  if (direct?.value) return direct.value;

  // Supabase SSR stores the session as a JSON cookie, sometimes split into chunks.
  const sessionCookies = values
    .filter((cookie) => /-auth-token(?:\.\d+)?$/.test(cookie.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((cookie) => cookie.value)
    .join('');
  if (!sessionCookies) return undefined;
  try {
    const parsed = JSON.parse(sessionCookies) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string')
      return parsed[0];
    if (
      parsed &&
      typeof parsed === 'object' &&
      'access_token' in parsed &&
      typeof parsed.access_token === 'string'
    ) {
      return parsed.access_token;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const accessToken = findAccessToken(cookieStore.getAll());
  const { url, key } = getSupabaseConfig();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

export function createSupabaseClientForAccessToken(accessToken: string) {
  const { url, key } = getSupabaseConfig();
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function setAccessTokenCookie(
  accessToken: string,
  maxAge = 60 * 60,
) {
  const cookieStore = await cookies();
  cookieStore.set('sb-access-token', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
}

export { findAccessToken };
