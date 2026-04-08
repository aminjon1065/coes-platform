import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const securePrefixes = [
  "/dashboard",
  "/notifications",
  "/tasks",
  "/edms",
  "/gis",
  "/analytics",
  "/reporting",
  "/chat",
  "/calls",
  "/files",
  "/search",
  "/admin",
  "/settings",
  "/api/notifications",
  "/api/tasks",
  "/api/edms",
  "/api/gis",
  "/api/chat",
  "/api/calls",
  "/api/files",
  "/api/search",
  "/api/admin",
  "/api/realtime",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = Boolean(
    request.cookies.get("portal_access_token")?.value ||
      request.cookies.get("portal_refresh_token")?.value,
  );
  const hasMfaPending = Boolean(request.cookies.get("portal_mfa_token")?.value);

  // If user has a full session and tries to access /verify-mfa → dashboard
  if (pathname === "/verify-mfa" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // /verify-mfa requires a pending MFA token — redirect to login if missing
  if (pathname === "/verify-mfa" && !hasMfaPending) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const needsSession = securePrefixes.some((prefix) => pathname.startsWith(prefix));

  if (needsSession && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/verify-mfa",
    "/dashboard/:path*",
    "/notifications/:path*",
    "/tasks/:path*",
    "/edms/:path*",
    "/gis/:path*",
    "/analytics/:path*",
    "/reporting/:path*",
    "/chat/:path*",
    "/calls/:path*",
    "/files/:path*",
    "/search/:path*",
    "/admin/:path*",
    "/settings/:path*",
    "/api/auth/:path*",
    "/api/notifications/:path*",
    "/api/tasks/:path*",
    "/api/edms/:path*",
    "/api/gis/:path*",
    "/api/chat/:path*",
    "/api/calls/:path*",
    "/api/files/:path*",
    "/api/search/:path*",
    "/api/admin/:path*",
    "/api/realtime/:path*",
  ],
};
