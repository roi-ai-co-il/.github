/**
 * The one address allowed to sign in.
 *
 * This is a personal demo, not a multi-tenant product: every row in the database
 * is scoped `owner = auth.uid()` and all of it belongs to a single account, so a
 * second user would sign in successfully and then see an empty application. That
 * is why the address is pinned here rather than left open.
 *
 * Two other layers back this up, because a constant in client code is a
 * convenience and not a control:
 *   - Supabase has `disable_signup: true`, so no new user can be created at all.
 *   - `middleware.ts` re-checks the signed-in address on every request and signs
 *     out anything else, so a session obtained some other way still cannot read.
 */
export const ALLOWED_EMAIL = 'royiargamanx@gmail.com';

export const isAllowedEmail = (email: string | null | undefined) =>
  (email ?? '').trim().toLowerCase() === ALLOWED_EMAIL;
