import Link from "next/link";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FileItem =
  | string
  | {
      url?: string;
      downloadUrl?: string;
      name?: string;
      filename?: string;
      contentType?: string;
      type?: string;
    };

function normalizeFiles(input: unknown): Array<{
  url: string;
  name: string;
  contentType?: string;
}> {
  if (!input) return [];

  let raw: any = input;

  // If stored as JSON string in DB, parse it
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        // Fall through: treat as a single URL string
        raw = trimmed;
      }
    }
  }

  const arr: FileItem[] = Array.isArray(raw) ? raw : [raw];

  return arr
    .map((f) => {
      if (!f) return null;

      if (typeof f === "string") {
        const url = f;
        const name = url.split("/").pop() || "file";
        return { url, name };
      }

      const url = String(f.url || f.downloadUrl || "");
      if (!url) return null;

      const name = String(f.name || f.filename || url.split("/").pop() || "file");
      const contentType = (f.contentType || f.type) ? String(f.contentType || f.type) : undefined;

      return { url, name, contentType };
    })
    .filter(Boolean) as Array<{ url: string; name: string; contentType?: string }>;
}

function isImageFile(f: { url: string; contentType?: string }) {
  if (f.contentType && f.contentType.startsWith("image/")) return true;

  // fallback to extension sniffing
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(f.url.split("?")[0]);
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ✅ Next 15/Turbopack: params is a Promise
  const { id } = await params;

  // ✅ In your Next build, cookies() is async
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

  const files = normalizeFiles(quote.files);
  const images = files.filter(isImageFile);
  const nonImages = files.filter((f) => !isImageFile(f));

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

          {/* ✅ IMAGE GALLERY */}
          {images.length > 0 && (
            <div>
              <div className="text-sm text-zinc-400">Submitted Images</div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.map((img, idx) => (
                  <a
                    key={idx}
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

              <div className="mt-2 text-xs text-zinc-500">
                Tip: click an image to open full size in a new tab.
              </div>
            </div>
          )}

          {/* Non-image attachments */}
          {nonImages.length > 0 && (
            <div>
              <div className="text-sm text-zinc-400">Other Files</div>
              <ul className="mt-2 space-y-2">
                {nonImages.map((f, idx) => (
                  <li key={idx} className="text-sm">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-zinc-200 break-all"
                    >
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
