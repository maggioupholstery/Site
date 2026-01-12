"use client";

import React, { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type QuoteCategory = "auto" | "marine" | "motorcycle";

/**
 * Format a US phone number as (XXX) XXX-XXXX while typing.
 * Accepts pasted input with any characters.
 */
function formatPhoneUS(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6)
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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

  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const [stage, setStage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const fieldClass =
    "w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600";

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedPhone = phone.replace(/\D/g, "");

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const phoneLooksValid = trimmedPhone.length === 10;

  const canSubmit =
    !!files.length &&
    !!trimmedName &&
    emailLooksValid &&
    phoneLooksValid &&
    !loading &&
    !rendering;

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

    if (!files.length) return setError("Please add at least one photo.");
    if (!trimmedName) return setError("Please enter your name.");
    if (!emailLooksValid) return setError("Please enter a valid email.");
    if (!phoneLooksValid) return setError("Please enter a valid phone number.");

    setLoading(true);
    const stop = startProgress();

    try {
      setStageAndFloor("Uploading photos…", 12);
      const blobs = await uploadPhotosToBlob(files);
      const photoUrls = blobs.map((b) => b.url);

      setStageAndFloor("Analyzing damage…", 55);

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

      const { json } = await safeReadJson(res);
      if (!res.ok || !json) throw new Error("Quote failed");

      setStage("Done ✅");
      setProgress(100);
      setResult(json);

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      stop();
      setLoading(false);
      setTimeout(() => {
        setStage("");
        setProgress(0);
      }, 1000);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Card className="rounded-[2rem] border-zinc-900 bg-zinc-950/70">
          <CardContent className="p-6 space-y-4">
            <label className="text-sm">
              <div className="text-zinc-300 mb-1">
                Phone <span className="text-red-300">*</span>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneUS(e.target.value))}
                className={`${fieldClass} ${
                  error && !phoneLooksValid ? "border-red-500/60" : ""
                }`}
                placeholder="(443) 280-9371"
                required
                name="tel"
                autoComplete="tel"
                inputMode="tel"
              />
            </label>

            <Button onClick={onSubmit} disabled={!canSubmit}>
              Get AI Estimate
            </Button>

            {error && <div className="text-sm text-red-300">{error}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
