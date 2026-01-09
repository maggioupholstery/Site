import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { sql } from "@vercel/postgres";

// If you use Resend, keep these imports; otherwise you can remove them.
import { Resend } from "resend";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const category = String(body?.category ?? "auto");
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const notes = String(body?.notes ?? "").trim();
    const photoUrls: string[] = Array.isArray(body?.photoUrls)
      ? body.photoUrls.map((x: any) => String(x)).filter(Boolean)
      : [];

    // ✅ enforce required name/email server-side
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (photoUrls.length < 1) {
      return NextResponse.json({ error: "At least one photo is required." }, { status: 400 });
    }

    // ✅ Create the quote row FIRST so we can return a quoteId quickly
    // Store files as JSON for admin to display later.
    const filesJson = JSON.stringify(
      photoUrls.map((url) => ({
        url,
        name: url.split("/").pop() || "photo",
        contentType: "image/*",
      }))
    );

    const insert = await sql`
      INSERT INTO quotes (category, name, email, phone, notes, files)
      VALUES (${category}, ${name}, ${email}, ${phone}, ${notes}, ${filesJson})
      RETURNING id
    `;

    const quoteId = String(insert.rows?.[0]?.id ?? "");

    // ✅ Phase 1: analysis + estimate (NO concept render here)
    // Keep it lean. We only do text output and pricing logic.
    const prompt = `
You are an expert in custom marine and auto upholstery.
Given the customer's category and notes, and the fact that photos were provided,
produce:
1) A short damage summary
2) A recommended repair approach (customer-friendly)
3) A material guess: vinyl | leather | marine_vinyl | unknown
4) Any assumptions (bullets)

Category: ${category}
Customer notes: ${notes || "(none)"}

Return JSON with keys:
damage, recommended_repair, material_guess, assumptions (array of strings), material_suggestions, recommended_repair_explained
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const assessmentRaw = completion.choices?.[0]?.message?.content || "{}";
    let assessment: any = {};
    try {
      assessment = JSON.parse(assessmentRaw);
    } catch {
      assessment = { damage: "", recommended_repair: "", material_guess: "unknown", assumptions: [] };
    }

    // ✅ Simple estimate logic (you can replace with your existing pricing lib if you already have it)
    // This keeps the endpoint fast and predictable.
    const laborRate = 140; // adjust if you want
    const baseHours =
      category === "marine" ? 6 :
      category === "motorcycle" ? 3 :
      5;

    const laborHours = baseHours;
    const laborSubtotal = Math.round(laborHours * laborRate);

    const materialsLow = category === "marine" ? 200 : 150;
    const materialsHigh = category === "marine" ? 450 : 350;

    const shopMinimum = 250;

    const totalLow = Math.max(shopMinimum, laborSubtotal + materialsLow);
    const totalHigh = Math.max(shopMinimum, laborSubtotal + materialsHigh);

    const estimate = {
      laborHours,
      laborRate,
      laborSubtotal,
      materialsLow,
      materialsHigh,
      shopMinimum,
      totalLow,
      totalHigh,
      assumptions: Array.isArray(assessment?.assumptions) ? assessment.assumptions : [],
    };

    // ✅ Update quote with analysis/estimate (so admin can see it)
    await sql`
      UPDATE quotes
      SET
        assessment = ${JSON.stringify(assessment)},
        estimate = ${JSON.stringify(estimate)}
      WHERE id = ${quoteId}
    `.catch(() => {});

    // ✅ Optional: email the shop with quick info + links
    let emailSent = false;
    const shopTo = process.env.ADMIN_EMAIL || "maggioupholstery@gmail.com";

    if (resend) {
      const photosHtml = photoUrls
        .map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a></li>`)
        .join("");

      const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;">
          <h2>New Photo Quote</h2>
          <p><b>Name:</b> ${esc(name)}<br/>
             <b>Email:</b> ${esc(email)}<br/>
             <b>Phone:</b> ${esc(phone)}<br/>
             <b>Category:</b> ${esc(category)}<br/>
             <b>Quote ID:</b> ${esc(quoteId)}</p>

          <p><b>Notes:</b><br/>${esc(notes).replace(/\n/g, "<br/>")}</p>

          <h3>Photos</h3>
          <ul>${photosHtml}</ul>

          <h3>AI Assessment</h3>
          <pre style="background:#111; color:#eee; padding:12px; border-radius:12px; overflow:auto;">
${esc(JSON.stringify({ assessment, estimate }, null, 2))}
          </pre>
        </div>
      `.trim();

      try {
        const sent = await resend.emails.send({
          from: "Maggio Upholstery <quotes@maggioupholstery.com>",
          to: shopTo,
          subject: `New Photo Quote (${category}) — ${name}`,
          html,
        });

        emailSent = !!sent?.data?.id;

        await sql`
          UPDATE quotes
          SET email_sent = ${emailSent}
          WHERE id = ${quoteId}
        `.catch(() => {});
      } catch {
        emailSent = false;
      }
    }

    // ✅ Return FAST (no preview here)
    return NextResponse.json({
  ok: true,
  quoteId,
  emailSent,
  assessment,
  estimate,
  photoUrls, // ✅ add this so the client can retry render without re-uploading
  previewImageDataUrl: "", // intentionally empty now
});

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Quote failed" },
      { status: 500 }
    );
  }
}
