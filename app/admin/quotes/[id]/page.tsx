import Link from "next/link";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function QuoteDetailPage({ params }: PageProps) {
  const { id } = params;

  // Call your existing API route (recommended to keep auth/cookies consistent)
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/admin/quotes/${id}`, {
    // ensure no caching weirdness in admin
    cache: "no-store",
    // IMPORTANT: when calling internal APIs from the server, absolute URL is safest on Vercel
  });

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

          <div className="mt-6 grid gap-4">
            <div>
              <div className="text-sm text-zinc-400">Customer</div>
              <div className="text-zinc-100">{quote?.name} • {quote?.email}</div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Category</div>
              <div className="text-zinc-100">{quote?.category}</div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Notes</div>
              <div className="text-zinc-100 whitespace-pre-wrap">{quote?.notes || "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
