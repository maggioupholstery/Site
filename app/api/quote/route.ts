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

  // NEW: customer-friendly recommendations + options
  material_suggestions: string;

  damage: string;

  // Keep for pricing logic
  recommended_repair:
    | "stitch_repair"
    | "panel_replace"
    | "recover"
    | "foam_replace"
    | "unknown";

  // NEW: explain the repair process in plain English
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

// Nice debug response if you open /api/quote in the browser
export async function GET() {
  return json({
    ok: true,
    message:
      "Quote endpoint is alive. Send a POST multipart/form-data with fields: category,name,email,phone,notes and photos (1–3).",
  });
}

export async function POST(req: Request) {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

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
          {
            error: `Image too large. Please upload photos under ${MAX_MB_PER_IMAGE}MB each.`,
          },
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

        // NEW
        material_suggestions: { type: "string" },

        damage: { type: "string" },

        recommended_repair: {
          type: "string",
          enum: [
            "stitch_repair",
            "panel_replace",
            "recover",
            "foam_replace",
            "unknown",
          ],
        },

        // NEW
        recommended_repair_explained: { type: "string" },

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
                "You are an expert auto/marine upholstery trimmer. Analyze the photos and return ONLY valid JSON matching the provided schema.\n\n" +
                "Rules:\n" +
                "- Be conservative and practical.\n" +
                "- If uncertain, choose 'unknown' and explain what you'd need to confirm.\n" +
                "- For recommended_repair_explained: explain the process step-by-step in plain English (remove cover, inspect foam, pattern, cut/sew, install, finish).\n" +
                "- For material_suggestions: recommend 2–4 good options and why (durability, UV/mildew for marine, thread choice, match/texture).",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Category selected: ${category}\nCustomer notes: ${notes || "(none)"}`,
            },
            ...dataUrls.map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "low" as const,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "upholstery_assessment",
          schema,
        },
      },
    });

    const raw = (ai as any).output_text || "";
    let assessment: AiAssessment;

    try {
      assessment = JSON.parse(raw) as AiAssessment;
    } catch {
      return json({ error: "AI output parsing failed.", raw }, { status: 502 });
    }

    const estimate = estimateFromAssessment(assessment);

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
      assumptions: Array.isArray((estimate as any).assumptions)
        ? (estimate as any).assumptions
        : [],
    };

    const to = process.env.QUOTE_TO_EMAIL || "trimmer@maggioupholstery.com";
    const from = process.env.QUOTE_FROM_EMAIL || "onboarding@resend.dev";

    const subject = `New Photo Quote: ${assessment.category.toUpperCase()} • ${assessment.item} • $${safeEstimate.totalLow}–$${safeEstimate.totalHigh}`;

    const html =
      `<div style="font-family: ui-sans-serif,system-ui,-apple-system; line-height:1.45;">` +
      `<h2>New Photo Quote</h2>` +
      `<p><b>Name:</b> ${esc(name)}<br/>` +
      `<b>Email:</b> ${esc(email)}<br/>` +
      `<b>Phone:</b> ${esc(phone)}<br/>` +
      `<b>Category:</b> ${esc(assessment.category)}<br/>` +
      `<b>Item:</b> ${esc(assessment.item)}</p>` +
      `<hr/>` +
      `<h3>AI Assessment</h3>` +
      `<p><b>Material guess:</b> ${esc(assessment.material_guess)}<br/>` +
      `<b>Material suggestions:</b> ${esc(assessment.material_suggestions)}<br/>` +
      `<b>Damage:</b> ${esc(assessment.damage)}<br/>` +
      `<b>Recommended repair:</b> ${esc(assessment.recommended_repair)}<br/>` +
      `<b>How we’d repair it:</b> ${esc(assessment.recommended_repair_explained)}<br/>` +
      `<b>Complexity:</b> ${esc(assessment.complexity)}<br/>` +
      `<b>Notes:</b> ${esc(assessment.notes)}</p>` +
      `<hr/>` +
      `<h3>Base Estimate</h3>` +
      `<p><b>Total:</b> $${safeEstimate.totalLow} – $${safeEstimate.totalHigh}</p>` +
      `<ul>` +
      `<li>Labor: ${safeEstimate.laborHours} hrs @ $${safeEstimate.laborRate}/hr = $${safeEstimate.laborSubtotal}</li>` +
      `<li>Materials: $${safeEstimate.materialsLow} – $${safeEstimate.materialsHigh}</li>` +
      `<li>Shop minimum: $${safeEstimate.shopMinimum}</li>` +
      `</ul>` +
      `<h4>Assumptions</h4>` +
      `<ul>${safeEstimate.assumptions.map((a: string) => `<li>${esc(a)}</li>`).join("")}</ul>` +
      `<hr/>` +
      `<h3>Customer Notes</h3>` +
      `<p>${esc(notes || "(none)")}</p>` +
      `</div>`;

    let emailSent = false;

    if (process.env.RESEND_API_KEY) {
      try {
        const mod = await import("resend");
        const resend = new mod.Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from,
          to,
          subject,
          html,
          replyTo: email ? email : undefined,
        });

        emailSent = true;
      } catch (err) {
        console.error("Resend email failed:", err);
      }
    }

    return json({ assessment, estimate: safeEstimate, emailSent });
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
