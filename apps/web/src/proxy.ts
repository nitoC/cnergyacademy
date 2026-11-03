import { NextResponse, type NextRequest } from 'next/server';

// Signed-out visitors are redirected before rendering. This is a UX guard
// only — the API authorises every request itself.
const PROTECTED = ['/learn', '/creator', '/admin', '/support', '/notifications', '/profile', '/checkout', '/become-a-creator'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const hasSession = request.cookies.has('academy_session') || request.cookies.has('academy_at');
  if (hasSession) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webmanifest)$).*)'],
};
