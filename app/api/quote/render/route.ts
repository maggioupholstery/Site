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
      // ignore DB read errors here; we'll still try to generate
    }

    // 2) Generate a concept "after" render using the image_generation tool
    // The tool returns base64 (no data URL prefix), we’ll convert to data URL. :contentReference[oaicite:1]{index=1}
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
            // include up to 3 images as context
            ...photoUrls.slice(0, 3).map((url) => ({
              type: "input_image" as const,
              image_url: url,
            })),
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          // tool options: safe + high-ish quality
          // you can tweak size if you want faster (1024x1024 is usually quickest)
          quality: "medium",
          size: "1024x1024",
          background: "opaque",
        } as any,
      ],
      // force the tool call so it doesn't just chat back
      tool_choice: { type: "image_generation" } as any,
    });

    // Pull the base64 result from the image_generation_call output :contentReference[oaicite:2]{index=2}
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

    // Convert to data URL so your existing frontend <img src="..."> works immediately
    const previewImageDataUrl = `data:image/png;base64,${base64}`;

    // 3) Store it for admin + future loads
    try {
      await sql`
        UPDATE quotes
        SET preview_image_data_url = ${previewImageDataUrl}
        WHERE id = ${quoteId}
      `;
    } catch {
      // If the column doesn't exist yet or DB hiccups, still return the image.
    }

    return NextResponse.json({ previewImageDataUrl, cached: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Render failed" },
      { status: 500 }
    );
  }
}
