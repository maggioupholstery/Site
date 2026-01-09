import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { sql } from "@vercel/postgres";
import { put } from "@vercel/blob";
import { Resend } from "resend";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function cleanCategory(x: unknown) {
  const v = String(x || "auto");
  return v === "marine" || v === "motorcycle" ? v : "auto";
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getShopTo() {
  return (
    process.env.QUOTE_TO_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "maggioupholstery@gmail.com"
  );
}

function siteBaseUrl(req: NextRequest) {
  // prefer explicit env if you set it
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/$/, "");
  // fallback to request host
  const host = req.headers.get("host") || "www.maggioupholstery.com";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
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

    const baseUrl = siteBaseUrl(req);
    const adminLink = `${baseUrl}/admin/quotes/${encodeURIComponent(quoteId)}`;

    // 1) If we already rendered, return it instantly (and don’t email again)
    try {
      const existing = await sql`
        SELECT preview_image_url, preview_image_data_url
        FROM quotes
        WHERE id = ${quoteId}
        LIMIT 1
      `;
      const prevUrl = String(existing.rows?.[0]?.preview_image_url || "");
      const prevData = String(existing.rows?.[0]?.preview_image_data_url || "");
      if (prevUrl || prevData) {
        return NextResponse.json({
          previewImageUrl: prevUrl,
          previewImageDataUrl: prevData,
          cached: true,
          adminLink,
        });
      }
    } catch {
      // ignore
    }

    // 2) Pull quote details for the email (so you get the exact lead + context)
    let quoteRow: any = null;
    try {
      const q = await sql`
        SELECT id, name, email, phone, category, notes, files
        FROM quotes
        WHERE id = ${quoteId}
        LIMIT 1
      `;
      quoteRow = q.rows?.[0] || null;
    } catch {
      quoteRow = null;
    }

    // 3) Generate the concept render (slow)
    const prompt = `
Create a single photorealistic "after" concept render of an upholstery job.

Rules:
- Keep the subject consistent with the provided photos (same item, angle, composition).
- Improve/restore upholstery: clean lines, tight fit, corrected damage, professional finish.
- Do NOT add logos or text.
- Keep background basically the same (clean, realistic).
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
            ...photoUrls.slice(0, 3).map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "auto" as const, // required by TS types
            })),
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          quality: "medium",
          size: "1024x1024",
          background: "opaque",
        } as any,
      ],
      tool_choice: { type: "image_generation" } as any,
    });

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

    // 4) Convert to binary + upload to Vercel Blob so you have a real URL
    const pngBuffer = Buffer.from(base64, "base64");
    const blobPath = `renders/${quoteId}-${Date.now()}.png`;

    let previewImageUrl = "";
    try {
      const putRes = await put(blobPath, pngBuffer, {
        access: "public",
        contentType: "image/png",
      });
      previewImageUrl = putRes.url;
    } catch (e: any) {
      // If blob upload fails, we can still return data URL to client
      previewImageUrl = "";
    }

    // Keep data URL for your current frontend (<img src="..."> works)
    const previewImageDataUrl = `data:image/png;base64,${base64}`;

    // 5) Store it in DB
    // (We attempt preview_image_url too; if column isn't there, ignore)
    try {
      await sql`
        UPDATE quotes
        SET preview_image_data_url = ${previewImageDataUrl}
        WHERE id = ${quoteId}
      `;
    } catch {
      // ignore
    }

    if (previewImageUrl) {
      try {
        await sql`
          UPDATE quotes
          SET preview_image_url = ${previewImageUrl}
          WHERE id = ${quoteId}
        `;
      } catch {
        // ignore (column may not exist)
      }
    }

    // 6) Email you the render (second email) so you always receive what they saw
    // Even if customer leaves, YOU can trigger render from admin later and still get this email.
    let renderEmailSent = false;
    let renderEmailError: string | null = null;

    if (resend) {
      const shopTo = getShopTo();

      const n = esc(quoteRow?.name || "");
      const em = esc(quoteRow?.email || "");
      const ph = esc(quoteRow?.phone || "");
      const cat = esc(quoteRow?.category || category);
      const nt = esc(quoteRow?.notes || "");

      // Try to list submitted photo URLs from DB if present
      let submittedPhotoLinks = "";
      try {
        const files = quoteRow?.files;
        const arr = Array.isArray(files)
          ? files
          : typeof files === "string"
          ? JSON.parse(files)
          : files && typeof files === "object"
          ? files
          : [];

        const urls: string[] = Array.isArray(arr)
          ? arr.map((x: any) => String(x?.url || x)).filter(Boolean)
          : [];

        if (urls.length) {
          submittedPhotoLinks = urls
            .slice(0, 6)
            .map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a></li>`)
            .join("");
        }
      } catch {
        // ignore
      }

      const renderLinkHtml = previewImageUrl
        ? `<p><b>Render link:</b> <a href="${esc(previewImageUrl)}" target="_blank" rel="noreferrer">${esc(previewImageUrl)}</a></p>`
        : `<p><b>Render:</b> (Blob upload failed — open admin link to view)</p>`;

      const renderImgHtml = previewImageUrl
        ? `<div style="margin-top:12px;">
             <a href="${esc(previewImageUrl)}" target="_blank" rel="noreferrer">
               <img src="${esc(previewImageUrl)}" alt="Concept render" style="max-width:100%; border-radius:16px; border:1px solid #333;" />
             </a>
           </div>`
        : "";

      const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;">
          <h2>Concept Render Ready</h2>

          <p>
            <b>Name:</b> ${n || "—"}<br/>
            <b>Email:</b> ${em || "—"}<br/>
            <b>Phone:</b> ${ph || "—"}<br/>
            <b>Category:</b> ${cat}<br/>
            <b>Quote ID:</b> ${esc(quoteId)}
          </p>

          <p><b>Admin:</b> <a href="${esc(adminLink)}" target="_blank" rel="noreferrer">${esc(adminLink)}</a></p>
          ${renderLinkHtml}

          ${renderImgHtml}

          ${nt ? `<p><b>Notes:</b><br/>${nt.replace(/\n/g, "<br/>")}</p>` : ""}

          ${
            submittedPhotoLinks
              ? `<h3>Submitted Photos</h3><ul>${submittedPhotoLinks}</ul>`
              : ""
          }
        </div>
      `.trim();

      try {
        const sent = await resend.emails.send({
          from: "Maggio Upholstery <quotes@maggioupholstery.com>",
          to: shopTo,
          subject: `Concept Render Ready — ${quoteRow?.name || "New Lead"} (${category})`,
          html,
        });

        renderEmailSent = !!sent?.data?.id;

        // optional: track status
        try {
          await sql`
            UPDATE quotes
            SET render_email_sent = ${renderEmailSent}
            WHERE id = ${quoteId}
          `;
        } catch {
          // ignore (column may not exist)
        }
      } catch (e: any) {
        renderEmailSent = false;
        renderEmailError = e?.message || "Render email failed";
      }
    }

    return NextResponse.json({
      previewImageUrl,
      previewImageDataUrl,
      cached: false,
      adminLink,
      renderEmailSent,
      renderEmailError,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Render failed" },
      { status: 500 }
    );
  }
}
