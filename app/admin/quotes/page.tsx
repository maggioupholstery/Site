import Link from "next/link";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuoteRow = {
  id: number;
  created_at: string;
  status: string;
  category: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  item: string | null;
  total_low: number | null;
  total_high: number | null;
};

function fmtMoney(n: number | null) {
  if (n === null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toLocaleString()}`;
}

function badgeClass(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "new") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  if (s === "contacted") return "bg-sky-500/15 text-sky-200 border-sky-500/30";
  if (s === "scheduled") return "bg-violet-500/15 text-violet-200 border-violet-500/30";
  if (s === "in_progress") return "bg-amber-500/15 text-amber-200 border-amber-500/30";
  if (s === "completed") return "bg-zinc-500/15 text-zinc-200 border-zinc-500/30";
  if (s === "archived") return "bg-zinc-800 text-zinc-300 border-zinc-700";
  return "bg-zinc-500/15 text-zinc-200 border-zinc-500/30";
}

export default async function AdminQuotesPage() {
  const { rows } = await sql<QuoteRow>`
    select
      id,
      created_at,
      coalesce(status, 'new') as status,
      category,
      name,
      email,
      phone,
      (assessment->>'item') as item,
      nullif((estimate->>'totalLow')::text, '')::int as total_low,
      nullif((estimate->>'totalHigh')::text, '')::int as total_high
    from quote_requests
    order by created_at desc
    limit 200
  `;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Admin • Quotes</h1>
            <p className="mt-2 text-zinc-400">
              Latest submissions stored in Postgres (most recent first).
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3">
            <div className="text-xs text-zinc-500">Rows</div>
            <div className="text-sm font-semibold text-zinc-100">{rows.length}</div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[2rem] border border-zinc-900 bg-zinc-950/70">
          <div className="grid grid-cols-12 gap-0 border-b border-zinc-900 bg-black/30 px-4 py-3 text-xs text-zinc-400">
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-3">Customer</div>
            <div className="col-span-2">Estimate</div>
            <div className="col-span-1 text-right">Open</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-10 text-zinc-400">No quotes found yet.</div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {rows.map((r) => {
                const created = new Date(r.created_at);
                const dateStr = created.toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                const estimateStr =
                  r.total_low || r.total_high
                    ? `${fmtMoney(r.total_low)} – ${fmtMoney(r.total_high)}`
                    : "—";

                const customerLine = [r.name, r.phone].filter(Boolean).join(" • ");

                return (
                  <div key={r.id} className="grid grid-cols-12 gap-0 px-4 py-4 items-center">
                    <div className="col-span-2 text-sm text-zinc-200">{dateStr}</div>

                    <div className="col-span-2">
                      <span
                        className={`inline-flex items-center rounded-xl border px-2 py-1 text-xs ${badgeClass(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div className="col-span-2 text-sm text-zinc-300">
                      {(r.category || "—").toUpperCase()}
                    </div>

                    <div className="col-span-3">
                      <div className="text-sm font-semibold text-zinc-100">
                        {customerLine || "—"}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        {(r.item || "").trim() ? r.item : r.email || "—"}
                      </div>
                    </div>

                    <div className="col-span-2 text-sm text-zinc-200">{estimateStr}</div>

                    <div className="col-span-1 text-right">
                      <Link
                        href={`/admin/quotes/${r.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-100 hover:bg-zinc-900"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-zinc-500">
          Tip: bookmark this page. Next we can add search + filters + status workflow.
        </div>
      </div>
    </div>
  );
}
