import type { User } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/types";
import { decryptApiKey, encryptApiKey } from "@/lib/crypto/api-key-encryption";

export type UserAIKeyRecord = {
  id: string;
  user_id: string;
  provider: AIProvider;
  encrypted_api_key: string;
  model: string;
  key_preview: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UserAIKeyPublic = {
  provider: AIProvider;
  model: string;
  keyPreview: string | null;
  isActive: boolean;
  updatedAt: string;
};

function getSupabaseRestConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

function parseSupabaseError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const error = payload as { message?: string; hint?: string; details?: string; code?: string };
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ");
}

async function errorMessageFromResponse(response: Response) {
  try {
    return parseSupabaseError(await response.json());
  } catch {
    return "";
  }
}

function databaseError(message: string) {
  if (message.includes("user_ai_keys") || message.includes("PGRST") || message.includes("relation")) {
    return new Error("user_ai_keys 表还没有创建。请先在 Supabase SQL Editor 运行第三步的 SQL。");
  }
  return new Error("AI Key 数据库操作失败。");
}

function serviceHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };
}

function defaultModelFor(provider: AIProvider) {
  return provider === "deepseek" ? "deepseek-chat" : "gpt-4.1-mini";
}

function keyPreview(apiKey: string) {
  const suffix = apiKey.trim().slice(-4);
  return suffix ? `****${suffix}` : null;
}

export function normalizeProvider(provider: unknown): AIProvider | null {
  return provider === "openai" || provider === "deepseek" ? provider : null;
}

export function publicKeyRecord(record: UserAIKeyRecord): UserAIKeyPublic {
  return {
    provider: record.provider,
    model: record.model,
    keyPreview: record.key_preview,
    isActive: record.is_active,
    updatedAt: record.updated_at
  };
}

export async function getUserAIKey(userId: string, provider: AIProvider) {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const params = new URLSearchParams({
    select: "id,user_id,provider,encrypted_api_key,model,key_preview,is_active,created_at,updated_at",
    user_id: `eq.${userId}`,
    provider: `eq.${provider}`,
    is_active: "eq.true",
    limit: "1"
  });

  const response = await fetch(`${config.url}/rest/v1/user_ai_keys?${params.toString()}`, {
    headers: serviceHeaders(config.serviceKey),
    cache: "no-store"
  });

  if (!response.ok) throw databaseError(await errorMessageFromResponse(response));
  const rows = (await response.json()) as UserAIKeyRecord[];
  return rows[0] ?? null;
}

export async function listUserAIKeys(userId: string) {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const params = new URLSearchParams({
    select: "id,user_id,provider,encrypted_api_key,model,key_preview,is_active,created_at,updated_at",
    user_id: `eq.${userId}`,
    is_active: "eq.true",
    order: "updated_at.desc"
  });

  const response = await fetch(`${config.url}/rest/v1/user_ai_keys?${params.toString()}`, {
    headers: serviceHeaders(config.serviceKey),
    cache: "no-store"
  });

  if (!response.ok) throw databaseError(await errorMessageFromResponse(response));
  return (await response.json()) as UserAIKeyRecord[];
}

export async function saveUserAIKey({
  user,
  provider,
  apiKey,
  model
}: {
  user: User;
  provider: AIProvider;
  apiKey: string;
  model?: string;
}) {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const normalizedKey = apiKey.trim();
  const activeModel = model?.trim() || defaultModelFor(provider);
  const now = new Date().toISOString();

  const response = await fetch(`${config.url}/rest/v1/user_ai_keys?on_conflict=user_id,provider`, {
    method: "POST",
    headers: {
      ...serviceHeaders(config.serviceKey),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      user_id: user.id,
      provider,
      encrypted_api_key: encryptApiKey(normalizedKey),
      model: activeModel,
      key_preview: keyPreview(normalizedKey),
      is_active: true,
      updated_at: now
    }),
    cache: "no-store"
  });

  if (!response.ok) throw databaseError(await errorMessageFromResponse(response));
  const rows = (await response.json()) as UserAIKeyRecord[];
  return rows[0];
}

export async function deleteUserAIKey(userId: string, provider: AIProvider) {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    provider: `eq.${provider}`
  });

  const response = await fetch(`${config.url}/rest/v1/user_ai_keys?${params.toString()}`, {
    method: "DELETE",
    headers: serviceHeaders(config.serviceKey),
    cache: "no-store"
  });

  if (!response.ok) throw databaseError(await errorMessageFromResponse(response));
}

export async function getUserAIConfig(userId: string, provider: AIProvider = "openai") {
  const record = await getUserAIKey(userId, provider);
  if (!record) return null;

  return {
    provider,
    model: record.model || defaultModelFor(provider),
    apiKey: decryptApiKey(record.encrypted_api_key),
    tokenMode: "normal" as const
  };
}

export async function getPreferredUserAIConfig(userId: string) {
  const records = await listUserAIKeys(userId);
  const record = records[0];
  if (!record) return null;

  return {
    provider: record.provider,
    model: record.model || defaultModelFor(record.provider),
    apiKey: decryptApiKey(record.encrypted_api_key),
    tokenMode: "normal" as const
  };
}
