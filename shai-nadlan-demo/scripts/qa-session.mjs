/**
 * Loading the QA session, and keeping it alive.
 *
 * A Supabase access token lasts an hour, and a QA pass easily outlives one —
 * which showed up as every screen "redirecting to /login", a failure that looks
 * exactly like a broken auth layer and is not. The refresh token is used to
 * mint a fresh pair on every run and the file is rewritten, so the next run
 * starts from a valid one too.
 *
 * The tokens live in a 0600 file and are never printed or passed as arguments.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

export function projectEnv() {
  const local = readFileSync(join(root, '.env.local'), 'utf8');
  const pick = (k) => local.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))?.[1];
  const url = pick('NEXT_PUBLIC_SUPABASE_URL');
  const key = pick('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('.env.local is missing the Supabase URL or anon key');
  return { url, key, ref: new URL(url).hostname.split('.')[0] };
}

/** Returns { db, access_token, refresh_token, cookieName, cookieValue, email }. */
export async function loadSession(file) {
  const { url, key, ref } = projectEnv();
  const text = readFileSync(file, 'utf8');
  const access_token = text.match(/SUPABASE_ACCESS_TOKEN='(.*)'/)?.[1];
  const refresh_token = text.match(/SUPABASE_REFRESH_TOKEN='(.*)'/)?.[1];
  if (!access_token || !refresh_token) throw new Error(`${file} has no session in it`);

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let { data, error } = await db.auth.setSession({ access_token, refresh_token });

  // An expired access token is the normal case, not an error worth stopping for.
  if (error || !data?.session) {
    ({ data, error } = await db.auth.refreshSession({ refresh_token }));
    if (error || !data?.session) {
      throw new Error(`the session could not be refreshed (${error?.message ?? 'no session'}) — sign in again`);
    }
  }
  const s = data.session;
  if (s.access_token !== access_token) {
    writeFileSync(file,
      `export SUPABASE_ACCESS_TOKEN='${s.access_token}'\nexport SUPABASE_REFRESH_TOKEN='${s.refresh_token}'\n`,
      { mode: 0o600 });
  }

  const cookieValue = 'base64-' + Buffer.from(JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token, token_type: 'bearer',
    expires_in: s.expires_in ?? 3600,
    expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  return {
    db, email: data.user?.email ?? s.user?.email,
    access_token: s.access_token, refresh_token: s.refresh_token,
    cookieName: `sb-${ref}-auth-token`, cookieValue,
  };
}

/** The cookie to hand a browser context, on whatever host BASE points at. */
export function sessionCookie({ cookieName, cookieValue }, base) {
  return {
    name: cookieName, value: cookieValue,
    domain: new URL(base).hostname, path: '/', sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 86400,
  };
}
