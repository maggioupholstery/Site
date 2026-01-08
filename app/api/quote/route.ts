import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  estimateFromAssessment,
  type AiAssessment,
  type QuoteCategory,
} from "@/lib/pricing";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    // Belt + suspenders: in case routing ever behaves oddly
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

    // Limit to 3 photos
    const selected = files.slice(0, 3);

    // Guard against huge mobile photos causing serverless failures / empty responses
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

    // IMPORTANT: schema is ONLY the JSON schema body (no wrapper)
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
        complexity: { type: "string", enum: ["low", "medium", "high"] },
        notes: { type: "string" },
      },
      required: [
        "category",
        "item",
        "material_guess",
        "damage",
        "recommended_repair",
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
                "You are an expert auto/marine upholstery trimmer. Analyze the photos and return ONLY valid JSON matching the provided schema. Be conservative and practical. If uncertain, choose 'unknown' and explain in notes.",
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
            ...dataUrls.map((url) => ({ type: "input_image", image_url: url })),
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
      return json(
        { error: "AI output parsing failed.", raw },
        { status: 502 }
      );
    }

    // Pricing
    const estimate = estimateFromAssessment(assessment);

    // Normalize to avoid blank UI values
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

    // Email
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
      `<b>Damage:</b> ${esc(assessment.damage)}<br/>` +
      `<b>Recommended repair:</b> ${esc(assessment.recommended_repair)}<br/>` +
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
      `<ul>${safeEstimate.assumptions
        .map((a: string) => `<li>${esc(a)}</li>`)
        .join("")}</ul>` +
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
