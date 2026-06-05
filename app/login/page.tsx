"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Supabase 还没有配置。请先填写 .env.local。");
      setLoading(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const allowed = await checkAllowedEmail(normalizedEmail);
    if (!allowed) {
      setStatus("邮箱不在白名单。请联系网站所有者添加你的邮箱。");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    setLoading(false);

    if (error) {
      setStatus(loginErrorMessage(error.message));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleMagicLink() {
    setMagicLoading(true);
    setStatus("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Supabase 还没有配置。请先填写 .env.local。");
      setMagicLoading(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus("请先输入邮箱。");
      setMagicLoading(false);
      return;
    }

    const allowed = await checkAllowedEmail(normalizedEmail);
    if (!allowed) {
      setStatus("邮箱不在白名单。请联系网站所有者添加你的邮箱。");
      setMagicLoading(false);
      return;
    }

    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/`
      }
    });

    setMagicLoading(false);
    setStatus(error ? error.message : "登录邮件已发送。请打开邮箱里的链接完成登录。");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="surface w-full max-w-md rounded-lg p-6">
        <div className="grid h-11 w-11 place-items-center rounded-md bg-ink text-white">
          <Mail className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">登录 Vocab AI Study</h1>
        <p className="mt-2 text-sm leading-6 text-black/60">使用白名单邮箱和密码登录。Magic Link 保留为备用方式。</p>

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
          <label className="block text-sm">
            <span className="font-medium">密码</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
              placeholder="至少 6 位"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="focus-ring w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "登录中" : "邮箱密码登录"}
          </button>
        </form>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading}
            className="focus-ring w-full rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/70 disabled:opacity-60"
          >
            {magicLoading ? "发送中" : "备用：发送 Magic Link"}
          </button>
          <p className="text-center text-sm text-black/60">
            还没有账号？{" "}
            <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
              去注册
            </Link>
          </p>
        </div>

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

function loginErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "账号不存在或密码错误。";
  if (lower.includes("email not confirmed")) return "邮箱还没有确认，请先打开注册确认邮件。";
  return "登录失败，请检查邮箱和密码。";
}
