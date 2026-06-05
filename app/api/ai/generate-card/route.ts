import { NextResponse } from "next/server";
import { generateCard } from "@/lib/ai/provider";
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

  const result = await generateCard(word, config);
  return NextResponse.json(result);
}
