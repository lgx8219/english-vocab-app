import { NextResponse } from "next/server";
import { logAITask } from "@/lib/ai/tasks";
import { extractWordsFromImage } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

const maxImageBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) {
    return NextResponse.json({ error: "请先在 AI 设置页配置支持视觉识别的 API Key。" }, { status: 400 });
  }

  const { imageDataUrl, mimeType } = await request.json();

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return NextResponse.json({ error: "缺少图片内容。" }, { status: 400 });
  }

  if (!imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "只支持 jpg、jpeg、png、webp 图片 OCR。" }, { status: 400 });
  }

  const base64 = imageDataUrl.split(",")[1] ?? "";
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (estimatedBytes > maxImageBytes) {
    return NextResponse.json({ error: "图片最大 5MB，请压缩后再上传。" }, { status: 413 });
  }

  try {
    const result = await extractWordsFromImage({
      imageDataUrl,
      mimeType: typeof mimeType === "string" ? mimeType : "image/png",
      config
    });

    await logAITask({
      userId: auth.user.id,
      taskType: "image_ocr",
      input: {
        mimeType: typeof mimeType === "string" ? mimeType : "image/png",
        estimatedBytes
      },
      output: {
        wordCount: result.data.items.length,
        rawTextLength: result.data.rawText.length,
        warnings: result.data.warnings
      },
      provider: config.provider,
      model: config.model,
      inputTokens: result.meta.inputTokens,
      outputTokens: result.meta.outputTokens
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("DeepSeek") || message.includes("vision") || message.includes("图片 OCR")) {
      return NextResponse.json(
        { error: "当前模型不支持图片识别，请切换到支持视觉输入的模型。" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "图片文字识别失败，请换一张更清晰的图片，或确认当前 AI 模型支持视觉识别。" },
      { status: 500 }
    );
  }
}
