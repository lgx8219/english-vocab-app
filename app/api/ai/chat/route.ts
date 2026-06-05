import { NextResponse } from "next/server";
import { chatWithTutor } from "@/lib/ai/provider";
import { getPreferredUserAIConfig } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;
  const config = await getPreferredUserAIConfig(auth.user.id);
  if (!config) return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });

  const { message, messages, context } = await request.json();
  const result = await chatWithTutor(
    typeof message === "string" ? message : "",
    Array.isArray(messages) ? messages.slice(-5) : [],
    { ...(context ?? {}), mode: context?.mode ?? "chat" },
    config
  );
  return NextResponse.json(result);
}
