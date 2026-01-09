import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Resend } from "resend";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const SHOP_TO = "maggioupholstery@gmail.com";

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

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    ""
  )
    .toString()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function absoluteUrl(path: string) {
  const base = getBaseUrl();
  if (!base) return "";
  return `https://${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function buildCustomerReceiptEmail(args: {
  name: string;
  customerEmail: string;
  phone: string;
  category: string;
  quoteId: string;
  notes: string;
  estimateLine: string;
  aiSummary: string;
  scope: string;
  materials: string;
}) {
  const subject = `We received your ${cleanLine(args.category)} quote request`;

  const text = [
    "Thanks — we received your request.",
    "",
    `Name: ${cleanLine(args.name)}`,
    `Category: ${cleanLine(args.category)}`,
    `Quote ID: ${cleanLine(args.quoteId)}`,
    "",
    "Your notes:",
    args.notes?.trim() ? `“${cleanLine(args.notes)}”` : "(none)",
    "",
    "Preliminary estimate range:",
    args.estimateLine,
    "(Final pricing confirmed after inspection and material selection.)",
    "",
    "Repair plan (summary):",
    `• ${cleanLine(args.aiSummary) || "—"}`,
    "",
    "Recommended scope:",
    cleanLine(args.scope) || "—",
    "",
    "Material suggestions:",
    cleanLine(args.materials) || "—",
    "",
    "We’ll follow up shortly to confirm details.",
  ].join("\n");

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.4;">
    <h2 style="margin:0 0 12px 0;">We received your quote request</h2>

    <div style="margin:0 0 12px 0;">
      Thanks — we received your request and photos. We’ll follow up shortly to confirm details.
    </div>

    <h3 style="margin:16px 0 6px 0;">Request details</h3>
    <div><b>Name:</b> ${escHtml(args.name)}</div>
    <div><b>Category:</b> ${escHtml(args.category)}</div>
    <div><b>Quote ID:</b> ${escHtml(args.quoteId)}</div>

    <h3 style="margin:16px 0 6px 0;">Your notes</h3>
    <div>${args.notes?.trim() ? `“${escHtml(args.notes)}”` : "(none)"}</div>

    <h3 style="margin:16px 0 6px 0;">Preliminary estimate range</h3>
    <div style="font-size:16px;"><b>${escHtml(args.estimateLine)}</b></div>
    <div style="color:#444; margin-top:4px;">Final pricing confirmed after inspection and material selection.</div>

    <h3 style="margin:16px 0 6px 0;">Repair plan (summary)</h3>
    <div>• ${escHtml(args.aiSummary || "—")}</div>

    <h3 style="margin:16px 0 6px 0;">Recommended scope</h3>
    <div>${escHtml(args.scope || "—")}</div>

    <h3 style="margin:16px 0 6px 0;">Material suggestions</h3>
    <div>${escHtml(args.materials || "—")}</div>

    <div style="margin-top:16px;">
      <b>Maggio Upholstery</b><br/>
      Call/Text: (443) 280-9371
    </div>
  </div>`;

  return { subject, text, html };
}

function buildShopLeadEmail(args: {
  name: string;
  customerEmail: string;
  phone: string;
  category: string;
  quoteId: string;
  notes: string;
  photoUrls: string[];
  estimateLine: string;
  aiSummary: string;
  scope: string;
  materials: string;
  adminUrl: string;
}) {
  const subject = `NEW LEAD: ${cleanLine(args.category)} – ${cleanLine(args.name)}`;

  const photosBlockText =
    args.photoUrls.length > 0
      ? args.photoUrls.map((u, i) => `Photo ${i + 1}: ${u}`).join("\n")
      : "No photos attached.";

  const photosBlockHtml =
    args.photoUrls.length > 0
      ? args.photoUrls
          .map(
            (u, i) =>
              `<div>Photo ${i + 1}: <a href="${escHtml(u)}">${escHtml(
                u
              )}</a></div>`
          )
          .join("")
      : `<div>No photos attached.</div>`;

  const text = [
    "New Photo Quote Lead",
    "",
    "Customer",
    `Name: ${cleanLine(args.name)}`,
    `Email: ${cleanLine(args.customerEmail)}`,
    `Phone: ${cleanLine(args.phone)}`,
    `Category: ${cleanLine(args.category)}`,
    `Quote ID: ${cleanLine(args.quoteId)}`,
    args.adminUrl ? `Admin: ${args.adminUrl}` : "",
    "",
    "Notes",
    args.notes?.trim() ? `“${cleanLine(args.notes)}”` : "(none)",
    "",
    "Estimate Range (Preliminary)",
    args.estimateLine,
    "",
    "AI Summary",
    `Damage: ${cleanLine(args.aiSummary) || "—"}`,
    `Scope: ${cleanLine(args.scope) || "—"}`,
    `Materials: ${cleanLine(args.materials) || "—"}`,
    "",
    "Photos",
    photosBlockText,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.4;">
    <h2 style="margin:0 0 12px 0;">New Photo Quote Lead</h2>

    <h3 style="margin:16px 0 6px 0;">Customer</h3>
    <div><b>Name:</b> ${escHtml(args.name)}</div>
    <div><b>Email:</b> <a href="mailto:${escHtml(args.customerEmail)}">${escHtml(
    args.customerEmail
  )}</a></div>
    <div><b>Phone:</b> <a href="tel:${escHtml(args.phone)}">${escHtml(
    args.phone
  )}</a></div>
    <div><b>Category:</b> ${escHtml(args.category)}</div>
    <div><b>Quote ID:</b> ${escHtml(args.quoteId)}</div>
    ${
      args.adminUrl
        ? `<div><b>Admin:</b> <a href="${escHtml(args.adminUrl)}">${escHtml(
            args.adminUrl
          )}</a></div>`
        : ""
    }

    <h3 style="margin:16px 0 6px 0;">Notes</h3>
    <div>${args.notes?.trim() ? `“${escHtml(args.notes)}”` : "(none)"}</div>

    <h3 style="margin:16px 0 6px 0;">Estimate Range (Preliminary)</h3>
    <div style="font-size:16px;"><b>${escHtml(args.estimateLine)}</b></div>

    <h3 style="margin:16px 0 6px 0;">AI Summary</h3>
    <ul style="margin:6px 0 0 20px;">
      <li><b>Damage:</b> ${escHtml(args.aiSummary || "—")}</li>
      <li><b>Scope:</b> ${escHtml(args.scope || "—")}</li>
      <li><b>Materials:</b> ${escHtml(args.materials || "—")}</li>
    </ul>

    <h3 style="margin:16px 0 6px 0;">Photos</h3>
    ${photosBlockHtml}
  </div>`;

  return { subject, text, html };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = cleanLine(body?.name);
    const customerEmail = cleanLine(body?.email);
    const phone = cleanLine(body?.phone);
    const category = cleanLine(body?.category);
    const notes = String(body?.notes ?? "");
    const photoUrls: string[] = Array.isArray(body?.photoUrls)
      ? body.photoUrls.map((u: any) => String(u)).filter(Boolean)
      : [];

    if (!name || !customerEmail || !phone || !category) {
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

    const inserted = await sql<{ id: string }>`
      insert into quotes
        (name, email, phone, category, notes, photo_urls, ai_assessment_raw,
         ai_summary, recommended_scope, material_recommendation, estimate_low, estimate_high)
      values
        (${name}, ${customerEmail}, ${phone}, ${category}, ${notes},
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

    const estimateLine =
      normalized.estimate_low != null && normalized.estimate_high != null
        ? `${money(normalized.estimate_low)} – ${money(normalized.estimate_high)}`
        : "TBD (needs review)";

    const adminUrl = absoluteUrl(`/admin/quotes/${quoteId}`);

    const customerReceipt = buildCustomerReceiptEmail({
      name,
      customerEmail,
      phone,
      category,
      quoteId,
      notes,
      estimateLine,
      aiSummary: normalized.ai_summary,
      scope: normalized.recommended_scope,
      materials: normalized.material_recommendation,
    });

    const shopLead = buildShopLeadEmail({
      name,
      customerEmail,
      phone,
      category,
      quoteId,
      notes,
      photoUrls,
      estimateLine,
      aiSummary: normalized.ai_summary,
      scope: normalized.recommended_scope,
      materials: normalized.material_recommendation,
      adminUrl,
    });

    const fromEmail =
      process.env.QUOTE_FROM || "Maggio Upholstery <quotes@maggioupholstery.com>";

    const results: any = {
      customerReceipt: { sent: false, id: null, error: null },
      shopLead: { sent: false, id: null, error: null },
    };

    if (!resend) {
      // Back-compat flags for UI
      return NextResponse.json({
        ok: true,
        quoteId,
        email: results,
        emailSent: false,
        emailError: "RESEND_API_KEY is not set.",
        assessment: assessmentOut,
        estimate: estimateOut,
        normalized,
        photoUrls,
      });
    }

    // Helper: treat provider acceptance as "sent" even if no id returned
    function computeSent(r: any, id: string | null, err: any) {
      // If the SDK gave an error field, treat as failed.
      if (err) return false;
      // If no explicit error and we got any response object back, treat as accepted.
      if (r) return true;
      // fallback
      return Boolean(id);
    }

    // 1) Customer receipt
    try {
      const r: any = await resend.emails.send({
        from: fromEmail,
        to: [customerEmail],
        subject: customerReceipt.subject,
        text: customerReceipt.text,
        html: customerReceipt.html,
        replyTo: SHOP_TO,
      });

      const id = r?.data?.id ?? r?.id ?? null;
      const err = r?.error ?? null;

      results.customerReceipt = {
        sent: computeSent(r, id, err),
        id,
        error: err,
      };
    } catch (e: any) {
      results.customerReceipt = {
        sent: false,
        id: null,
        error: e?.message || String(e),
      };
    }

    // 2) Shop lead (reply-to = customer)
    try {
      const r: any = await resend.emails.send({
        from: fromEmail,
        to: [SHOP_TO],
        subject: shopLead.subject,
        text: shopLead.text,
        html: shopLead.html,
        replyTo: customerEmail,
      });

      const id = r?.data?.id ?? r?.id ?? null;
      const err = r?.error ?? null;

      results.shopLead = {
        sent: computeSent(r, id, err),
        id,
        error: err,
      };
    } catch (e: any) {
      results.shopLead = {
        sent: false,
        id: null,
        error: e?.message || String(e),
      };
    }

    // ✅ BACKWARDS COMPAT FOR YOUR CURRENT UI:
    // Your customer page says "Sent to shop ✅" — so this should reflect the shop lead email.
    const emailSent = Boolean(results.shopLead?.sent);
    const emailError = results.shopLead?.error ?? null;

    // (Optional) persist statuses if columns exist
    try {
      await sql`
        UPDATE quotes
        SET lead_email_sent = ${emailSent},
            lead_email_id = ${results.shopLead?.id ?? null},
            lead_email_error = ${emailError ? String(emailError) : null},
            receipt_email_sent = ${Boolean(results.customerReceipt?.sent)},
            receipt_email_id = ${results.customerReceipt?.id ?? null},
            receipt_email_error = ${
              results.customerReceipt?.error ? String(results.customerReceipt?.error) : null
            }
        WHERE id = ${quoteId}
      `;
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      quoteId,
      email: results,
      // ✅ these fix the existing UI instantly
      emailSent,
      emailError,
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
