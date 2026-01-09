import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const password = String(body?.password ?? "");
  const next = String(body?.next ?? "/admin/quotes");

  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not set" }, { status: 500 });
  }

  if (!password || password !== adminPw) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // In your Next build, cookies() is async
  const cookieStore = await cookies();
  cookieStore.set({
    name: "admin",
    value: "true",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.json({ ok: true, next });
}
