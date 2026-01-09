import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Allow the login page to be accessed
  if (url.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const cookieName = "mu_admin";
  const cookie = req.cookies.get(cookieName)?.value || "";

  // If already authed, allow
  if (cookie === "1") return NextResponse.next();

  // Otherwise force login
  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", url.pathname);
  return NextResponse.redirect(loginUrl);
}
