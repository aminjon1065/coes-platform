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
  const needsSession = securePrefixes.some((prefix) => pathname.startsWith(prefix));
  const hasSession = Boolean(
    request.cookies.get("portal_access_token")?.value ||
      request.cookies.get("portal_refresh_token")?.value,
  );

  if (needsSession && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
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
