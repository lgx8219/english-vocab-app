import { NextResponse } from "next/server";
import { gradeTranslation } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { passage, userTranslation, targetWords } = await request.json();
  if (!passage || !userTranslation || !Array.isArray(targetWords)) {
    return NextResponse.json({ error: "passage, userTranslation and targetWords are required" }, { status: 400 });
  }

  try {
    const result = await gradeTranslation({
      passage: String(passage),
      userTranslation: String(userTranslation),
      targetWords: targetWords.map(String),
      config
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "翻译批改失败，请重试。" }, { status: 502 });
  }
}
