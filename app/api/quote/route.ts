import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Resend } from "resend";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- pricing/types (inlined to avoid Turbopack path resolution issues) ----
export type QuoteCategory = "auto" | "marine" | "motorcycle";

export type AiAssessment = {
  category: QuoteCategory;
  item: string;

  material_guess: "vinyl" | "leather" | "marine_vinyl" | "unknown";
  material_suggestions: string;

  damage: string;

  recommended_repair:
    | "stitch_repair"
    | "panel_replace"
    | "recover"
    | "foam_replace"
    | "unknown";

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
  let hours = 3.0;

  if (a.recommended_repair === "stitch_repair") hours = 1.5;
  else if (a.recommended_repair === "foam_replace") hours = 2.5;
  else if (a.recommended_repair === "panel_replace") hours = 3.5;
  else if (a.recommended_repair === "recover") hours = 5.5;

  let mult = 1.0;
  if (a.complexity === "medium") mult = 1.25;
  else if (a.complexity === "high") mult = 1.5;

  hours = clamp(hours * mult, 1.5, 10.0);

  let materialsLow = 60;
  let materialsHigh = 180;

  if (a.material_guess === "leather") {
    materialsLow = 140;
    materialsHigh = 380;
  } else if (a.material_guess === "marine_vinyl") {
    materialsLow = 110;
    materialsHigh = 320;
  }

  if (a.category === "marine") {
    materialsLow = Math.round(materialsLow * 1.15);
    materialsHigh = Math.round(materialsHigh * 1.2);
  }

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
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const b64 = buf.toString("base64");
  return `data:${contentType};base64,${b64}`;
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
 */
function extractGeneratedImageBase64(resp: any): string | null {
  const out = resp?.output;
  if (!Array.isArray(out)) return null;

  for (const item of out) {
    if (item?.type === "image_generation_call") {
      if (typeof item?.result === "string" && item.result.trim()) return item.result.trim();

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

// ---- email attachment helpers ----
async function urlToEmailAttachment(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image for attachment (${res.status})`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { filename, content: buf, contentType };
}

function dataUrlToEmailAttachment(dataUrl: string, filename: string) {
  const idx = dataUrl.indexOf("base64,");
  if (idx === -1) throw new Error("Invalid data URL (missing base64,)");
  const header = dataUrl.slice(0, idx);
  const b64 = dataUrl.slice(idx + "base64,".length).trim();

  const mimeMatch = header.match(/^data:([^;]+);/i);
  const contentType = mimeMatch?.[1] || "application/octet-stream";

  return {
    filename,
    content: Buffer.from(b64, "base64"),
    contentType,
  };
}

// Allow browser preflight
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
      "Quote endpoint is alive. Send POST as application/json with fields: category,name,email,phone,notes,photoUrls (1–3).",
    version: "ai-v5-blob+postgres+materials-process-preview+resend",
  });
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json({ error: "Send application/json with photoUrls." }, { status: 415 });
    }

    const body: any = await req.json();

    const name = String(body?.name || "");
    const email = String(body?.email || "");
    const phone = String(body?.phone || "");
    const category = String(body?.category || "auto") as QuoteCategory;
    const notes = String(body?.notes || "");

    const photoUrls: string[] = Array.isArray(body?.photoUrls)
      ? body.photoUrls.slice(0, 3).map(String)
      : [];

    if (photoUrls.length === 0) {
      return json({ error: "No photoUrls provided." }, { status: 400 });
    }

    // Build dataUrls for OpenAI (from Blob URLs)
    const dataUrls = await Promise.all(photoUrls.map(urlToDataUrl));

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string", enum: ["auto", "marine", "motorcycle"] },
        item: { type: "string" },
        material_guess: { type: "string", enum: ["vinyl", "leather", "marine_vinyl", "unknown"] },
        material_suggestions: { type: "string" },
        damage: { type: "string" },
        recommended_repair: {
          type: "string",
          enum: ["stitch_repair", "panel_replace", "recover", "foam_replace", "unknown"],
        },
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

    // --------- 1) Assessment ----------
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
                "- material_suggestions: 2–4 options + why (durability/UV/mildew for marine, matching grain/color, thread choice like UV polyester for marine). Keep it customer-friendly.\n" +
                "- IMPORTANT: Use the customer's notes as requirements/constraints when describing the repair approach.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Category selected: ${category}\nCUSTOMER NOTES (treat as requirements):\n${
                notes || "(none)"
              }`,
            },
            ...dataUrls.map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "low" as const,
            })),
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "upholstery_assessment", schema } },
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
        if (b64) previewImageDataUrl = `data:image/png;base64,${b64}`;
        else previewError = "Image tool returned no base64 (blocked or access restricted).";
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

    // --------- 4) Email (Resend) ----------
    const resendApiKey = process.env.RESEND_API_KEY || "";
    const to = process.env.QUOTE_TO_EMAIL || "";
    const from = process.env.QUOTE_FROM_EMAIL || "";

    let emailSent = false;
    let emailError: string | null = null;
    let emailId: string | null = null;

    let receiptSent = false;
    let receiptError: string | null = null;

    if (!resendApiKey) {
      emailError = "RESEND_API_KEY is missing in server environment.";
    } else if (!to) {
      emailError = "QUOTE_TO_EMAIL is missing in server environment.";
    } else if (!from) {
      emailError =
        "QUOTE_FROM_EMAIL is missing. Set it to a verified sender like 'Maggio Upholstery <no-reply@maggioupholstery.com>'.";
    } else {
      try {
        const resend = new Resend(resendApiKey);

        const subject = `New Photo Quote: ${normalizedAssessment.category.toUpperCase()} • ${normalizedAssessment.item} • $${safeEstimate.totalLow}–$${safeEstimate.totalHigh}`;

        const html =
          `<div style="font-family: ui-sans-serif,system-ui,-apple-system; line-height:1.45;">` +
          `<h2>New Photo Quote</h2>` +
          `<p><b>Name:</b> ${esc(name)}<br/>` +
          `<b>Email:</b> ${esc(email)}<br/>` +
          `<b>Phone:</b> ${esc(phone)}<br/>` +
          `<b>Category:</b> ${esc(normalizedAssessment.category)}<br/>` +
          `<b>Item:</b> ${esc(normalizedAssessment.item)}</p>` +
          `<hr/>` +
          `<h3>AI Assessment</h3>` +
          `<p><b>Material guess:</b> ${esc(normalizedAssessment.material_guess)}<br/>` +
          `<b>Material suggestions:</b> ${esc(normalizedAssessment.material_suggestions)}<br/>` +
          `<b>Damage:</b> ${esc(normalizedAssessment.damage)}<br/>` +
          `<b>Recommended repair:</b> ${esc(normalizedAssessment.recommended_repair)}<br/>` +
          `<b>How we’d repair it:</b> ${esc(normalizedAssessment.recommended_repair_explained)}<br/>` +
          `<b>Complexity:</b> ${esc(normalizedAssessment.complexity)}<br/>` +
          `<b>Notes:</b> ${esc(normalizedAssessment.notes)}</p>` +
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

        const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];

        for (let i = 0; i < photoUrls.length; i++) {
          const idx = String(i + 1).padStart(2, "0");
          attachments.push(await urlToEmailAttachment(photoUrls[i], `original-${idx}.jpg`));
        }

        if (previewImageDataUrl) {
          try {
            attachments.push(dataUrlToEmailAttachment(previewImageDataUrl, "ai-preview.png"));
          } catch (e: any) {
            console.error("Failed to attach AI preview:", e?.message || e);
          }
        }

        const resp = await resend.emails.send({
          from,
          to,
          subject,
          html,
          replyTo: email ? email : undefined,
          attachments: attachments.length ? attachments : undefined,
        });

        const maybeError = (resp as any)?.error;
        const maybeData = (resp as any)?.data;

        if (maybeError) {
          emailError = maybeError?.message || String(maybeError);
        } else {
          emailSent = true;
          emailId = maybeData?.id ?? null;

          if (email) {
            try {
              const receiptSubject = "We received your photo quote request";
              const receiptHtml =
                `<div style="font-family: ui-sans-serif,system-ui,-apple-system; line-height:1.5;">` +
                `<h2>We received your photo quote request</h2>` +
                `<p>Hi ${esc(name || "there")},</p>` +
                `<p>Thanks for reaching out to <b>Maggio Upholstery</b>. We received your photos and details and will review them shortly.</p>` +
                `<h3>Summary</h3>` +
                `<p>` +
                `<b>Category:</b> ${esc(normalizedAssessment.category)}<br/>` +
                `<b>Item:</b> ${esc(normalizedAssessment.item)}<br/>` +
                `<b>Estimated range:</b> $${safeEstimate.totalLow} – $${safeEstimate.totalHigh}` +
                `</p>` +
                `<p style="color:#555; font-size:14px;">` +
                `This estimate is based on photos only. Final pricing may change after inspection or additional close-ups.` +
                `</p>` +
                `<hr/>` +
                `<p>If you have more photos to share, just reply to this email.</p>` +
                `<p>— Maggio Upholstery</p>` +
                `</div>`;

              const receiptResp = await resend.emails.send({
                from,
                to: email,
                subject: receiptSubject,
                html: receiptHtml,
                replyTo: to,
              });

              const receiptMaybeError = (receiptResp as any)?.error;
              if (receiptMaybeError) {
                receiptError = receiptMaybeError?.message || String(receiptMaybeError);
              } else {
                receiptSent = true;
              }
            } catch (err: any) {
              receiptError = err?.message || "Customer receipt failed.";
              console.error("Customer receipt failed:", err);
            }
          }
        }
      } catch (err: any) {
        emailError = err?.message || "Resend send failed.";
      }
    }

    // --------- 5) Save to Postgres (NEW) ----------
    let dbId: number | null = null;
    try {
      const inserted = await sql`
        insert into quote_requests (
          status,
          category, name, email, phone, notes,
          photo_urls,
          assessment, estimate,
          preview_image_data_url, preview_error,
          email_sent, email_error, email_id,
          receipt_sent, receipt_error
        ) values (
          'new',
          ${category}, ${name}, ${email}, ${phone}, ${notes},
          ${photoUrls}::text[],
          ${JSON.stringify(normalizedAssessment)}::jsonb,
          ${JSON.stringify(safeEstimate)}::jsonb,
          ${previewImageDataUrl}, ${previewError},
          ${emailSent}, ${emailError}, ${emailId},
          ${receiptSent}, ${receiptError}
        )
        returning id
      `;
      dbId = Number((inserted as any)?.rows?.[0]?.id ?? null);
    } catch (e: any) {
      console.error("DB insert failed:", e?.message || e);
      // Don’t fail the customer response if DB insert fails
    }

    return json({
      version: "ai-v5-blob+postgres+materials-process-preview+resend",
      dbId,
      assessment: normalizedAssessment,
      estimate: safeEstimate,

      emailSent,
      emailError,
      emailId,

      receiptSent,
      receiptError,

      previewImageDataUrl,
      previewError,

      debug: {
        hasPostgresUrl: Boolean(process.env.POSTGRES_URL),
        blobMode: true,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
