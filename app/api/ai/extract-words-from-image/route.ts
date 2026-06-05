import { NextResponse } from "next/server";
import { extractWordsFromImage } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

const maxImageBytes = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { imageDataUrl, mimeType } = await request.json();

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "imageDataUrl is required" }, { status: 400 });
  }

  if (!imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Only image data URLs are supported" }, { status: 400 });
  }

  const base64 = imageDataUrl.split(",")[1] ?? "";
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (estimatedBytes > maxImageBytes) {
    return NextResponse.json({ error: "Image is too large. Please upload an image under 4MB." }, { status: 413 });
  }

  const result = await extractWordsFromImage({
    imageDataUrl,
    mimeType: typeof mimeType === "string" ? mimeType : "image/png",
    config
  });

  return NextResponse.json(result);
}
