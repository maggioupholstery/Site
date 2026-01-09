import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Lock this down: images only
        // You can also validate clientPayload here if you want
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
          // keep reasonable; Blob can handle big, but don’t invite abuse
          maximumSizeInBytes: 12 * 1024 * 1024, // 12MB
          tokenPayload: JSON.stringify({
            pathname,
            clientPayload: clientPayload ?? null,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Optional: log or store blob.url in DB
        console.log("Blob upload completed:", {
          url: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType,
          tokenPayload,
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Blob upload failed" },
      { status: 400 }
    );
  }
}

