/**
 * The addresses allowed to sign in.
 *
 * This is a shared two-person demo, not a multi-tenant product: both accounts
 * are members of one portfolio (`portfolio_members` + the member-scoped RLS
 * policies), so each of them sees the same data. That is why the list is
 * pinned here rather than left open.
 *
 * Two other layers back this up, because a constant in client code is a
 * convenience and not a control:
 *   - Supabase has `disable_signup: true`, so no new user can be created at all
 *     (allowed users are pre-created by an admin).
 *   - `src/middleware.ts` re-checks the signed-in address on every request and
 *     signs out anything else, so a session obtained some other way still
 *     cannot browse.
 */
export const ALLOWED_EMAILS = [
  'royiargamanx@gmail.com',
  'shaiovadia25@gmail.com',
];

export const isAllowedEmail = (email: string | null | undefined) =>
  ALLOWED_EMAILS.includes((email ?? '').trim().toLowerCase());

/**
 * Addresses that may sign in, but land on the "we're renovating" screen instead
 * of the app.
 *
 * The demo portfolio is in the system while it is still being shaped, and Shai
 * should meet a friendly note rather than data that is about to change under
 * him. Removing his address from this list is the only step needed to hand the
 * system over — he keeps his account, his session and his place in
 * `portfolio_members` the whole time.
 *
 * Enforced in three places, because one of them is client code:
 *   - the login form does not even send a code, so no email is wasted
 *   - `src/middleware.ts` sends every request to /maintenance, which also
 *     covers a session that was already signed in
 *   - the page itself is reachable at /maintenance for anyone
 */
export const MAINTENANCE_EMAILS = [
  'shaiovadia25@gmail.com',
];

export const isInMaintenance = (email: string | null | undefined) =>
  MAINTENANCE_EMAILS.includes((email ?? '').trim().toLowerCase());
