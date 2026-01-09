import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    const response = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Optional validation
        if (!pathname.startsWith("quotes/")) {
          throw new Error("Invalid upload path");
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          tokenPayload: clientPayload,
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // NOTE:
        // PutBlobResult does NOT include `size` in current typings
        // Do NOT reference blob.size here

        console.log("Blob upload completed:", {
          url: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType,
          tokenPayload,
        });
      },
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("Blob upload error:", err);
    return NextResponse.json(
      { error: err?.message || "Blob upload failed" },
      { status: 500 }
    );
  }
}
