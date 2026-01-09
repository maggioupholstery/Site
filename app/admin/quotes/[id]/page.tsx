import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type PageProps = { params: { id: string } };

export default async function QuoteDetailPage({ params }: PageProps) {
  const { id } = params;

  // headers() is async in your Next build
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Missing host header");

  const baseUrl = `${proto}://${host}`;

  const res = await fetch(`${baseUrl}/api/admin/quotes/${id}`, {
    cache: "no-store",
    // NOTE: cookies are NOT automatically forwarded to internal fetches
    // (If this API requires the admin cookie, we should *not* fetch it this way—see note below.)
  });

  if (res.status === 401) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <Link className="text-zinc-300 underline" href="/admin/login?next=/admin/quotes">
          Sign in
        </Link>
      </div>
    );
  }

  if (res.status === 404) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <Link className="text-zinc-300 underline" href="/admin/quotes">← Back</Link>
        <h1 className="mt-6 text-2xl font-semibold">Quote not found</h1>
        <p className="mt-2 text-zinc-400">ID: {id}</p>
      </div>
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to load quote");
  }

  const quote = await res.json();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">Quote Detail</h1>
          <Link className="text-zinc-300 underline" href="/admin/quotes">Back</Link>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6">
          <div className="text-sm text-zinc-400">Quote ID</div>
          <div className="font-mono text-zinc-200 break-all">{id}</div>

          <pre className="mt-6 text-xs text-zinc-300 overflow-auto">
            {JSON.stringify(quote, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
