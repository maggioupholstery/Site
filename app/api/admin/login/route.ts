import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body: any = await req.json();
    const password = String(body?.password || "");
    const next = String(body?.next || "/admin/quotes");

    const expected = process.env.ADMIN_PASSWORD || "";
    if (!expected) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not set on the server." },
        { status: 500 }
      );
    }

    if (!password || password !== expected) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, next });

    // Cookie: "mu_admin=1"
    res.cookies.set("mu_admin", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Login failed" }, { status: 400 });
  }
}
