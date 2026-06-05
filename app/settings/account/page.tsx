"use client";

import { KeyRound, Mail, UserCircle } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useThemeMode } from "@/hooks/useThemeMode";

export default function AccountSettingsPage() {
  useThemeMode();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, []);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!newPassword) {
      setStatus("请输入新密码。");
      return;
    }

    if (newPassword.length < 8) {
      setStatus("新密码至少 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus("两次输入的密码不一致。");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Supabase 还没有配置。");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      setStatus(passwordErrorMessage(error.message));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setStatus("密码修改成功。");
  }

  return (
    <main className="min-h-screen px-4 py-6 lg:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
              <UserCircle className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold">账号管理</h1>
              <p className="mt-1 text-sm text-black/58">查看邮箱、修改密码和退出登录。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="focus-ring rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:bg-paper">
              回到网站
            </Link>
            <LogoutButton />
          </div>
        </header>

        <section className="surface rounded-lg p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-paper text-ink">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm text-black/55">当前登录邮箱</p>
              <p className="font-semibold">{email || "正在读取..."}</p>
            </div>
          </div>
        </section>

        <section className="surface mt-4 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-paper text-ink">
              <KeyRound className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold">修改密码</h2>
          </div>

          <form onSubmit={handleChangePassword} className="mt-5 grid gap-4">
            <label className="text-sm">
              <span className="font-medium">新密码</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
                placeholder="至少 8 位"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">确认新密码</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
                placeholder="再输入一次新密码"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="focus-ring w-fit rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "修改中" : "修改密码"}
            </button>
          </form>

          {status ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-black/65">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}

function passwordErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("weak") || lower.includes("password")) return "密码修改失败，请确认新密码至少 8 位。";
  if (lower.includes("not authenticated") || lower.includes("jwt")) return "登录状态已失效，请重新登录。";
  return "密码修改失败，请稍后再试。";
}
