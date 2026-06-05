import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-users";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const allowed = await isEmailAllowed(email);
  return NextResponse.json({ allowed });
}
