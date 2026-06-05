import { NextResponse } from "next/server";
import { getDefaultModelForProvider, testAIConnection } from "@/lib/ai/provider";
import { deleteUserAIKey, listUserAIKeys, normalizeProvider, publicKeyRecord, saveUserAIKey } from "@/lib/ai/user-keys";
import { requireAllowedUser } from "@/lib/auth/api";

export async function GET() {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;

  try {
    const records = await listUserAIKeys(auth.user.id);
    return NextResponse.json({
      keys: records.map(publicKeyRecord),
      defaults: {
        openai: getDefaultModelForProvider("openai"),
        deepseek: getDefaultModelForProvider("deepseek")
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 AI 设置失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;

  const { provider, apiKey, model } = await request.json();
  const normalizedProvider = normalizeProvider(provider);

  if (!normalizedProvider) {
    return NextResponse.json({ error: "请选择 OpenAI 或 DeepSeek。" }, { status: 400 });
  }

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 8) {
    return NextResponse.json({ error: "请输入有效的 API Key。" }, { status: 400 });
  }

  if (!process.env.API_KEY_ENCRYPTION_SECRET) {
    return NextResponse.json({ error: "服务器缺少 API_KEY_ENCRYPTION_SECRET。请先在 .env.local 里配置它，然后重启网站。" }, { status: 500 });
  }

  const activeModel = typeof model === "string" && model.trim() ? model.trim() : getDefaultModelForProvider(normalizedProvider);

  try {
    await testAIConnection({
      provider: normalizedProvider,
      model: activeModel,
      apiKey: apiKey.trim(),
      tokenMode: "normal"
    });
  } catch {
    return NextResponse.json({ error: "连接失败，请检查 API Key 是否正确。" }, { status: 400 });
  }

  let record;
  try {
    record = await saveUserAIKey({
      user: auth.user,
      provider: normalizedProvider,
      apiKey,
      model: activeModel
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存 API Key 失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    message: "AI 已连接，可以使用。",
    key: publicKeyRecord(record)
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAllowedUser();
  if (auth.response) return auth.response;

  const { provider } = await request.json();
  const normalizedProvider = normalizeProvider(provider);

  if (!normalizedProvider) {
    return NextResponse.json({ error: "请选择 OpenAI 或 DeepSeek。" }, { status: 400 });
  }

  try {
    await deleteUserAIKey(auth.user.id, normalizedProvider);
    return NextResponse.json({ message: "已删除 API Key。" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败。" }, { status: 500 });
  }
}
