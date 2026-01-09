import Link from "next/link";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function QuoteDetailPage({ params }: PageProps) {
  const { id } = params;

  // cookies() is async in your Next build
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin")?.value === "true";

  if (!isAdmin) {
    // Send them to login with a return URL
    const next = encodeURIComponent(`/admin/quotes/${id}`);
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <h1 className="text-2xl font-semibold">Login required</h1>
        <p className="mt-2 text-zinc-400">Please sign in to view this quote.</p>
        <Link
          href={`/admin/login?next=${next}`}
          className="mt-6 inline-block underline text-zinc-200"
        >
          Go to login
        </Link>
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
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <Link className="text-zinc-300 underline" href="/admin/quotes">
          ← Back
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Quote not found</h1>
        <p className="mt-2 text-zinc-400">ID: {id}</p>
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

        <div className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6 space-y-4">
          <div>
            <div className="text-sm text-zinc-400">Quote ID</div>
            <div className="font-mono break-all">{quote.id}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Customer</div>
            <div>{quote.name} • {quote.email}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Category</div>
            <div>{quote.category}</div>
          </div>

          <div>
            <div className="text-sm text-zinc-400">Notes</div>
            <div className="whitespace-pre-wrap">{quote.notes || "—"}</div>
          </div>

          <details className="pt-2">
            <summary className="cursor-pointer text-zinc-300">Raw</summary>
            <pre className="mt-3 text-xs text-zinc-300 overflow-auto">
              {JSON.stringify(quote, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
