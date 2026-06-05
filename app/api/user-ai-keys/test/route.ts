import { NextResponse } from "next/server";
import { testAIConnection } from "@/lib/ai/provider";
import { getPreferredUserAIConfig, getUserAIConfig, normalizeProvider } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;

  let provider: unknown = null;
  try {
    const body = await request.json();
    provider = body?.provider;
  } catch {
    provider = null;
  }

  const normalizedProvider = normalizeProvider(provider);
  const config = normalizedProvider
    ? await getUserAIConfig(auth.user.id, normalizedProvider)
    : await getPreferredUserAIConfig(auth.user.id);

  if (!config) {
    return NextResponse.json({ error: "请先到 AI 设置页输入你的 API Key。" }, { status: 400 });
  }

  try {
    await testAIConnection(config);
  } catch {
    return NextResponse.json({ error: "连接失败，请检查 API Key 是否正确。" }, { status: 400 });
  }

  return NextResponse.json({
    status: "connected",
    provider: config.provider,
    model: config.model,
    message: "AI 已连接，可以使用。"
  });
}
