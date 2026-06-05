import { NextResponse } from "next/server";
import { addAllowedUser, deleteAllowedUser, isValidEmail, listAllowedUsers, normalizeEmail } from "@/lib/auth/allowed-users";
import { ADMIN_EMAIL } from "@/lib/auth/constants";
import { requireAdminUser } from "@/lib/auth/api";

export async function GET() {
  const auth = await requireAdminUser();
  if (auth.response) return auth.response;

  const users = await listAllowedUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (auth.response) return auth.response;

  const { email } = await request.json();
  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  const result = await addAllowedUser(email);
  if (!result.ok && result.reason === "exists") {
    return NextResponse.json({ error: "该邮箱已在白名单中" }, { status: 409 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  return NextResponse.json({ user: result.user });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminUser();
  if (auth.response) return auth.response;

  const { email } = await request.json();
  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  if (normalizeEmail(email) === ADMIN_EMAIL) {
    return NextResponse.json({ error: "不能删除管理员邮箱" }, { status: 400 });
  }

  await deleteAllowedUser(email);
  return NextResponse.json({ ok: true });
}
