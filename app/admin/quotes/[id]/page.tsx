import Link from "next/link";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(s: any) {
  return String(s ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

function fmtDate(v: any) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US");
}

function toArray(x: any): string[] {
  if (!x) return [];
  if (Array.isArray(x)) return x.map(String).filter(Boolean);

  if (typeof x === "string") {
    try {
      const j = JSON.parse(x);
      if (Array.isArray(j)) return j.map(String).filter(Boolean);
    } catch {}
    return [x].filter(Boolean);
  }

  if (typeof x === "object") {
    try {
      const vals = Object.values(x);
      return vals.map(String).filter(Boolean);
    } catch {}
  }

  return [];
}

function fmtBool(v: any) {
  if (v === true) return "Sent ✅";
  if (v === false) return "Not sent ⚠️";
  return "—";
}

export default async function AdminQuoteDetailPage(props: any) {
  // Handle Next 15+ async params
  const resolvedParams =
    props?.params && typeof props.params?.then === "function"
      ? await props.params
      : props?.params;

  const id = clean(resolvedParams?.id);

  let row: any = null;

  if (id && isUuid(id)) {
    try {
      const q = await sql`SELECT * FROM quotes WHERE id = ${id}::uuid LIMIT 1`;
      row = q.rows?.[0] ?? null;
    } catch {
      row = null;
    }
  }

  const name = clean(row?.name);
  const email = clean(row?.email);
  const phone = clean(row?.phone);
  const category = clean(row?.category);
  const notes = clean(row?.notes);
  const createdAt = row?.created_at ?? null;

  const photoUrls =
    toArray(row?.photo_urls).length > 0
      ? toArray(row?.photo_urls)
      : toArray(row?.files);

  const aiSummary = clean(row?.ai_summary);
  const scope = clean(row?.recommended_scope);
  const materials = clean(row?.material_recommendation);

  const estLow = row?.estimate_low ?? null;
  const estHigh = row?.estimate_high ?? null;

  const leadEmailSent =
    row?.lead_email_sent ?? row?.leadEmailSent ?? row?.email_sent ?? null;

  const receiptEmailSent =
    row?.receipt_email_sent ?? row?.receiptEmailSent ?? null;

  const renderEmailSent =
    row?.render_email_sent ?? row?.renderEmailSent ?? null;

  const previewImageUrl = clean(row?.preview_image_url);
  const previewImageDataUrl = clean(row?.preview_image_data_url);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-zinc-400">Admin</div>
            <h1 className="text-2xl md:text-3xl font-semibold">Quote Detail</h1>
            <div className="mt-1 text-sm text-zinc-400">
              ID: <span className="text-zinc-200">{id || "—"}</span>
            </div>
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm hover:bg-zinc-900"
          >
            ← Back
          </Link>
        </div>

        {!row ? (
          <div className="rounded-2xl border border-zinc-800 bg-black/30 p-6">
            <div className="text-lg font-semibold">Quote not found</div>
            <div className="mt-2 text-sm text-zinc-400">
              This quote ID does not exist or could not be loaded.
            </div>
          </div>
        ) : (
          <>
            {/* Customer */}
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-6">
              <div className="text-lg font-semibold">Customer</div>
              <div className="mt-1 text-sm text-zinc-400">
                Created: {fmtDate(createdAt)}
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-400">Name</div>
                  <div>{name || "—"}</div>
                </div>
                <div>
                  <div className="text-zinc-400">Category</div>
                  <div>{category || "—"}</div>
                </div>
                <div>
                  <div className="text-zinc-400">Email</div>
                  <div>
                    {email ? (
                      <a href={`mailto:${email}`} className="underline">
                        {email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Phone</div>
                  <div>
                    {phone ? (
                      <a href={`tel:${phone}`} className="underline">
                        {phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              {notes && (
                <div className="mt-4">
                  <div className="text-zinc-400 text-sm">Notes</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm">{notes}</div>
                </div>
              )}
            </div>

            {/* Email Status */}
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-6">
              <div className="text-lg font-semibold">Email Status</div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                  <div className="text-zinc-400">Shop Lead</div>
                  <div className="mt-1 font-semibold">{fmtBool(leadEmailSent)}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                  <div className="text-zinc-400">Customer Receipt</div>
                  <div className="mt-1 font-semibold">{fmtBool(receiptEmailSent)}</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                  <div className="text-zinc-400">Shop Render</div>
                  <div className="mt-1 font-semibold">{fmtBool(renderEmailSent)}</div>
                </div>
              </div>
            </div>

            {/* Estimate + AI */}
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-6">
              <div className="text-lg font-semibold">Estimate & AI</div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-400">Estimate Low</div>
                  <div className="text-lg font-semibold">
                    {estLow != null ? `$${Number(estLow)}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Estimate High</div>
                  <div className="text-lg font-semibold">
                    {estHigh != null ? `$${Number(estHigh)}` : "—"}
                  </div>
                </div>
              </div>

              {aiSummary && (
                <div className="mt-4 text-sm">
                  <div className="text-zinc-400">AI Summary</div>
                  <div>{aiSummary}</div>
                </div>
              )}

              {scope && (
                <div className="mt-4 text-sm">
                  <div className="text-zinc-400">Recommended Scope</div>
                  <div>{scope}</div>
                </div>
              )}

              {materials && (
                <div className="mt-4 text-sm">
                  <div className="text-zinc-400">Material Suggestions</div>
                  <div>{materials}</div>
                </div>
              )}
            </div>

            {/* Submitted Photos */}
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-6">
              <div className="text-lg font-semibold">Submitted Photos</div>

              {photoUrls.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {photoUrls.map((url, i) => (
                    <div
                      key={i}
                      className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/20"
                    >
                      <img
                        src={url}
                        alt={`Submitted photo ${i + 1}`}
                        className="w-full h-64 object-cover"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-400">No photos uploaded.</div>
              )}
            </div>

            {/* Render Preview */}
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-6">
              <div className="text-lg font-semibold">Concept Render</div>

              {previewImageUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
                  <img
                    src={previewImageUrl}
                    alt="Concept render"
                    className="w-full h-auto"
                  />
                </div>
              ) : previewImageDataUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800">
                  <img
                    src={previewImageDataUrl}
                    alt="Concept render"
                    className="w-full h-auto"
                  />
                </div>
              ) : (
                <div className="mt-2 text-sm text-zinc-400">
                  No render generated yet.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
