import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail, isInMaintenance } from '@/lib/auth-config';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session; do not run logic between client creation and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith('/login');
  const isMaintenance = request.nextUrl.pathname.startsWith('/maintenance');

  // A session for any other address is refused here, not only in the login form.
  // Every row is scoped `owner = auth.uid()` to ONE account, so another user
  // would sign in successfully and then read nothing — and a check that lives
  // only in client code is a convenience, not a control.
  if (user && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  /* An account that is on the maintenance list sees the notice and nothing
     else. Checked here rather than in the layout so it covers every route at
     once — including a session that signed in before the list existed. */
  if (user && isInMaintenance(user.email) && !isMaintenance) {
    const url = request.nextUrl.clone();
    url.pathname = '/maintenance';
    url.search = '';
    return NextResponse.redirect(url);
  }
  // Nobody else has any use for the notice.
  if (isMaintenance && (!user || !isInMaintenance(user.email))) {
    const url = request.nextUrl.clone();
    url.pathname = user ? '/' : '/login';
    return NextResponse.redirect(url);
  }

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Everything except API routes (they answer 401 themselves — a login
    // redirect is wrong for JSON callers) and static files: images, scripts,
    // the web manifest and fonts must never bounce to /login.
    '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|js|css|json|webmanifest|txt|woff2?)$).*)',
  ],
};
