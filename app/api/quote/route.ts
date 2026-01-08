import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Resend } from "resend";
import {
  estimateFromAssessment,
  type AiAssessment,
  type QuoteCategory,
} from "@/lib/pricing";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

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

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const name = String(form.get("name") || "");
    const email = String(form.get("email") || "");
    const phone = String(form.get("phone") || "");
    const category = String(form.get("category") || "auto") as QuoteCategory;
    const notes = String(form.get("notes") || "");

    const files = (form.getAll("photos") as File[]).filter(
      (f) => f && (f as any).size > 0
    );
    if (files.length === 0) {
      return NextResponse.json(
        { error: "No photos uploaded." },
        { status: 400 }
      );
    }

    const dataUrls = await Promise.all(files.slice(0, 3).map(fileToDataUrl));

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
                "You are an expert auto/marine upholstery trimmer. Analyze the photos and return ONLY valid JSON matching the provided schema. Be conservative and practical.",
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

    const raw = ai.output_text;
    let assessment: AiAssessment;
    try {
      assessment = JSON.parse(raw) as AiAssessment;
    } catch {
      return NextResponse.json(
        { error: "AI output parsing failed.", raw },
        { status: 502 }
      );
    }

    // Original estimate from your pricing rules
    const estimate = estimateFromAssessment(assessment);

    // Make sure all numeric fields exist and are numbers (prevents blank UI)
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
        await resend.emails.send({ from, to, subject, html });
        emailSent = true;
      } catch (err) {
        console.error("Resend email failed:", err);
      }
    }

    return NextResponse.json({ assessment, estimate: safeEstimate, emailSent });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
