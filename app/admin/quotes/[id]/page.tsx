import { sql } from "@vercel/postgres";
import Link from "next/link";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Quote = {
  id: string;
  created_at: string;
  status: string;
  category: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  photo_urls: any;
  assessment: any;
  estimate: any;
  preview_image_data_url: string | null;
  preview_error: string | null;
  email_sent: boolean;
  email_id: string | null;
  email_error: string | null;
  receipt_sent: boolean;
  receipt_error: string | null;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function money(n: any) {
  const x = Number(n ?? 0);
  return x ? `$${x}` : "—";
}

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;

  const { rows } = await sql<Quote>`
    select
      id,
      created_at,
      status,
      category,
      name,
      email,
      phone,
      notes,
      photo_urls,
      assessment,
      estimate,
      preview_image_data_url,
      preview_error,
      email_sent,
      email_id,
      email_error,
      receipt_sent,
      receipt_error
    from quotes
    where id = ${id}::uuid
    limit 1
  `;

  const q = rows[0];
  if (!q) return notFound();

  const photos: string[] = Array.isArray(q.photo_urls)
    ? q.photo_urls
    : Array.isArray(q.photo_urls?.urls)
    ? q.photo_urls.urls
    : Array.isArray(q.photo_urls?.photoUrls)
    ? q.photo_urls.photoUrls
    : [];

  const est = q.estimate || {};
  const low = est.totalLow ?? est.total_low;
  const high = est.totalHigh ?? est.total_high;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Quote Detail</h1>
            <div className="mt-2 text-sm text-zinc-400">
              <div><span className="text-zinc-500">ID:</span> {q.id}</div>
              <div><span className="text-zinc-500">Created:</span> {fmtDate(q.created_at)}</div>
            </div>
          </div>

          <Link
            href="/admin/quotes"
            className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-2 text-sm text-zinc-100 hover:bg-black/40"
          >
            ← Back to list
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
            <div className="text-xs text-zinc-500">Customer</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">{q.name || "—"}</div>
            <div className="mt-2 text-sm text-zinc-300">
              <div><span className="text-zinc-500">Email:</span> {q.email || "—"}</div>
              <div><span className="text-zinc-500">Phone:</span> {q.phone || "—"}</div>
              <div className="mt-2"><span className="text-zinc-500">Category:</span> {q.category}</div>
              <div><span className="text-zinc-500">Status:</span> {q.status}</div>
            </div>

            <div className="mt-4 text-xs text-zinc-500">Notes</div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
              {q.notes || "—"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
            <div className="text-xs text-zinc-500">Estimate</div>
            <div className="mt-1 text-2xl font-semibold text-zinc-100">
              {low || high ? `${money(low)} – ${money(high)}` : "—"}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                <div className="text-xs text-zinc-500">Labor</div>
                <div className="text-zinc-100 font-semibold">
                  {est.laborHours ?? est.labor_hours ?? "—"} hrs @ {money(est.laborRate ?? est.labor_rate)}
                </div>
                <div className="text-xs text-zinc-300 mt-1">
                  Subtotal: {money(est.laborSubtotal ?? est.labor_subtotal)}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                <div className="text-xs text-zinc-500">Materials</div>
                <div className="text-zinc-100 font-semibold">
                  {money(est.materialsLow ?? est.materials_low)} – {money(est.materialsHigh ?? est.materials_high)}
                </div>
                <div className="text-xs text-zinc-300 mt-1">
                  Shop min: {money(est.shopMinimum ?? est.shop_minimum)}
                </div>
              </div>
            </div>

            {Array.isArray(est.assumptions) && est.assumptions.length > 0 && (
              <div className="mt-4 text-xs text-zinc-300">
                <div className="text-zinc-500 mb-1">Assumptions</div>
                {est.assumptions.map((a: string, i: number) => (
                  <div key={i}>• {a}</div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
            <div className="text-xs text-zinc-500">Email</div>
            <div className="mt-2 text-sm text-zinc-200">
              <div><span className="text-zinc-500">To shop:</span> {q.email_sent ? "Sent ✅" : "Not sent ⚠️"}</div>
              <div><span className="text-zinc-500">Email ID:</span> {q.email_id || "—"}</div>
              <div className="mt-2"><span className="text-zinc-500">Receipt:</span> {q.receipt_sent ? "Sent ✅" : "Not sent"}</div>
              <div><span className="text-zinc-500">Errors:</span> {q.email_error || q.receipt_error || "—"}</div>
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="mt-6 rounded-2xl border border-zinc-900 bg-black/30 p-4">
          <div className="text-lg font-semibold">Photos</div>

          {photos.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-400">No photos stored.</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {photos.map((u, i) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-2xl border border-zinc-900 bg-black/30"
                >
                  <img src={u} alt={`Photo ${i + 1}`} className="w-full h-auto object-cover group-hover:opacity-95" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* AI */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
            <div className="text-lg font-semibold">AI Assessment (raw)</div>
            <pre className="mt-3 whitespace-pre-wrap text-xs text-zinc-200 bg-black/40 rounded-2xl p-3 border border-zinc-900 overflow-x-auto">
{JSON.stringify(q.assessment ?? {}, null, 2)}
            </pre>
          </div>

          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
            <div className="text-lg font-semibold">AI Restored Preview</div>
            <div className="text-xs text-zinc-400 mt-1">Concept only</div>

            {q.preview_image_data_url ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-900 bg-black/30">
                <img src={q.preview_image_data_url} alt="AI preview" className="w-full h-auto object-cover" />
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-400">
                Preview unavailable. {q.preview_error ? `(${q.preview_error})` : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
