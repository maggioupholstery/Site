import { sql } from "@vercel/postgres";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type QuoteRow = {
  id: string;
  created_at: string;
  status: string;
  category: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  estimate: any;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtMoneyRange(estimate: any) {
  const low = Number(estimate?.totalLow ?? estimate?.total_low ?? 0);
  const high = Number(estimate?.totalHigh ?? estimate?.total_high ?? 0);
  if (!low && !high) return "—";
  if (low && !high) return `$${low}`;
  return `$${low}–$${high}`;
}

export default async function AdminQuotesPage() {
  const { rows } = await sql<QuoteRow>`
    select
      id,
      created_at,
      status,
      category,
      name,
      email,
      phone,
      estimate
    from quotes
    order by created_at desc
    limit 200
  `;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Admin • Quotes</h1>
            <p className="mt-2 text-zinc-400">Latest submissions stored in Postgres (most recent first).</p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/quote"
              className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-2 text-sm text-zinc-100 hover:bg-black/40"
            >
              Go to Quote Form
            </Link>
            <Link
              href="/admin/quotes"
              className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-2 text-sm text-zinc-100 hover:bg-black/40"
            >
              Refresh
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-900 bg-black/30 p-4">
          <div className="text-sm text-zinc-300">
            Rows: <span className="font-semibold text-zinc-100">{rows.length}</span>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-900">
          <div className="grid grid-cols-12 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-300">
            <div className="col-span-3">Date</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-3">Customer</div>
            <div className="col-span-2">Estimate</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-10 text-sm text-zinc-400">No quotes found yet.</div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {rows.map((q) => (
                <Link
                  key={q.id}
                  href={`/admin/quotes/${q.id}`}
                  className="grid grid-cols-12 px-4 py-3 text-sm hover:bg-white/[0.03] transition"
                >
                  <div className="col-span-3 text-zinc-200">{fmtDate(q.created_at)}</div>
                  <div className="col-span-2 text-zinc-200">{q.status || "new"}</div>
                  <div className="col-span-2 text-zinc-200">{q.category}</div>
                  <div className="col-span-3 text-zinc-200">
                    <div className="font-semibold">{q.name || "—"}</div>
                    <div className="text-xs text-zinc-400">{q.email || q.phone || "—"}</div>
                  </div>
                  <div className="col-span-2 text-zinc-100 font-semibold">{fmtMoneyRange(q.estimate)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-zinc-500">
          Tip: Next we can add search + filters + status workflow.
        </div>
      </div>
    </div>
  );
}
