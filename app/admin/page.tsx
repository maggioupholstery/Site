import Link from "next/link";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(s: any) {
  return String(s ?? "").trim();
}

function fmtDate(v: any) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US");
}

function fmtMoney(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function AdminPage() {
  let quotes: any[] = [];
  let error: string | null = null;

  try {
    // ✅ Explicitly select id as "id"
    const q = await sql`
      SELECT
        id,
        created_at,
        name,
        email,
        phone,
        category,
        estimate_low,
        estimate_high,
        lead_email_sent,
        render_email_sent
      FROM quotes
      ORDER BY created_at DESC
      LIMIT 50
    `;
    quotes = q.rows ?? [];
  } catch (e: any) {
    error = e?.message || String(e);
    quotes = [];
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-400">Admin</div>
            <h1 className="text-2xl md:text-3xl font-semibold">Quotes</h1>
            <div className="mt-1 text-sm text-zinc-400">
              Latest 50 submissions
            </div>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm hover:bg-zinc-900"
          >
            ← Site
          </Link>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-900/40 bg-black/30 p-5">
            <div className="text-lg font-semibold text-red-300">
              Admin query failed
            </div>
            <div className="mt-2 text-sm text-zinc-300">{error}</div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-zinc-800 bg-black/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <div className="text-sm text-zinc-400">
              Click a row to open details
            </div>
          </div>

          <div className="divide-y divide-zinc-800">
            {quotes.length === 0 ? (
              <div className="p-5 text-sm text-zinc-400">No quotes yet.</div>
            ) : (
              quotes.map((q) => {
                const id = clean(q.id);
                const href = id ? `/admin/quotes/${encodeURIComponent(id)}` : "/admin/quotes";

                return (
                  <Link
                    key={id || Math.random()}
                    href={href}
                    className="block px-5 py-4 hover:bg-zinc-900/40 transition"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-400">
                          {fmtDate(q.created_at)}{" "}
                          <span className="text-zinc-700">•</span>{" "}
                          <span className="text-zinc-200 font-semibold">
                            {clean(q.category) || "—"}
                          </span>
                        </div>

                        <div className="mt-1 text-lg font-semibold truncate">
                          {clean(q.name) || "—"}
                        </div>

                        <div className="mt-1 text-sm text-zinc-400 truncate">
                          {clean(q.email) || "—"}{" "}
                          <span className="text-zinc-700">•</span>{" "}
                          {clean(q.phone) || "—"}
                        </div>

                        <div className="mt-2 text-xs text-zinc-500 break-all">
                          ID: {id || "—"}
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
                        <div className="text-sm text-zinc-300">
                          {fmtMoney(q.estimate_low)} – {fmtMoney(q.estimate_high)}
                        </div>

                        <div className="flex gap-2 text-xs">
                          <span className="rounded-full border border-zinc-800 bg-black/20 px-3 py-1">
                            Lead:{" "}
                            <span className="text-zinc-200 font-semibold">
                              {q.lead_email_sent === true
                                ? "sent ✅"
                                : q.lead_email_sent === false
                                ? "no ⚠️"
                                : "—"}
                            </span>
                          </span>

                          <span className="rounded-full border border-zinc-800 bg-black/20 px-3 py-1">
                            Render:{" "}
                            <span className="text-zinc-200 font-semibold">
                              {q.render_email_sent === true
                                ? "sent ✅"
                                : q.render_email_sent === false
                                ? "no ⚠️"
                                : "—"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
