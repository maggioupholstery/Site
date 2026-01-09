import Link from "next/link";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FoundFile = {
  url: string;
  name: string;
  contentType?: string;
  sourcePath?: string; // where we found it in the record (debug)
};

function isProbablyUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function stripQuery(url: string) {
  return url.split("?")[0];
}

function looksLikeImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif)$/i.test(stripQuery(url));
}

function filenameFromUrl(url: string) {
  try {
    const clean = stripQuery(url);
    const name = clean.split("/").pop() || "image";
    return decodeURIComponent(name);
  } catch {
    return url.split("/").pop() || "image";
  }
}

/**
 * Deep-scan any object/array/string for:
 * - strings that are image URLs
 * - objects with url/downloadUrl fields that are image URLs
 * - arrays of the above
 *
 * This avoids schema guessing (files vs uploads vs attachments, etc.)
 */
function extractImagesDeep(value: unknown, path = "quote", out: FoundFile[] = [], seen = new Set<any>()) {
  if (value == null) return out;

  // prevent cycles
  if (typeof value === "object") {
    if (seen.has(value)) return out;
    seen.add(value);
  }

  if (typeof value === "string") {
    if (isProbablyUrl(value) && looksLikeImageUrl(value)) {
      out.push({
        url: value,
        name: filenameFromUrl(value),
        sourcePath: path,
      });
    }
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((v, i) => extractImagesDeep(v, `${path}[${i}]`, out, seen));
    return out;
  }

  if (typeof value === "object") {
    const obj: any = value;

    // Common shapes: { url }, { downloadUrl }, { file: { url } }, Vercel Blob PutBlobResult, etc.
    const maybeUrl = obj?.url || obj?.downloadUrl || obj?.href;
    const maybeType = obj?.contentType || obj?.type;

    if (typeof maybeUrl === "string" && isProbablyUrl(maybeUrl) && looksLikeImageUrl(maybeUrl)) {
      out.push({
        url: maybeUrl,
        name: String(obj?.name || obj?.filename || filenameFromUrl(maybeUrl)),
        contentType: typeof maybeType === "string" ? maybeType : undefined,
        sourcePath: path,
      });
      // still keep scanning in case there are more
    }

    for (const [k, v] of Object.entries(obj)) {
      extractImagesDeep(v, `${path}.${k}`, out, seen);
    }

    return out;
  }

  return out;
}

function dedupeByUrl(files: FoundFile[]) {
  const map = new Map<string, FoundFile>();
  for (const f of files) {
    const key = f.url;
    if (!map.has(key)) map.set(key, f);
  }
  return Array.from(map.values());
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin")?.value === "true";

  if (!isAdmin) {
    const next = encodeURIComponent(`/admin/quotes/${id}`);
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Login required</h1>
          <p className="mt-2 text-zinc-400">Please sign in to view this quote.</p>
          <Link
            href={`/admin/login?next=${next}`}
            className="mt-6 inline-block underline text-zinc-200"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  const { rows } = await sql`
    SELECT *
    FROM quotes
    WHERE id = ${id}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <Link className="text-zinc-300 underline" href="/admin/quotes">
            ← Back
          </Link>
          <h1 className="mt-6 text-2xl font-semibold">Quote not found</h1>
          <p className="mt-2 text-zinc-400">
            ID: <span className="font-mono break-all">{id}</span>
          </p>
        </div>
      </div>
    );
  }

  const quote: any = rows[0];

  // ✅ Find images anywhere in the record
  const images = dedupeByUrl(extractImagesDeep(quote));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Quote Detail</h1>
          <Link className="text-zinc-300 underline" href="/admin/quotes">
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6 space-y-6">
          <div>
            <div className="text-sm text-zinc-400">Quote ID</div>
            <div className="font-mono text-zinc-200 break-all">{quote.id}</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-zinc-400">Name</div>
              <div className="text-zinc-100">{quote.name || "—"}</div>
            </div>
            <div>
              <div className="text-sm text-zinc-400">Category</div>
              <div className="text-zinc-100">{quote.category || "—"}</div>
            </div>
            <div>
              <div className="text-sm text-zinc-400">Email</div>
              <a
                href={quote.email ? `mailto:${quote.email}` : undefined}
                className="text-zinc-100 break-all underline"
              >
                {quote.email || "—"}
              </a>
            </div>
            <div>
              <div className="text-sm text-zinc-400">Phone</div>
              <a
                href={quote.phone ? `tel:${String(quote.phone).replace(/[^\d+]/g, "")}` : undefined}
                className="text-zinc-100 underline"
              >
                {quote.phone || "—"}
              </a>
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Notes</div>
            <div className="mt-1 whitespace-pre-wrap text-zinc-100">
              {quote.notes || "—"}
            </div>
          </div>

          {/* ✅ Submitted Images (deep scanned) */}
          <div>
            <div className="text-sm text-zinc-400">Submitted Images</div>

            {images.length === 0 ? (
              <div className="mt-2 text-sm text-zinc-500">
                No image URLs found in this record.
                <div className="mt-1 text-xs text-zinc-600">
                  If the customer uploaded images, they likely aren’t being saved into the quotes table yet.
                  Expand “Raw record” below and search for “http” or “blob”.
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {images.map((img, idx) => (
                    <a
                      key={`${img.url}-${idx}`}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group block overflow-hidden rounded-xl border border-zinc-900 bg-black/30"
                      title={img.name}
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="h-40 w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                      <div className="px-3 py-2 text-xs text-zinc-300 truncate">
                        {img.name}
                      </div>
                    </a>
                  ))}
                </div>

                {/* Optional: show where we found them */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-zinc-500">
                    Debug: where these URLs came from
                  </summary>
                  <pre className="mt-2 text-xs text-zinc-300 overflow-auto rounded-xl border border-zinc-900 bg-black/30 p-3">
                    {JSON.stringify(images.map(({ url, sourcePath }) => ({ url, sourcePath })), null, 2)}
                  </pre>
                </details>
              </>
            )}
          </div>

          {/* Debug raw row */}
          <details className="pt-2">
            <summary className="cursor-pointer text-zinc-300">Raw record</summary>
            <pre className="mt-3 text-xs text-zinc-300 overflow-auto rounded-xl border border-zinc-900 bg-black/30 p-3">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
