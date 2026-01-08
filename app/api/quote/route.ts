import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- pricing/types (inlined to avoid Turbopack path resolution issues) ----
export type QuoteCategory = "auto" | "marine" | "motorcycle";

export type AiAssessment = {
  category: QuoteCategory;
  item: string;

  // Keep for pricing logic
  material_guess: "vinyl" | "leather" | "marine_vinyl" | "unknown";

  // customer-friendly recommendations + options
  material_suggestions: string;

  damage: string;

  // Keep for pricing logic
  recommended_repair:
    | "stitch_repair"
    | "panel_replace"
    | "recover"
    | "foam_replace"
    | "unknown";

  // explain the repair process in plain English
  recommended_repair_explained: string;

  complexity: "low" | "medium" | "high";
  notes: string;
};

export type Estimate = {
  laborHours: number;
  laborRate: number;
  laborSubtotal: number;
  materialsLow: number;
  materialsHigh: number;
  shopMinimum: number;
  totalLow: number;
  totalHigh: number;
  assumptions: string[];
};

const LABOR_RATE = 125;
const SHOP_MINIMUM = 250;

function clamp(n: number, lo: number, hi: number) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function estimateFromAssessment(a: AiAssessment): Estimate {
  // Base labor hours
  let hours = 3.0;

  if (a.recommended_repair === "stitch_repair") hours = 1.5;
  else if (a.recommended_repair === "foam_replace") hours = 2.5;
  else if (a.recommended_repair === "panel_replace") hours = 3.5;
  else if (a.recommended_repair === "recover") hours = 5.5;

  // Complexity multiplier
  let mult = 1.0;
  if (a.complexity === "medium") mult = 1.25;
  else if (a.complexity === "high") mult = 1.5;

  hours = clamp(hours * mult, 1.5, 10.0);

  // Materials range
  let materialsLow = 60;
  let materialsHigh = 180;

  if (a.material_guess === "leather") {
    materialsLow = 140;
    materialsHigh = 380;
  } else if (a.material_guess === "marine_vinyl") {
    materialsLow = 110;
    materialsHigh = 320;
  }

  // Category adjustments
  if (a.category === "marine") {
    materialsLow = Math.round(materialsLow * 1.15);
    materialsHigh = Math.round(materialsHigh * 1.2);
  }

  // Item tweaks
  const itemLower = (a.item || "").toLowerCase();
  if (itemLower.includes("armrest")) {
    hours = clamp(hours * 0.75, 1.5, 7.0);
    materialsLow = Math.round(materialsLow * 0.8);
    materialsHigh = Math.round(materialsHigh * 0.85);
  }

  const laborSubtotal = Math.round(hours * LABOR_RATE);

  const rawLow = laborSubtotal + materialsLow;
  const rawHigh = laborSubtotal + materialsHigh;

  const totalLow = Math.max(SHOP_MINIMUM, rawLow);
  const totalHigh = Math.max(totalLow + 50, rawHigh);

  const assumptions = [
    "Estimate is based on photos only; final quote confirmed after inspection or additional close-ups.",
    "Assumes no hidden damage under covers or foam.",
    "Does not include major frame repair or airbag/sensor complications.",
  ];

  return {
    laborHours: Math.round(hours * 10) / 10,
    laborRate: LABOR_RATE,
    laborSubtotal,
    materialsLow,
    materialsHigh,
    shopMinimum: SHOP_MINIMUM,
    totalLow,
    totalHigh,
    assumptions,
  };
}

// ---- helpers ----
async function fileToDataUrl(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  const base64 = Buffer.from(ab).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(data: any, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function normText(v: unknown, fallback: string) {
  const s = String(v ?? "").trim();
  return s.length ? s : fallback;
}

/**
 * Extract base64 PNG from Responses API image_generation tool output.
 * Docs show: response.output[].type === "image_generation_call" and output.result is base64 string.
 * We also handle a couple of possible alternate shapes just in case.
 */
function extractGeneratedImageBase64(resp: any): string | null {
  const out = resp?.output;
  if (!Array.isArray(out)) return null;

  for (const item of out) {
    if (item?.type === "image_generation_call") {
      if (typeof item?.result === "string" && item.result.trim()) return item.result.trim();

      // Defensive fallbacks (in case SDK shape differs)
      const r = item?.result;
      if (r && typeof r === "object") {
        const maybe =
          (r as any).image_base64 ||
          (r as any).b64_json ||
          (r as any).data?.[0]?.b64_json ||
          "";
        if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
      }
    }
  }
  return null;
}

// Allow browser preflight (helps when anything ever calls this cross-origin)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET() {
  return json({
    ok: true,
    message:
      "Quote endpoint is alive. Send a POST multipart/form-data with fields: category,name,email,phone,notes and photos (1–3).",
    version: "ai-v3-materials-process-preview",
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const name = String(form.get("name") || "");
    const email = String(form.get("email") || "");
    const phone = String(form.get("phone") || "");
    const category = String(form.get("category") || "auto") as QuoteCategory;
    const notes = String(form.get("notes") || "");

    const files = (form.getAll("photos") as File[]).filter(
      (f) => f && typeof (f as any).size === "number" && (f as any).size > 0
    );

    if (files.length === 0) {
      return json({ error: "No photos uploaded." }, { status: 400 });
    }

    const selected = files.slice(0, 3);

    const MAX_MB_PER_IMAGE = 6;
    for (const f of selected) {
      const mb = (f as any).size / (1024 * 1024);
      if (mb > MAX_MB_PER_IMAGE) {
        return json(
          { error: `Image too large. Please upload photos under ${MAX_MB_PER_IMAGE}MB each.` },
          { status: 413 }
        );
      }
    }

    const dataUrls = await Promise.all(selected.map(fileToDataUrl));

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string", enum: ["auto", "marine", "motorcycle"] },
        item: { type: "string" },

        material_guess: {
          type: "string",
          enum: ["vinyl", "leather", "marine_vinyl", "unknown"],
        },

        material_suggestions: {
          type: "string",
          description:
            "2–4 material options + why. Mention marine-grade + UV thread for marine. Keep to 2–6 sentences.",
        },

        damage: { type: "string" },

        recommended_repair: {
          type: "string",
          enum: ["stitch_repair", "panel_replace", "recover", "foam_replace", "unknown"],
        },

        recommended_repair_explained: {
          type: "string",
          description:
            "Explain the shop steps in plain English. 4–8 short sentences. No fluff.",
        },

        complexity: { type: "string", enum: ["low", "medium", "high"] },
        notes: { type: "string" },
      },
      required: [
        "category",
        "item",
        "material_guess",
        "material_suggestions",
        "damage",
        "recommended_repair",
        "recommended_repair_explained",
        "complexity",
        "notes",
      ],
    } as const;

    // --------- 1) Assessment (structured JSON) ----------
    const ai = await openai.responses.create({
      model: "gpt-4o-mini",
      store: false,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are an expert auto/marine upholstery trimmer.\n" +
                "Return ONLY valid JSON matching the schema.\n\n" +
                "Guidelines:\n" +
                "- Be conservative and practical.\n" +
                "- If uncertain, use 'unknown' and explain what photo/measurement is needed.\n" +
                "- Avoid vague wording. Prefer specific upholstery terms.\n" +
                "- recommended_repair_explained should describe what we physically do: remove cover, inspect foam, pattern, cut, sew, topstitch, add backing/foam as needed, reinstall, final fit.\n" +
                "- material_suggestions: 2–4 options + why (durability/UV/mildew for marine, matching grain/color, thread choice like UV polyester for marine). Keep it customer-friendly.",
            },
          ],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Category selected: ${category}\nCustomer notes: ${notes || "(none)"}` },
            ...dataUrls.map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "low" as const,
            })),
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "upholstery_assessment", schema },
      },
    });

    const raw = (ai as any).output_text || "";
    let assessment: AiAssessment;

    try {
      assessment = JSON.parse(raw) as AiAssessment;
    } catch {
      return json({ error: "AI output parsing failed.", raw }, { status: 502 });
    }

    const normalizedAssessment: AiAssessment = {
      ...assessment,
      item: normText(assessment.item, "Unknown item"),
      damage: normText(assessment.damage, "Damage not clearly visible from photos."),
      notes: normText(
        assessment.notes,
        "If you can, send a close-up of the damaged area and a wider shot showing the full part."
      ),
      material_suggestions: normText(
        assessment.material_suggestions,
        "If you want the closest match, we’ll recommend samples after seeing it in person. For marine, we typically suggest marine-grade vinyl with UV-resistant thread."
      ),
      recommended_repair_explained: normText(
        assessment.recommended_repair_explained,
        "We’ll inspect the area, confirm the best repair method, and proceed with a proper upholstery repair or recover as needed. Photos don’t always show foam/backing condition, so final steps may adjust after inspection."
      ),
    };

    // --------- 2) Preview image (concept) ----------
    let previewImageDataUrl: string | null = null;
    let previewError: string | null = null;

    const previewEnabled =
      String(process.env.QUOTE_PREVIEW_ENABLED ?? "true").toLowerCase() !== "false";

    if (previewEnabled && dataUrls.length) {
      try {
        const basePhoto = dataUrls[0];

        const materialWord =
          normalizedAssessment.material_guess === "marine_vinyl"
            ? "marine-grade vinyl"
            : normalizedAssessment.material_guess === "leather"
            ? "automotive leather"
            : normalizedAssessment.material_guess === "vinyl"
            ? "automotive vinyl"
            : "upholstery-grade vinyl";

        const categoryWord =
          normalizedAssessment.category === "marine"
            ? "marine bench/boat seat"
            : normalizedAssessment.category === "motorcycle"
            ? "motorcycle seat"
            : "automotive seat";

        const previewPrompt =
          `Create a photorealistic "after restoration" preview of the SAME ${categoryWord} shown in the reference photo. ` +
          `Keep the same angle, shape, seams, and panels as closely as possible. ` +
          `Remove stains, discoloration, peeling, cracking, frayed edges, and worn spots. ` +
          `Make it look professionally reupholstered in ${materialWord}: tight fit, clean stitching, new-looking finish. ` +
          `DO NOT change the environment/background. DO NOT add logos or text. DO NOT redesign.`;

        // IMPORTANT: use a mainline model to call the image_generation tool
        const imgResp = await openai.responses.create({
          model: "gpt-5",
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: previewPrompt },
                { type: "input_image", image_url: basePhoto, detail: "low" },
              ],
            },
          ],
          tools: [{ type: "image_generation" }],
        });

        const b64 = extractGeneratedImageBase64(imgResp);
        if (b64) {
          previewImageDataUrl = `data:image/png;base64,${b64}`;
        } else {
          // This is the #1 reason you see “Preview unavailable…”
          previewError =
            "Image tool returned no base64. This is usually caused by model/tool access restrictions (GPT Image org verification) or the request being blocked.";
          console.error("Image generation returned no base64. Output:", imgResp?.output);
        }
      } catch (err: any) {
        previewError = err?.message || "Preview image generation failed.";
        console.error("Preview image generation failed:", err);
      }
    }

    // --------- 3) Estimate ----------
    const estimate = estimateFromAssessment(normalizedAssessment);

    const safeEstimate = {
      ...estimate,
      laborHours: Number((estimate as any).laborHours) || 0,
      laborRate: Number((estimate as any).laborRate) || 0,
      laborSubtotal: Number((estimate as any).laborSubtotal) || 0,
      materialsLow: Number((estimate as any).materialsLow) || 0,
      materialsHigh: Number((estimate as any).materialsHigh) || 0,
      shopMinimum: Number((estimate as any).shopMinimum) || 0,
      totalLow: Number((estimate as any).totalLow) || 0,
      totalHigh: Number((estimate as any).totalHigh) || 0,
      assumptions: Array.isArray((estimate as any).assumptions) ? (estimate as any).assumptions : [],
    };

    // (Email sending removed in your pasted version, so leaving it out here too)
    // If you want it back, we can re-add it after preview works.

    return json({
      version: "ai-v3-materials-process-preview",
      assessment: normalizedAssessment,
      estimate: safeEstimate,
      emailSent: true, // keep your UI happy; change if you actually wire email
      previewImageDataUrl,
      previewError, // helpful for debugging in UI if you decide to show it
    });
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
