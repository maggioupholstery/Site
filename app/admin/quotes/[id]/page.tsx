import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuoteDetailRow = {
  id: number;
  created_at: string;
  status: string;
  category: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  photo_urls: string[] | null;

  assessment: any;
  estimate: any;

  preview_image_data_url: string | null;
  preview_error: string | null;

  email_sent: boolean | null;
  email_error: string | null;
  email_id: string | null;

  receipt_sent: boolean | null;
  receipt_error: string | null;
};

const STATUS_OPTIONS = ["new", "contacted", "scheduled", "in_progress", "completed", "archived"] as const;

function fmtMoney(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return `$${x.toLocaleString()}`;
}

function safeText(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : "—";
}

async function updateStatus(id: number, status: string) {
  "use server";
  const normalized = String(status || "new").toLowerCase();
  const ok = STATUS_OPTIONS.includes(normalized as any) ? normalized : "new";
  await sql`update quote_requests set status = ${ok} where id = ${id}`;
}

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const idNum = Number(params.id);
  if (!Number.isFinite(idNum)) notFound();

  const { rows } = await sql<QuoteDetailRow>`
    select
      id,
      created_at,
      coalesce(status, 'new') as status,
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
      email_error,
      email_id,
      receipt_sent,
      receipt_error
    from quote_requests
    where id = ${idNum}
    limit 1
  `;

  const r = rows[0];
  if (!r) notFound();

  const created = new Date(r.created_at).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const est = r.estimate || {};
  const totalLow = est.totalLow ?? est.total_low ?? null;
  const totalHigh = est.totalHigh ?? est.total_high ?? null;

  const laborHours = est.laborHours ?? est.labor_hours ?? null;
  const laborRate = est.laborRate ?? est.labor_rate ?? null;
  const laborSubtotal = est.laborSubtotal ?? est.labor_subtotal ?? null;
  const materialsLow = est.materialsLow ?? est.materials_low ?? null;
  const materialsHigh = est.materialsHigh ?? est.materials_high ?? null;
  const shopMinimum = est.shopMinimum ?? est.shop_minimum ?? null;

  const assumptions: string[] = Array.isArray(est.assumptions) ? est.assumptions : [];

  const a = r.assessment || {};
  const materialSuggestions = String(a.material_suggestions ?? a.materialSuggestions ?? "").trim();
  const repairExplained = String(a.recommended_repair_explained ?? a.recommendedRepairExplained ?? "").trim();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-zinc-500">
              <Link href="/admin/quotes" className="hover:text-zinc-200">
                ← Back to quotes
              </Link>
            </div>
            <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">
              Quote #{r.id}
            </h1>
            <div className="mt-1 text-sm text-zinc-400">{created}</div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3">
            <div className="text-xs text-zinc-500">Status</div>

            <form
              action={async (fd) => {
                "use server";
                const next = String(fd.get("status") || "new");
                await updateStatus(r.id, next);
              }}
              className="mt-2 flex items-center gap-2"
            >
              <select
                name="status"
                defaultValue={r.status}
                className="rounded-xl border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-900"
              >
                Save
              </button>
            </form>
          </div>
        </div>

        {/* Top summary */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6">
            <div className="text-xs text-zinc-500">Customer</div>
            <div className="mt-2 text-lg font-semibold text-zinc-100">
              {safeText(r.name)}
            </div>
            <div className="mt-1 text-sm text-zinc-300">{safeText(r.phone)}</div>
            <div className="mt-1 text-sm text-zinc-300">{safeText(r.email)}</div>
            <div className="mt-4 text-xs text-zinc-500">Category</div>
            <div className="mt-1 text-sm text-zinc-200">{(r.category || "—").toUpperCase()}</div>
          </div>

          <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6">
            <div className="text-xs text-zinc-500">Estimate (AI base)</div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {fmtMoney(totalLow)} – {fmtMoney(totalHigh)}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <div className="text-xs text-zinc-400">Labor</div>
                <div className="mt-1 font-semibold text-zinc-100">
                  {safeText(laborHours)} hrs @ {fmtMoney(laborRate)}/hr
                </div>
                <div className="text-xs text-zinc-300 mt-1">Subtotal: {fmtMoney(laborSubtotal)}</div>
              </div>

              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <div className="text-xs text-zinc-400">Materials</div>
                <div className="mt-1 font-semibold text-zinc-100">
                  {fmtMoney(materialsLow)} – {fmtMoney(materialsHigh)}
                </div>
                <div className="text-xs text-zinc-300 mt-1">Based on material & scope</div>
              </div>

              <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                <div className="text-xs text-zinc-400">Shop Minimum</div>
                <div className="mt-1 font-semibold text-zinc-100">{fmtMoney(shopMinimum)}</div>
                <div className="text-xs text-zinc-300 mt-1">Applies if small repair</div>
              </div>
            </div>

            {assumptions.length > 0 && (
              <div className="mt-4 text-xs text-zinc-400">
                {assumptions.map((x, i) => (
                  <div key={i}>• {x}</div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6">
            <div className="text-xs text-zinc-500">Email status</div>

            <div className="mt-2 rounded-2xl border border-zinc-900 bg-black/30 p-4">
              <div className="text-xs text-zinc-400">Shop Email</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {r.email_sent ? "Sent ✅" : "Not sent ⚠️"}
              </div>
              {r.email_error && <div className="mt-1 text-xs text-red-300">{r.email_error}</div>}
              {r.email_id && <div className="mt-1 text-xs text-zinc-500">ID: {r.email_id}</div>}
            </div>

            <div className="mt-3 rounded-2xl border border-zinc-900 bg-black/30 p-4">
              <div className="text-xs text-zinc-400">Customer Receipt</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {r.receipt_sent ? "Sent ✅" : "Not sent ⚠️"}
              </div>
              {r.receipt_error && <div className="mt-1 text-xs text-red-300">{r.receipt_error}</div>}
            </div>

            <div className="mt-4 text-xs text-zinc-500">Customer notes</div>
            <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">
              {safeText(r.notes)}
            </div>
          </div>
        </div>

        {/* Photos + Preview */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6">
            <div className="flex items-end justify-between">
              <div className="text-lg font-semibold text-zinc-100">Uploaded Photos</div>
              <div className="text-xs text-zinc-400">{(r.photo_urls || []).length} photo(s)</div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(r.photo_urls || []).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative overflow-hidden rounded-2xl border border-zinc-900 bg-black/30"
                  style={{ aspectRatio: "4 / 3" }}
                  title="Open in new tab"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Uploaded ${i + 1}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6">
            <div className="flex items-end justify-between">
              <div className="text-lg font-semibold text-zinc-100">AI “After” Preview</div>
              <div className="text-xs text-zinc-400">Concept only</div>
            </div>

            {r.preview_image_data_url ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-900 bg-black/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.preview_image_data_url}
                  alt="AI restored preview"
                  className="w-full h-auto object-cover"
                />
              </div>
            ) : (
              <div className="mt-4 text-sm text-zinc-300">
                Preview unavailable. {r.preview_error ? `(${r.preview_error})` : ""}
              </div>
            )}
          </div>
        </div>

        {/* AI details */}
        <div className="mt-6 rounded-[2rem] border border-zinc-900 bg-zinc-950/70 p-6">
          <div className="text-lg font-semibold text-zinc-100">AI Assessment</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
              <div className="text-xs text-zinc-400">Item</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{safeText(a.item)}</div>
            </div>

            <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
              <div className="text-xs text-zinc-400">Material guess</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">{safeText(a.material_guess)}</div>
            </div>

            <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
              <div className="text-xs text-zinc-400">Recommended repair</div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {safeText(a.recommended_repair)}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-200">
            <span className="text-zinc-400">Damage:</span> {safeText(a.damage)}
          </div>

          {materialSuggestions && (
            <div className="mt-4">
              <div className="text-sm text-zinc-400">Material suggestions</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{materialSuggestions}</div>
            </div>
          )}

          {repairExplained && (
            <div className="mt-4">
              <div className="text-sm text-zinc-400">How we’d repair it</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{repairExplained}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
