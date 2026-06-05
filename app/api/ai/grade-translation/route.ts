import { NextResponse } from "next/server";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST() {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  return NextResponse.json({ error: "grade-translation is not implemented in this stage." }, { status: 501 });
}
