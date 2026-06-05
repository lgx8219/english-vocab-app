export type AllowedUser = {
  id: string;
  email: string;
  created_at: string;
};

function getSupabaseRestConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

function serviceHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export async function isEmailAllowed(email?: string | null) {
  if (!email) return false;

  const config = getSupabaseRestConfig();
  if (!config) return false;

  const params = new URLSearchParams({
    select: "id",
    email: `eq.${normalizeEmail(email)}`,
    limit: "1"
  });

  const response = await fetch(`${config.url}/rest/v1/allowed_users?${params.toString()}`, {
    headers: serviceHeaders(config.serviceKey),
    cache: "no-store"
  });

  if (!response.ok) return false;

  const rows = (await response.json()) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function listAllowedUsers() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const params = new URLSearchParams({
    select: "id,email,created_at",
    order: "created_at.desc"
  });

  const response = await fetch(`${config.url}/rest/v1/allowed_users?${params.toString()}`, {
    headers: serviceHeaders(config.serviceKey),
    cache: "no-store"
  });

  if (!response.ok) throw new Error("Failed to load allowed users.");
  return (await response.json()) as AllowedUser[];
}

export async function addAllowedUser(email: string) {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { ok: false as const, reason: "invalid_email" as const };
  }

  if (await isEmailAllowed(normalizedEmail)) {
    return { ok: false as const, reason: "exists" as const };
  }

  const response = await fetch(`${config.url}/rest/v1/allowed_users`, {
    method: "POST",
    headers: {
      ...serviceHeaders(config.serviceKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({ email: normalizedEmail }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error("Failed to add allowed user.");
  const rows = (await response.json()) as AllowedUser[];
  return { ok: true as const, user: rows[0] };
}

export async function deleteAllowedUser(email: string) {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { ok: false as const, reason: "invalid_email" as const };
  }

  const params = new URLSearchParams({
    email: `eq.${normalizedEmail}`
  });

  const response = await fetch(`${config.url}/rest/v1/allowed_users?${params.toString()}`, {
    method: "DELETE",
    headers: serviceHeaders(config.serviceKey),
    cache: "no-store"
  });

  if (!response.ok) throw new Error("Failed to delete allowed user.");
  return { ok: true as const };
}
