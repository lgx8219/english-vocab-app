"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

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

    if (password !== confirmPassword) {
      setStatus("两次输入的密码不一致。");
      setLoading(false);
      return;
    }

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

    const origin = window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/`
      }
    });

    setLoading(false);

    if (error) {
      setStatus(signupErrorMessage(error.message));
      return;
    }

    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }

    setStatus("注册成功。请查看邮箱确认邮件，确认后就可以用邮箱和密码登录。");
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="surface w-full max-w-md rounded-lg p-6">
        <div className="grid h-11 w-11 place-items-center rounded-md bg-ink text-white">
          <UserPlus className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">注册账号</h1>
        <p className="mt-2 text-sm leading-6 text-black/60">只有白名单邮箱可以注册并进入网站。</p>

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
          <label className="block text-sm">
            <span className="font-medium">确认密码</span>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
              placeholder="再输入一次密码"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="focus-ring w-full rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "注册中" : "注册"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-black/60">
          已经有账号？{" "}
          <Link href="/login" className="font-medium text-ink underline underline-offset-4">
            去登录
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

function signupErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("user already registered")) return "这个邮箱已经注册过，请直接登录。";
  if (lower.includes("password")) return "密码不符合要求，请至少输入 6 位。";
  return "注册失败，请稍后再试。";
}
