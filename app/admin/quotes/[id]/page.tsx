"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type QuoteRecord = {
  id: string;
  created_at?: string;

  name?: string;
  email?: string;
  phone?: string;
  category?: string;
  notes?: string;

  // saved JSONB
  files?: any; // can be array/object/string depending on driver
  assessment?: any;
  estimate?: any;

  // render storage
  preview_image_url?: string;
  preview_image_data_url?: string;

  // status
  email_sent?: boolean;
  render_email_sent?: boolean;

  // any other fields
  [k: string]: any;
};

function safeJsonParse<T = any>(v: any): T | null {
  if (!v) return null;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function extractPhotoUrls(q: QuoteRecord): string[] {
  // Prefer `files` JSONB which we now write as [{url, name, contentType}]
  const parsed = safeJsonParse<any>(q.files);
  if (Array.isArray(parsed)) {
    const urls = parsed
      .map((x) => (typeof x === "string" ? x : x?.url))
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    if (urls.length) return urls;
  }

  // Fallbacks if you ever stored photos elsewhere
  const fallbacks = [
    q.photoUrls,
    q.photo_urls,
    q.photos,
    q.photo_urls_json,
  ].find((x) => Array.isArray(x) || typeof x === "string");

  const parsed2 = safeJsonParse<any>(fallbacks);
  if (Array.isArray(parsed2)) {
    return parsed2.map((u) => String(u || "").trim()).filter(Boolean);
  }

  return [];
}

export default function AdminQuoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // render controls
  const [rendering, setRendering] = useState(false);
  const [renderErr, setRenderErr] = useState<string | null>(null);

  const photoUrls = useMemo(() => (quote ? extractPhotoUrls(quote) : []), [quote]);
  const previewSrc = useMemo(() => {
    const url = String(quote?.preview_image_url || "").trim();
    if (url) return url;
    const data = String(quote?.preview_image_data_url || "").trim();
    if (data) return data;
    // some earlier versions used camelCase
    const data2 = String(quote?.previewImageDataUrl || "").trim();
    return data2 || "";
  }, [quote]);

  async function loadQuote() {
    if (!id) return;

    setErr(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/quotes/${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      // If not logged in, route should return 401
      if (res.status === 401) {
        router.push(`/admin/login?next=${encodeURIComponent(`/admin/quotes/${id}`)}`);
        return;
      }

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) throw new Error(json?.error || text || "Failed to load quote");

      setQuote(json as QuoteRecord);
    } catch (e: any) {
      setErr(e?.message || "Failed to load quote");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }

  async function generateRender(auto = false) {
    if (!quote) return;

    const quoteId = String(quote.id || "").trim();
    const urls = photoUrls;

    if (!quoteId) {
      setRenderErr("Missing quote ID.");
      return;
    }
    if (!urls.length) {
      setRenderErr("No submitted photos found for this quote.");
      return;
    }

    setRenderErr(null);
    setRendering(true);

    try {
      const res = await fetch("/api/quote/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          category: quote.category || "auto",
          photoUrls: urls.slice(0, 3),
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}

      if (!res.ok) throw new Error(json?.error || text || "Render failed");

      // Merge fields into quote so UI updates immediately
      const preview_image_url = String(json?.previewImageUrl || json?.preview_image_url || "").trim();
      const preview_image_data_url = String(
        json?.previewImageDataUrl || json?.preview_image_data_url || ""
      ).trim();

      setQuote((prev) => ({
        ...(prev || ({} as QuoteRecord)),
        preview_image_url: preview_image_url || prev?.preview_image_url,
        preview_image_data_url: preview_image_data_url || prev?.preview_image_data_url,
        render_email_sent:
          typeof json?.renderEmailSent === "boolean"
            ? json.renderEmailSent
            : prev?.render_email_sent,
      }));
    } catch (e: any) {
      // Only show an error if user clicked the button; keep auto-run quieter
      setRenderErr(e?.message || "Render failed");
      if (auto) {
        // no-op otherwise; admin can click retry
      }
    } finally {
      setRendering(false);
    }
  }

  // initial load
  useEffect(() => {
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // auto-generate render if missing (admin view guarantees you can always generate later)
  useEffect(() => {
    if (!quote) return;
    if (previewSrc) return;
    if (!photoUrls.length) return;
    if (rendering) return;

    // fire and forget; user can still click Generate if it fails
    generateRender(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.id]); // run once after quote arrives

  const est = quote?.estimate || {};
  const assessment = quote?.assessment || {};

  const totalLow = Number(est.totalLow ?? est.total_low ?? 0);
  const totalHigh = Number(est.totalHigh ?? est.total_high ?? 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-zinc-400">Admin</div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Quote Detail
            </h1>
            <div className="text-xs text-zinc-500 mt-1 break-all">
              ID: {id || "—"}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-2xl border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
              onClick={() => router.push("/admin/quotes")}
            >
              ← Back
            </Button>

            <Button
              variant="outline"
              className="rounded-2xl border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
              onClick={loadQuote}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {err && (
          <Card className="rounded-[2rem] border-red-900/40 bg-zinc-950/70">
            <CardContent className="p-6">
              <div className="text-red-300 font-semibold">Error</div>
              <div className="text-sm text-zinc-300 mt-1">{err}</div>
            </CardContent>
          </Card>
        )}

        {loading && !quote && (
          <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
            <CardContent className="p-6 text-zinc-300">Loading…</CardContent>
          </Card>
        )}

        {!loading && !quote && !err && (
          <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
            <CardContent className="p-6 text-zinc-300">
              Quote not found.
            </CardContent>
          </Card>
        )}

        {quote && (
          <>
            {/* Summary */}
            <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-xs text-zinc-500">Name</div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {quote.name || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-xs text-zinc-500">Email</div>
                    <div className="text-sm font-semibold text-zinc-100 break-all">
                      {quote.email || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-xs text-zinc-500">Phone</div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {quote.phone || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-xs text-zinc-500">Category</div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {quote.category || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-xs text-zinc-500">Lead email</div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {quote.email_sent ? "Sent ✅" : "Not sent ⚠️"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-xs text-zinc-500">Render email</div>
                    <div className="text-sm font-semibold text-zinc-100">
                      {quote.render_email_sent ? "Sent ✅" : "Not yet"}
                    </div>
                  </div>
                </div>

                {quote.notes && (
                  <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                    <div className="text-xs text-zinc-500">Notes</div>
                    <div className="mt-1 text-sm text-zinc-200 whitespace-pre-wrap">
                      {quote.notes}
                    </div>
                  </div>
                )}

                {(totalLow || totalHigh) && (
                  <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                    <div className="text-xs text-zinc-500">Estimated total</div>
                    <div className="mt-1 text-2xl font-semibold text-zinc-100">
                      ${totalLow} – ${totalHigh}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submitted Photos */}
            <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Submitted Photos</div>
                    <div className="text-xs text-zinc-500">
                      {photoUrls.length ? `${photoUrls.length} file(s)` : "No files found"}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="rounded-2xl border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
                    onClick={() => {
                      // open the first photo in a new tab if available
                      if (photoUrls[0]) window.open(photoUrls[0], "_blank", "noopener,noreferrer");
                    }}
                    disabled={!photoUrls.length}
                  >
                    Open First
                  </Button>
                </div>

                {photoUrls.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {photoUrls.map((src, i) => (
                      <a
                        key={i}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="relative overflow-hidden rounded-2xl border border-zinc-900 bg-black/30 block"
                        style={{ aspectRatio: "4 / 3" }}
                      >
                        <img
                          src={src}
                          alt={`Submitted photo ${i + 1}`}
                          className="absolute inset-0 h-full w-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute bottom-2 left-2 rounded-xl bg-black/60 px-2 py-1 text-xs text-white">
                          Photo {i + 1}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Concept Render */}
            <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Concept Render</div>
                    <div className="text-xs text-zinc-500">
                      Auto-generates if missing when you open this page
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="rounded-2xl"
                      onClick={() => generateRender(false)}
                      disabled={rendering || !photoUrls.length}
                    >
                      {rendering ? "Generating…" : "Generate / Retry"}
                    </Button>

                    {previewSrc && (
                      <Button
                        variant="outline"
                        className="rounded-2xl border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
                        onClick={() => window.open(previewSrc, "_blank", "noopener,noreferrer")}
                      >
                        Open
                      </Button>
                    )}
                  </div>
                </div>

                {renderErr && (
                  <div className="rounded-2xl border border-red-900/40 bg-black/20 p-4">
                    <div className="text-sm text-red-300">{renderErr}</div>
                  </div>
                )}

                {previewSrc ? (
                  <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-black/30">
                    <img
                      src={previewSrc}
                      alt="Concept render"
                      className="w-full h-auto object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : rendering ? (
                  <div className="rounded-2xl border border-zinc-900 bg-black/30 p-4">
                    <div className="text-sm text-zinc-200 font-semibold">
                      Generating the concept render…
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      This may take a bit. You’ll also receive a render email when it finishes.
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-zinc-800 bg-black/30">
                      <div className="h-full w-2/3 rounded-full bg-zinc-200 animate-pulse" />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4 text-sm text-zinc-300">
                    No render yet. Click <span className="text-zinc-100 font-semibold">Generate / Retry</span>.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Raw JSON (handy for debugging) */}
            <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
              <CardContent className="p-6 space-y-3">
                <div className="text-lg font-semibold">AI Output</div>

                <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                  <div className="text-xs text-zinc-500">Assessment</div>
                  <pre className="mt-2 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(assessment || {}, null, 2)}
                  </pre>
                </div>

                <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                  <div className="text-xs text-zinc-500">Estimate</div>
                  <pre className="mt-2 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(est || {}, null, 2)}
                  </pre>
                </div>

                <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                  <div className="text-xs text-zinc-500">Raw Record</div>
                  <pre className="mt-2 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(quote, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
