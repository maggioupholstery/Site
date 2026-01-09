import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

function clean(s: any) {
  return String(s ?? "").trim();
}

function isUuid(v: string) {
  // simple UUID v4-ish check (works fine for all UUIDs you’ll store)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

function fmtBool(v: any) {
  if (v === true) return "Yes ✅";
  if (v === false) return "No ⚠️";
  return "—";
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
    } catch {
      // fall through
    }
    return [x].filter(Boolean);
  }

  if (typeof x === "object") {
    // sometimes you store [{url: "..."}]
    const maybe = Array.isArray((x as any)?.files) ? (x as any).files : null;
    if (maybe) return maybe.map(String).filter(Boolean);
  }

  return [];
}

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = clean(params?.id);

  // ✅ If the URL param isn't even a UUID, treat it as not found
  if (!id || !isUuid(id)) notFound();

  let row: any = null;

  try {
    // ✅ Cast to uuid so Postgres doesn't choke on uuid=text comparisons
    const q = await sql`SELECT * FROM quotes WHERE id = ${id}::uuid LIMIT 1`;
    row = q.rows?.[0] ?? null;
  } catch (e) {
    console.error("Admin quote detail query failed:", e);
    row = null;
  }

  if (!row) notFound();

  // --- core fields ---
  const name = clean(row.name);
  const email = clean(row.email);
  const phone = clean(row.phone);
  const category = clean(row.category);
  const notes = clean(row.notes);
  const createdAt = row.created_at ?? row.createdAt ?? null;

  // --- photos / uploads (support both photo_urls and files) ---
  const photoUrls =
    toArray(row.photo_urls).length > 0 ? toArray(row.photo_urls) : toArray(row.files);

  // --- normalized AI ---
  const aiSummary = clean(row.ai_summary);
  const scope = clean(row.recommended_scope);
  const materials = clean(row.material_recommendation);
  const estLow = row.estimate_low ?? null;
  const estHigh = row.estimate_high ?? null;

  // --- email statuses (DB-first, with fallbacks) ---
  const leadEmailSent =
    row.lead_email_sent ?? row.leadEmailSent ?? row.email_sent ?? row.emailSent ?? null;

  const leadEmailId =
    row.lead_email_id ?? row.leadEmailId ?? row.email_id ?? null;

  const leadEmailError =
    row.lead_email_error ?? row.leadEmailError ?? row.email_error ?? null;

  const receiptEmailSent = row.receipt_email_sent ?? row.receiptEmailSent ?? null;
  const receiptEmailId = row.receipt_email_id ?? row.receiptEmailId ?? null;
  const receiptEmailError =
    row.receipt_email_error ?? row.receiptEmailError ?? null;

  const renderEmailSent = row.render_email_sent ?? row.renderEmailSent ?? null;
  const renderEmailId = row.render_email_id ?? row.renderEmailId ?? null;
  const renderEmailError =
    row.render_email_error ?? row.renderEmailError ?? null;

  // --- render preview fields ---
  const previewImageUrl = clean(row.preview_image_url);
  const previewImageDataUrl = clean(row.preview_image_data_url);

  const adminTitle = `Quote ${id}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-400">Admin</div>
            <h1 className="text-2xl md:text-3xl font-semibold">{adminTitle}</h1>
            <div className="mt-1 text-sm text-zinc-400">
              Created: {fmtDate(createdAt)}
            </div>
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm hover:bg-zinc-900"
          >
            ← Back
          </Link>
        </div>

        {/* Customer */}
        <div className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
          <div className="text-lg font-semibold">Customer</div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
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
                  <a className="underline" href={`mailto:${email}`}>
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
                  <a className="underline" href={`tel:${phone}`}>
                    {phone}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-zinc-400 text-sm">Notes</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{notes || "—"}</div>
          </div>
        </div>

        {/* Email Status */}
        <div className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
          <div className="text-lg font-semibold">Email Status</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-zinc-400">Shop Lead Email</div>
              <div className="mt-1 font-semibold">{fmtBool(leadEmailSent)}</div>
              {leadEmailId ? (
                <div className="mt-1 text-xs text-zinc-400">id: {String(leadEmailId)}</div>
              ) : null}
              {leadEmailError ? (
                <div className="mt-2 text-xs text-red-300">{String(leadEmailError)}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-zinc-400">Customer Receipt Email</div>
              <div className="mt-1 font-semibold">{fmtBool(receiptEmailSent)}</div>
              {receiptEmailId ? (
                <div className="mt-1 text-xs text-zinc-400">id: {String(receiptEmailId)}</div>
              ) : null}
              {receiptEmailError ? (
                <div className="mt-2 text-xs text-red-300">{String(receiptEmailError)}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-zinc-400">Shop Render Email</div>
              <div className="mt-1 font-semibold">{fmtBool(renderEmailSent)}</div>
              {renderEmailId ? (
                <div className="mt-1 text-xs text-zinc-400">id: {String(renderEmailId)}</div>
              ) : null}
              {renderEmailError ? (
                <div className="mt-2 text-xs text-red-300">{String(renderEmailError)}</div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Estimate / AI */}
        <div className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
          <div className="text-lg font-semibold">Estimate + AI</div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-zinc-400">Estimate Low</div>
              <div className="mt-1 font-semibold">
                {estLow != null ? `$${Number(estLow)}` : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-zinc-400">Estimate High</div>
              <div className="mt-1 font-semibold">
                {estHigh != null ? `$${Number(estHigh)}` : "—"}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm">
            <div className="text-zinc-400">AI Summary</div>
            <div className="mt-1">{aiSummary || "—"}</div>
          </div>

          <div className="mt-4 text-sm">
            <div className="text-zinc-400">Recommended Scope</div>
            <div className="mt-1">{scope || "—"}</div>
          </div>

          <div className="mt-4 text-sm">
            <div className="text-zinc-400">Material Suggestions</div>
            <div className="mt-1">{materials || "—"}</div>
          </div>
        </div>

        {/* Photos */}
        <div className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
          <div className="text-lg font-semibold">Submitted Photos</div>
          {photoUrls.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {photoUrls.map((u, i) => (
                <li key={i}>
                  <a className="underline" href={u} target="_blank" rel="noreferrer">
                    Photo {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-sm text-zinc-400">—</div>
          )}
        </div>

        {/* Render Preview */}
        <div className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
          <div className="text-lg font-semibold">Render Preview</div>

          {previewImageUrl ? (
            <div className="mt-3">
              <a
                className="underline text-sm"
                href={previewImageUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open render URL
              </a>
              <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800">
                <img src={previewImageUrl} alt="Render preview" className="w-full h-auto" />
              </div>
            </div>
          ) : previewImageDataUrl ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800">
              <img src={previewImageDataUrl} alt="Render preview" className="w-full h-auto" />
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-400">No render saved yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
