import { NextResponse } from "next/server";
import { generateOutputPrompt } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { words, length, targetCount, difficulty, recentPrompts, attempt } = await request.json();
  if (!Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: "words is required" }, { status: 400 });
  }

  try {
    let lastError: unknown = null;
    for (let retry = 0; retry < 2; retry += 1) {
      try {
        const result = await generateOutputPrompt(words.map(String), config, length === "paragraph" ? "paragraph" : "sentence", {
          targetCount: Number(targetCount) || undefined,
          difficulty: typeof difficulty === "string" ? difficulty : undefined,
          recentPrompts: Array.isArray(recentPrompts) ? recentPrompts.map(String) : [],
          attempt: (Number(attempt) || 0) + retry
        });
        return NextResponse.json(result);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } catch {
    return NextResponse.json({ error: "题目生成失败，请重试。" }, { status: 502 });
  }
}
