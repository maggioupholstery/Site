import Link from "next/link";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
          <p className="mt-2 text-zinc-400">
            Please sign in to view this quote.
          </p>

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

  // Fetch quote
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Quote Detail</h1>
          <Link className="text-zinc-300 underline" href="/admin/quotes">
            Back
          </Link>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6 space-y-5">
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
              <div className="text-zinc-100 break-all">{quote.email || "—"}</div>
            </div>
            <div>
              <div className="text-sm text-zinc-400">Phone</div>
              <div className="text-zinc-100">{quote.phone || "—"}</div>
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Notes</div>
            <div className="mt-1 whitespace-pre-wrap text-zinc-100">
              {quote.notes || "—"}
            </div>
          </div>

          {/* Optional: show attachments if you store them */}
          {Array.isArray(quote.files) && quote.files.length > 0 && (
            <div>
              <div className="text-sm text-zinc-400">Files</div>
              <ul className="mt-2 space-y-2">
                {quote.files.map((f: any, idx: number) => (
                  <li key={idx} className="text-sm">
                    <a
                      href={String(f?.url || f)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-zinc-200 break-all"
                    >
                      {String(f?.name || f?.url || f)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Debug raw row */}
          <details className="pt-2">
            <summary className="cursor-pointer text-zinc-300">
              Raw record
            </summary>
            <pre className="mt-3 text-xs text-zinc-300 overflow-auto rounded-xl border border-zinc-900 bg-black/30 p-3">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
