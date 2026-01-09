"use client";

import React, { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type QuoteCategory = "auto" | "marine" | "motorcycle";

export default function QuotePage() {
  const [category, setCategory] = useState<QuoteCategory>("auto");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const fieldClass =
    "w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600";

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  function addFiles(newOnes: File[]) {
    setFiles((prev) => [...prev, ...newOnes].slice(0, 3));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function safeReadJson(res: Response) {
    const rawText = await res.text();
    if (!rawText) return { rawText: "", json: null };
    try {
      return { rawText, json: JSON.parse(rawText) };
    } catch {
      return { rawText, json: null };
    }
  }

  function safePathSegment(name: string) {
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 80);
  }

  async function uploadPhotosToBlob(selectedFiles: File[]): Promise<PutBlobResult[]> {
    const uploads = selectedFiles.slice(0, 3).map((file, idx) => {
      const extGuess =
        file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const base = safePathSegment(file.name || `photo-${idx + 1}.${extGuess}`);
      const pathname = `quotes/${Date.now()}-${idx + 1}-${base}`;

      return upload(pathname, file, {
        access: "public",
        contentType: file.type || "image/jpeg",
        handleUploadUrl: "/api/blob",
        clientPayload: JSON.stringify({ kind: "quote-photo", index: idx + 1 }),
      });
    });

    return Promise.all(uploads);
  }

  async function onSubmit() {
    setError(null);
    setResult(null);

    if (!files.length) {
      setError("Please add at least one photo.");
      return;
    }

    setLoading(true);
    try {
      const blobs = await uploadPhotosToBlob(files);
      const photoUrls = blobs.map((b) => b.url);

      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          name,
          email,
          phone,
          notes,
          photoUrls,
        }),
      });

      const { rawText, json } = await safeReadJson(res);

      if (!res.ok) {
        throw new Error(
          (json as any)?.error ||
            (json as any)?.message ||
            rawText ||
            `Quote failed (HTTP ${res.status})`
        );
      }

      setResult(json);

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const est = result?.estimate || {};
  const totalLow = Number(est.totalLow ?? 0);
  const totalHigh = Number(est.totalHigh ?? 0);
  const laborHours = Number(est.laborHours ?? 0);
  const laborRate = Number(est.laborRate ?? 0);
  const laborSubtotal = Number(est.laborSubtotal ?? 0);
  const materialsLow = Number(est.materialsLow ?? 0);
  const materialsHigh = Number(est.materialsHigh ?? 0);
  const shopMinimum = Number(est.shopMinimum ?? 0);
  const assumptions: string[] = Array.isArray(est.assumptions) ? est.assumptions : [];

  const assessment = result?.assessment ?? {};
  const previewImageDataUrl = String(result?.previewImageDataUrl ?? "").trim();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-4xl font-semibold tracking-tight">Photo Quote</h1>

        <Card className="mt-6 rounded-[2rem] border-zinc-900 bg-zinc-950/70">
          <CardContent className="p-6 space-y-4">
            {/* FORM (unchanged) */}
            {/* ... your form remains exactly as before ... */}
          </CardContent>
        </Card>

        {result && (
          <div ref={resultsRef} className="mt-6">
            <Card className="rounded-[2rem] border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-950/70">
              <CardContent className="p-6 space-y-6">
                <div>
                  <div className="text-sm text-zinc-300">Estimated total range</div>
                  <div className="text-4xl font-semibold text-white">
                    ${totalLow} – ${totalHigh}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <div className="text-xs text-zinc-400">Labor</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      {laborHours} hrs @ ${laborRate}/hr
                    </div>
                    <div className="text-xs text-zinc-300 mt-1">
                      Subtotal: ${laborSubtotal}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <div className="text-xs text-zinc-400">Materials</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      ${materialsLow} – ${materialsHigh}
                    </div>
                    <div className="text-xs text-zinc-300 mt-1">
                      Based on material & scope
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                    <div className="text-xs text-zinc-400">Shop Minimum</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">
                      ${shopMinimum}
                    </div>
                    <div className="text-xs text-zinc-300 mt-1">
                      Applies if small repair
                    </div>
                  </div>
                </div>

                {previewImageDataUrl && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-900">
                    <img
                      src={previewImageDataUrl}
                      alt="AI restored preview"
                      className="w-full h-auto object-cover"
                    />
                  </div>
                )}

                <div className="text-xs text-zinc-400">
                  {assumptions.map((a, i) => (
                    <div key={i}>• {a}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
