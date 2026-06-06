import { NextResponse } from "next/server";
import { generateReadingPrompt } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { words, length } = await request.json();
  if (!Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: "words is required" }, { status: 400 });
  }

  try {
    const result = await generateReadingPrompt(words.map(String), config, length === "sentence" ? "sentence" : "paragraph");
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "阅读题目生成失败，请重试。" }, { status: 502 });
  }
}
