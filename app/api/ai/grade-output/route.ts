import { NextResponse } from "next/server";
import { gradeOutput } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { chinese, userEnglish, targetWords } = await request.json();
  if (!chinese || !userEnglish || !Array.isArray(targetWords)) {
    return NextResponse.json({ error: "chinese, userEnglish and targetWords are required" }, { status: 400 });
  }

  try {
    const result = await gradeOutput({ chinese, userEnglish, targetWords, config });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "批改失败，请重试。" }, { status: 502 });
  }
}
