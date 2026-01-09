import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Resend } from "resend";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

function escHtml(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(n: unknown) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function cleanLine(s: unknown) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function buildEmail({
  name,
  email,
  phone,
  category,
  quoteId,
  notes,
  photoUrls,
  ai,
}: {
  name: string;
  email: string;
  phone: string;
  category: string;
  quoteId: string;
  notes: string;
  photoUrls: string[];
  ai: {
    ai_summary: string;
    recommended_scope: string;
    material_recommendation: string;
    estimate_low: number | null;
    estimate_high: number | null;
  };
}) {
  const photosBlockText =
    photoUrls.length > 0
      ? photoUrls.map((u, i) => `Photo ${i + 1}: ${u}`).join("\n")
      : "No photos attached.";

  const photosBlockHtml =
    photoUrls.length > 0
      ? photoUrls
          .map(
            (u, i) =>
              `<div>Photo ${i + 1}: <a href="${escHtml(u)}">${escHtml(
                u
              )}</a></div>`
          )
          .join("")
      : `<div>No photos attached.</div>`;

  const estimateLine =
    ai.estimate_low != null && ai.estimate_high != null
      ? `${money(ai.estimate_low)} – ${money(ai.estimate_high)}`
      : ai.estimate_low != null
      ? `${money(ai.estimate_low)}+`
      : ai.estimate_high != null
      ? `Up to ${money(ai.estimate_high)}`
      : "TBD (needs review)";

  // 🔎 VERSION STAMP (temporary)
  const subject = `[v2-clean-email] New ${cleanLine(category)} Photo Quote – ${cleanLine(name)}`;

  const text = [
    "New Photo Quote Received",
    "[v2-clean-email] Template active",
    "",
    "Customer Information",
    `Name: ${cleanLine(name)}`,
    `Email: ${cleanLine(email)}`,
    `Phone: ${cleanLine(phone)}`,
    `Category: ${cleanLine(category)}`,
    `Quote ID: ${cleanLine(quoteId)}`,
    "",
    "Customer Notes",
    notes?.trim() ? `“${cleanLine(notes)}”` : "(none)",
    "",
    "AI Summary (internal helper)",
    `• Project Type / Summary: ${cleanLine(ai.ai_summary) || "—"}`,
    `• Recommended Scope: ${cleanLine(ai.recommended_scope) || "—"}`,
    `• Materials: ${cleanLine(ai.material_recommendation) || "—"}`,
    "",
    "Estimated Range (Preliminary)",
    estimateLine,
    "(Final pricing subject to inspection + material selection.)",
    "",
    "Photos",
    photosBlockText,
    "",
  ].join("\n");

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.4;">
    <div style="color:#999;font-size:12px;">[v2-clean-email] Template active</div>

    <h2 style="margin:0 0 12px 0;">New Photo Quote Received</h2>

    <h3 style="margin:16px 0 6px 0;">Customer Information</h3>
    <div><b>Name:</b> ${escHtml(name)}</div>
    <div><b>Email:</b> ${escHtml(email)}</div>
    <div><b>Phone:</b> ${escHtml(phone)}</div>
    <div><b>Category:</b> ${escHtml(category)}</div>
    <div><b>Quote ID:</b> ${escHtml(quoteId)}</div>

    <h3 style="margin:16px 0 6px 0;">Customer Notes</h3>
    <div>${notes?.trim() ? `“${escHtml(notes)}”` : "(none)"}</div>

    <h3 style="margin:16px 0 6px 0;">AI Summary (internal helper)</h3>
    <ul style="margin:6px 0 0 20px;">
      <li><b>Project Type / Summary:</b> ${escHtml(ai.ai_summary || "—")}</li>
      <li><b>Recommended Scope:</b> ${escHtml(ai.recommended_scope || "—")}</li>
      <li><b>Materials:</b> ${escHtml(ai.material_recommendation || "—")}</li>
    </ul>

    <h3 style="margin:16px 0 6px 0;">Estimated Range (Preliminary)</h3>
    <div style="font-size:16px;"><b>${escHtml(estimateLine)}</b></div>
    <div style="color:#444; margin-top:4px;">
      Final pricing subject to inspection + material selection.
    </div>

    <h3 style="margin:16px 0 6px 0;">Photos</h3>
    ${photosBlockHtml}
  </div>`;

  return { subject, text, html };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = cleanLine(body?.name);
    const email = cleanLine(body?.email);
    const phone = cleanLine(body?.phone);
    const category = cleanLine(body?.category);
    const notes = String(body?.notes ?? "");
    const photoUrls: string[] = Array.isArray(body?.photoUrls)
      ? body.photoUrls.map((u: any) => String(u)).filter(Boolean)
      : [];

    if (!name || !email || !phone || !category) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 }
      );
    }

    const prompt = {
      category,
      notes,
      photoUrls,
      instruction:
        "Return JSON with two keys: assessment and estimate. " +
        "assessment: { damage, recommended_repair, material_guess, assumptions[], material_suggestions, recommended_repair_explained }. " +
        "estimate: { laborHours, laborRate, laborSubtotal, materialsLow, materialsHigh, shopMinimum, totalLow, totalHigh, assumptions[] }.",
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are an expert upholstery estimator." },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      response_format: { type: "json_object" },
    });

    const rawText = completion.choices?.[0]?.message?.content ?? "{}";
    let aiRaw: any = {};
    try {
      aiRaw = JSON.parse(rawText);
    } catch {
      aiRaw = { error: "Could not parse AI JSON", rawText };
    }

    const assessment = aiRaw?.assessment ?? {};
    const estimate = aiRaw?.estimate ?? {};

    const normalized = {
      ai_summary: cleanLine(assessment.damage || ""),
      recommended_scope: cleanLine(assessment.recommended_repair || ""),
      material_recommendation: cleanLine(
        assessment.material_suggestions || ""
      ),
      estimate_low: Number.isFinite(Number(estimate.totalLow))
        ? Number(estimate.totalLow)
        : null,
      estimate_high: Number.isFinite(Number(estimate.totalHigh))
        ? Number(estimate.totalHigh)
        : null,
    };

    const inserted = await sql<{ id: string }>`
      insert into quotes
        (name, email, phone, category, notes, photo_urls, ai_assessment_raw,
         ai_summary, recommended_scope, material_recommendation,
         estimate_low, estimate_high)
      values
        (${name}, ${email}, ${phone}, ${category}, ${notes},
         ${JSON.stringify(photoUrls)}::jsonb,
         ${JSON.stringify(aiRaw)}::jsonb,
         ${normalized.ai_summary},
         ${normalized.recommended_scope},
         ${normalized.material_recommendation},
         ${normalized.estimate_low},
         ${normalized.estimate_high})
      returning id
    `;

    const quoteId = inserted.rows[0].id;

    const { subject, text, html } = buildEmail({
      name,
      email,
      phone,
      category,
      quoteId,
      notes,
      photoUrls,
      ai: normalized,
    });

    const emailResult = await resend.emails.send({
      from:
        process.env.QUOTE_FROM ||
        "Maggio Upholstery <quotes@maggioupholstery.com>",
      to: [process.env.QUOTE_INBOX_TO || "jdmaggio@gmail.com"],
      subject,
      text,
      html,
      replyTo: email,
    });

    return NextResponse.json({
      ok: true,
      quoteId,
      emailSent: !!emailResult?.data?.id,
    });
  } catch (err: any) {
    console.error("POST /api/quote error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
