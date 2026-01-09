import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Protect admin pages except /admin/login
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const isAdmin = req.cookies.get("admin")?.value === "true";

    if (!isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
