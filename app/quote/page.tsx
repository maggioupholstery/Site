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

  // ✅ progress UI
  const [stage, setStage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const fieldClass =
    "w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600";

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  // ✅ required fields
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const canSubmit = !!files.length && !!trimmedName && emailLooksValid && !loading;

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

  function startProgress() {
    setStage("Preparing…");
    setProgress(3);

    const t0 = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - t0;

      // Fast early, slower later, never hit 100 until we finish
      const target =
        elapsed < 4000
          ? 10 + elapsed / 80
          : elapsed < 12000
          ? 60 + (elapsed - 4000) / 200
          : 85 + (elapsed - 12000) / 900;

      setProgress((p) => Math.min(92, Math.max(p, Math.floor(target))));
    }, 250);

    return () => clearInterval(timer);
  }

  function setStageAndFloor(nextStage: string, floor: number) {
    setStage(nextStage);
    setProgress((p) => Math.max(p, floor));
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

    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }

    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }

    if (!emailLooksValid) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    const stop = startProgress();

    try {
      setStageAndFloor("Uploading photos…", 12);

      // 1) Upload to Blob
      const blobs = await uploadPhotosToBlob(files);
      const photoUrls = blobs.map((b) => b.url);

      setStageAndFloor("Analyzing damage…", 45);

      // 2) Send URLs to API
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          name: trimmedName,
          email: trimmedEmail,
          phone,
          notes,
          photoUrls,
        }),
      });

      setStageAndFloor("Rendering concept…", 75);

      const { rawText, json } = await safeReadJson(res);

      if (!res.ok) {
        const apiMsg =
          (json as any)?.error ||
          (json as any)?.message ||
          (rawText ? rawText.slice(0, 180) : "");
        throw new Error(apiMsg || `Quote failed (HTTP ${res.status}).`);
      }

      if (!json) throw new Error("Server returned an empty or non-JSON response. Please try again.");

      setResult(json);

      setStageAndFloor("Finalizing…", 95);
      setProgress(100);
      setStage("Done ✅");

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setStage("");
      setProgress(0);
    } finally {
      stop?.();
      setLoading(false);

      // reset progress UI after a moment
      setTimeout(() => {
        setStage("");
        setProgress(0);
      }, 1200);
    }
  }

  // Normalize estimate fields
  const est = result?.estimate || {};
  const totalLow = Number(est.totalLow ?? est.total_low ?? 0);
  const totalHigh = Number(est.totalHigh ?? est.total_high ?? 0);

  const laborHours = Number(est.laborHours ?? est.labor_hours ?? 0);
  const laborRate = Number(est.laborRate ?? est.labor_rate ?? 0);
  const laborSubtotal = Number(est.laborSubtotal ?? est.labor_subtotal ?? 0);

  const materialsLow = Number(est.materialsLow ?? est.materials_low ?? 0);
  const materialsHigh = Number(est.materialsHigh ?? est.materials_high ?? 0);

  const shopMinimum = Number(est.shopMinimum ?? est.shop_minimum ?? 0);

  const assumptions: string[] = Array.isArray(est.assumptions) ? est.assumptions : [];

  const assessment = result?.assessment ?? {};
  const materialSuggestions = String(
    assessment.material_suggestions ?? assessment.materialSuggestions ?? ""
  ).trim();
  const repairExplained = String(
    assessment.recommended_repair_explained ?? assessment.recommendedRepairExplained ?? ""
  ).trim();

  const previewImageDataUrl = String(result?.previewImageDataUrl ?? "").trim();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Photo Quote</h1>
        <p className="mt-2 text-zinc-400">
          Add up to <span className="text-zinc-200 font-semibold">3 photos</span> (wide + close-up).
          We’ll generate a repair recommendation and a base estimate.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5">
          <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm">
                  <div className="text-zinc-300 mb-1">Type</div>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as QuoteCategory)}
                    className={fieldClass}
                  >
                    <option value="auto">Auto</option>
                    <option value="marine">Marine</option>
                    <option value="motorcycle">Motorcycle</option>
                  </select>
                </label>

                <label className="text-sm">
                  <div className="text-zinc-300 mb-1">
                    Name <span className="text-red-300">*</span>
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`${fieldClass} ${
                      error && !trimmedName ? "border-red-500/60 focus:ring-red-500/40" : ""
                    }`}
                    placeholder="Your name"
                    required
                  />
                </label>

                <label className="text-sm">
                  <div className="text-zinc-300 mb-1">Phone</div>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="(443) 280-9371"
                  />
                </label>
              </div>

              <label className="text-sm">
                <div className="text-zinc-300 mb-1">
                  Email <span className="text-red-300">*</span>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${fieldClass} ${
                    error && (!trimmedEmail || !emailLooksValid)
                      ? "border-red-500/60 focus:ring-red-500/40"
                      : ""
                  }`}
                  placeholder="you@email.com"
                  required
                />
                {trimmedEmail && !emailLooksValid && (
                  <div className="mt-1 text-xs text-red-300">Please enter a valid email address.</div>
                )}
              </label>

              <label className="text-sm">
                <div className="text-zinc-300 mb-1">Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`${fieldClass} min-h-[96px]`}
                  placeholder="Where is the damage? Any preference (vinyl/leather), color match needs, etc."
                />
              </label>

              {/* Photo controls */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-zinc-300">
                    Photos <span className="text-zinc-500">(max 3)</span>
                  </div>
                  <div className="text-xs text-zinc-500">{files.length}/3 selected</div>
                </div>

                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    if (list.length) addFiles([list[0]]);
                    if (e.currentTarget) e.currentTarget.value = "";
                  }}
                  className="hidden"
                />
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    addFiles(list);
                    if (e.currentTarget) e.currentTarget.value = "";
                  }}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    className="rounded-2xl h-11"
                    disabled={files.length >= 3 || loading}
                    onClick={() => cameraRef.current?.click()}
                  >
                    Take Photo {files.length < 3 ? `(${files.length + 1}/3)` : ""}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl h-11 border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
                    disabled={files.length >= 3 || loading}
                    onClick={() => uploadRef.current?.click()}
                  >
                    Upload From Library
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl h-11 border-zinc-800 bg-transparent text-zinc-200 hover:bg-zinc-900"
                    disabled={loading}
                    onClick={() => {
                      setFiles([]);
                      setError(null);
                      setResult(null);
                    }}
                  >
                    Clear Photos
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {previews.map((src, i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden rounded-2xl border border-zinc-900 bg-black/30"
                      style={{ aspectRatio: "4 / 3" }}
                    >
                      <img
                        src={src}
                        alt={`Upload preview ${i + 1}`}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-2 right-2 rounded-xl bg-black/70 px-2 py-1 text-xs text-white hover:bg-black"
                        aria-label="Remove photo"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="text-sm text-red-300">{error}</div>}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button onClick={onSubmit} disabled={!canSubmit} className="rounded-2xl h-11">
                  {loading ? "Uploading + analyzing..." : "Get AI Estimate"}
                </Button>

                <Button
                  variant="outline"
                  className="rounded-2xl h-11 border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
                  disabled={loading}
                  onClick={() => {
                    setNotes("");
                    setResult(null);
                    setError(null);
                  }}
                >
                  Reset Notes / Result
                </Button>
              </div>

              {/* ✅ Progress indicator */}
              {loading && (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <div>{stage || "Working…"}</div>
                    <div>{progress}%</div>
                  </div>

                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-zinc-800 bg-black/30">
                    <div
                      className="h-full rounded-full bg-zinc-200 transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="mt-2 text-xs text-zinc-500">
                    Larger photos and complex jobs can take a bit longer.
                  </div>
                </div>
              )}

              {!loading && (
                <div className="text-xs text-zinc-500">
                  <span className="text-red-300">*</span> Name and Email are required.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <div ref={resultsRef}>
              <Card className="rounded-[2rem] border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-950/70 overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                      <div className="text-sm text-zinc-200/90">Estimated total range</div>
                      <div className="text-3xl md:text-4xl font-semibold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
                        ${totalLow} – ${totalHigh}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        Includes labor + estimated materials (final confirmed after inspection)
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3">
                      <div className="text-xs text-zinc-500">Email status</div>
                      <div className="text-sm font-semibold text-zinc-100">
                        {result.emailSent ? "Sent to shop ✅" : "Not sent ⚠️"}
                      </div>
                      {!result.emailSent && (
                        <div className="text-xs text-zinc-500 mt-1">
                          We still generated your estimate. Please call or email if needed.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="rounded-2xl border border-zinc-900 bg-gradient-to-b from-black/50 to-black/25 p-4">
                    <div className="flex items-end justify-between gap-3">
                      <div className="text-lg font-semibold text-zinc-100">Restored Preview</div>
                      <div className="text-xs text-zinc-300">Concept only</div>
                    </div>

                    <div className="mt-2 text-xs text-zinc-300">
                      This is an AI-generated “after” preview based on your photo. Final materials,
                      color match, and stitching details are confirmed after inspection and sample
                      approval.
                    </div>

                    {previewImageDataUrl ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-900 bg-black/30">
                        <img
                          src={previewImageDataUrl}
                          alt="AI restored preview"
                          className="w-full h-auto object-cover"
                        />
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-zinc-200">
                        Preview unavailable for this submission. (We still generated your estimate.)
                      </div>
                    )}
                  </div>

                  {/* Contrast-fixed cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                      <div className="text-xs text-zinc-400">Labor</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-100">
                        {laborHours} hrs @ ${laborRate}/hr
                      </div>
                      <div className="text-xs text-zinc-300 mt-1">Subtotal: ${laborSubtotal}</div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                      <div className="text-xs text-zinc-400">Materials</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-100">
                        ${materialsLow} – ${materialsHigh}
                      </div>
                      <div className="text-xs text-zinc-300 mt-1">
                        Based on material guess & scope
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                      <div className="text-xs text-zinc-400">Shop Minimum</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-100">${shopMinimum}</div>
                      <div className="text-xs text-zinc-300 mt-1">Applies if small repair</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-900 bg-black/25 p-4">
                    <div className="text-lg font-semibold">AI Repair Recommendation</div>

                    <div className="mt-2 text-sm text-zinc-300">
                      <span className="text-zinc-500">Damage:</span>{" "}
                      {assessment.damage ?? "—"}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      <span className="text-zinc-500">Recommended repair:</span>{" "}
                      {assessment.recommended_repair ?? "—"}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      <span className="text-zinc-500">Material guess:</span>{" "}
                      {assessment.material_guess ?? "—"}
                    </div>

                    {materialSuggestions && (
                      <div className="mt-3 text-sm text-zinc-300">
                        <div className="text-zinc-500">Material suggestions:</div>
                        <div className="mt-1 whitespace-pre-wrap">{materialSuggestions}</div>
                      </div>
                    )}

                    {repairExplained && (
                      <div className="mt-3 text-sm text-zinc-300">
                        <div className="text-zinc-500">How we’d repair it:</div>
                        <div className="mt-1 whitespace-pre-wrap">{repairExplained}</div>
                      </div>
                    )}

                    <div className="mt-3 text-xs text-zinc-500">
                      {assumptions.map((a: string, i: number) => (
                        <div key={i}>• {a}</div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button className="rounded-2xl h-11" asChild>
                      <a href="tel:+14432809371">Call (443) 280-9371</a>
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-2xl h-11 border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900"
                      asChild
                    >
                      <a href="mailto:trimmer@maggioupholstery.com">Email Photos</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
