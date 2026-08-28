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
