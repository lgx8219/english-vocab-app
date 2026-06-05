"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useThemeMode } from "@/hooks/useThemeMode";

export default function ResetPasswordPage() {
  useThemeMode();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus("请输入邮箱。");
      return;
    }

    const allowed = await checkAllowedEmail(normalizedEmail);
    if (!allowed) {
      setStatus("该邮箱没有访问权限。");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Supabase 还没有配置。");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings/account`
    });
    setLoading(false);

    setStatus(error ? "重置密码邮件发送失败，请稍后再试。" : "重置密码邮件已发送，请打开邮箱里的链接。");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="surface w-full max-w-md rounded-lg p-6">
        <div className="grid h-11 w-11 place-items-center rounded-md bg-ink text-white">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">重置密码</h1>
        <p className="mt-2 text-sm leading-6 text-black/60">输入白名单邮箱，系统会发送重置密码邮件。</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">邮箱</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="focus-ring w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "发送中" : "发送重置邮件"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-black/60">
          想起密码了？{" "}
          <Link href="/login" className="font-medium text-ink underline underline-offset-4">
            返回登录
          </Link>
        </p>

        {status ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-black/65">{status}</p> : null}
      </section>
    </main>
  );
}

async function checkAllowedEmail(email: string) {
  const response = await fetch("/api/auth/check-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!response.ok) return false;
  const json = (await response.json()) as { allowed?: boolean };
  return Boolean(json.allowed);
}
