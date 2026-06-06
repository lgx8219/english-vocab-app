import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateCard, WordCardQualityError } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { word } = await request.json();
  if (!word || typeof word !== "string") {
    return NextResponse.json({ error: "word is required" }, { status: 400 });
  }

  try {
    const result = await generateCard(word, config);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WordCardQualityError) {
      return NextResponse.json({ error: "词卡生成失败，请重试。可以换一个更稳定的模型，或稍后再试。" }, { status: 502 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "词卡生成失败，请重试。可以换一个更稳定的模型，或稍后再试。" },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : "";
    if (message.includes("401") || message.includes("403")) {
      return NextResponse.json({ error: "AI API Key 无效或没有权限，请到 AI 设置页重新测试连接。" }, { status: 401 });
    }
    if (message.includes("404")) {
      return NextResponse.json({ error: "当前模型名不可用，请到 AI 设置页换成可用模型。" }, { status: 400 });
    }
    if (message.includes("429")) {
      return NextResponse.json({ error: "AI 调用太频繁或额度不足，请稍后再试。" }, { status: 429 });
    }

    return NextResponse.json({ error: "词卡生成失败，请检查 AI 设置后重试。" }, { status: 500 });
  }
}
