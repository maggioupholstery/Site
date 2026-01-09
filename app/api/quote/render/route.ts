import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cleanCategory(x: unknown) {
  const v = String(x || "auto");
  return v === "marine" || v === "motorcycle" ? v : "auto";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const quoteId = String(body?.quoteId || "").trim();
    const category = cleanCategory(body?.category);
    const photoUrls: string[] = Array.isArray(body?.photoUrls)
      ? body.photoUrls.map((u: any) => String(u)).filter(Boolean)
      : [];

    if (!quoteId) {
      return NextResponse.json({ error: "Missing quoteId" }, { status: 400 });
    }
    if (!photoUrls.length) {
      return NextResponse.json({ error: "Missing photoUrls" }, { status: 400 });
    }

    // 1) If we already rendered, return it instantly
    try {
      const existing = await sql`
        SELECT preview_image_data_url
        FROM quotes
        WHERE id = ${quoteId}
        LIMIT 1
      `;
      const prev = String(existing.rows?.[0]?.preview_image_data_url || "");
      if (prev) {
        return NextResponse.json({ previewImageDataUrl: prev, cached: true });
      }
    } catch {
      // ignore
    }

    // 2) Generate a concept "after" render
    const prompt = `
Create a single photorealistic "after" concept render of an upholstery repair.

Rules:
- Keep the item/scene consistent with the provided photos (same subject, camera angle, composition).
- Improve/restore the upholstery: clean lines, tighter fit, corrected damage, professional finish.
- Do NOT add logos or text.
- Do NOT change the background significantly; just make it look clean and realistic.
- Make it look like a real finished upholstery job from a professional shop.

Category: ${category}

Return ONE image.
`.trim();

    const response = await openai.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...photoUrls.slice(0, 3).map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "auto" as const, // ✅ REQUIRED by TS types
            })),
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          quality: "medium",
          size: "1024x1024",
          background: "opaque",
        } as any,
      ],
      tool_choice: { type: "image_generation" } as any,
    });

    // Pull base64 out of image_generation_call output
    const base64 = (response.output || [])
      .filter((o: any) => o?.type === "image_generation_call")
      .map((o: any) => o?.result)
      .find((x: any) => typeof x === "string" && x.length > 0);

    if (!base64) {
      return NextResponse.json(
        { error: "No image returned from image generation tool" },
        { status: 502 }
      );
    }

    const previewImageDataUrl = `data:image/png;base64,${base64}`;

    // 3) Store it (if column exists)
    try {
      await sql`
        UPDATE quotes
        SET preview_image_data_url = ${previewImageDataUrl}
        WHERE id = ${quoteId}
      `;
    } catch {
      // ignore
    }

    return NextResponse.json({ previewImageDataUrl, cached: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Render failed" },
      { status: 500 }
    );
  }
}
