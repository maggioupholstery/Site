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

function toNumOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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

  const subject = `New ${cleanLine(category)} Photo Quote – ${cleanLine(name)}`;

  const text = [
    "New Photo Quote Received",
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
    <div style="color:#444; margin-top:4px;">Final pricing subject to inspection + material selection.</div>

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

    // --- OpenAI ---
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

    // --- sanitize numeric estimate fields ---
    const laborHours = toNumOrNull(estimate.laborHours);
    const laborRate = toNumOrNull(estimate.laborRate);
    const laborSubtotal =
      toNumOrNull(estimate.laborSubtotal) ??
      (laborHours != null && laborRate != null ? laborHours * laborRate : null);

    const materialsLow = toNumOrNull(estimate.materialsLow);
    const materialsHigh = toNumOrNull(estimate.materialsHigh);
    const shopMinimum = toNumOrNull(estimate.shopMinimum);

    let totalLow =
      toNumOrNull(estimate.totalLow) ??
      (laborSubtotal != null && materialsLow != null
        ? laborSubtotal + materialsLow
        : null);

    let totalHigh =
      toNumOrNull(estimate.totalHigh) ??
      (laborSubtotal != null && materialsHigh != null
        ? laborSubtotal + materialsHigh
        : null);

    if (shopMinimum != null) {
      if (totalLow != null) totalLow = Math.max(totalLow, shopMinimum);
      if (totalHigh != null) totalHigh = Math.max(totalHigh, shopMinimum);
    }

    const estimateOut = {
      laborHours: laborHours ?? 0,
      laborRate: laborRate ?? 0,
      laborSubtotal: laborSubtotal ?? 0,
      materialsLow: materialsLow ?? 0,
      materialsHigh: materialsHigh ?? 0,
      shopMinimum: shopMinimum ?? 0,
      totalLow: totalLow ?? 0,
      totalHigh: totalHigh ?? 0,
      assumptions: Array.isArray(estimate.assumptions) ? estimate.assumptions : [],
    };

    const assessmentOut = {
      damage: cleanLine(assessment.damage || ""),
      recommended_repair: cleanLine(assessment.recommended_repair || ""),
      material_guess: cleanLine(assessment.material_guess || ""),
      material_suggestions: cleanLine(assessment.material_suggestions || ""),
      assumptions: Array.isArray(assessment.assumptions)
        ? assessment.assumptions
        : [],
      recommended_repair_explained: cleanLine(
        assessment.recommended_repair_explained || ""
      ),
    };

    const normalized = {
      ai_summary: cleanLine(assessmentOut.damage || ""),
      recommended_scope: cleanLine(assessmentOut.recommended_repair || ""),
      material_recommendation: cleanLine(assessmentOut.material_suggestions || ""),
      estimate_low: totalLow,
      estimate_high: totalHigh,
    };

    // --- DB insert ---
    const inserted = await sql<{ id: string }>`
      insert into quotes
        (name, email, phone, category, notes, photo_urls, ai_assessment_raw,
         ai_summary, recommended_scope, material_recommendation, estimate_low, estimate_high)
      values
        (${name}, ${email}, ${phone}, ${category}, ${notes},
         ${JSON.stringify(photoUrls)}::jsonb,
         ${JSON.stringify({ assessment: assessmentOut, estimate: estimateOut })}::jsonb,
         ${normalized.ai_summary},
         ${normalized.recommended_scope},
         ${normalized.material_recommendation},
         ${normalized.estimate_low},
         ${normalized.estimate_high})
      returning id
    `;

    const quoteId = inserted.rows?.[0]?.id;

    // --- Email send (handle ALL Resend shapes) ---
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

    const toEmail = process.env.QUOTE_INBOX_TO || "jdmaggio@gmail.com";
    const fromEmail =
      process.env.QUOTE_FROM || "Maggio Upholstery <quotes@maggioupholstery.com>";

    let resendRaw: any = null;
    let emailId: string | null = null;
    let emailError: any = null;

    try {
      const r: any = await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject,
        text,
        html,
        replyTo: email,
      });

      resendRaw = r;

      emailId = r?.data?.id ?? r?.id ?? null;
      emailError = r?.error ?? null;
    } catch (e: any) {
      resendRaw = { thrown: true, message: e?.message || String(e) };
      emailError = e?.message || String(e);
    }

    // Sent if we got an id (provider accepted it)
    const emailSent = Boolean(emailId);

    // ✅ NEW: persist email status to DB so admin matches user view
    // (Make sure you ran the ALTER TABLE step to add these columns.)
    try {
      await sql`
        update quotes
        set email_sent = ${emailSent},
            email_id = ${emailId},
            email_error = ${emailError ? String(emailError) : null}
        where id = ${quoteId}
      `;
    } catch (e: any) {
      // Don't fail the user flow if this update can't run yet (e.g., columns not added).
      console.warn("Could not update email status in DB:", e?.message || e);
    }

    return NextResponse.json({
      ok: true,
      quoteId,
      email: {
        sent: emailSent,
        id: emailId,
        error: emailError,
        provider: resendRaw, // remove later when you're done debugging
      },
      assessment: assessmentOut,
      estimate: estimateOut,
      normalized,
      photoUrls,
    });
  } catch (err: any) {
    console.error("POST /api/quote error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
