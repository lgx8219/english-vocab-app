import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-users";
import { ADMIN_EMAIL } from "@/lib/auth/constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAllowedUser() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return {
      response: NextResponse.json({ error: "Supabase is not configured." }, { status: 500 })
    };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const allowed = await isEmailAllowed(user.email);
  if (!allowed) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { user };
}

export async function requireAdminUser() {
  const auth = await requireAllowedUser();
  if (auth.response) return auth;

  if (auth.user.email?.toLowerCase() !== ADMIN_EMAIL) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return auth;
}
