"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { useThemeMode } from "@/hooks/useThemeMode";

type AllowedUser = {
  id: string;
  email: string;
  created_at: string;
};

export default function AllowedUsersAdminPage() {
  useThemeMode();

  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/admin/allowed-users", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        setStatus(json.error ?? "读取白名单失败。");
        return;
      }
      setUsers(Array.isArray(json.users) ? json.users : []);
    } catch {
      setStatus("读取白名单失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!isValidEmail(normalizedEmail)) {
      setStatus("邮箱格式不正确。");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/allowed-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "添加失败。");
        return;
      }

      setUsers((current) => [json.user, ...current.filter((item) => item.email !== json.user.email)]);
      setEmail("");
      setStatus("已添加到白名单。");
    } catch {
      setStatus("添加失败，请稍后再试。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(userEmail: string) {
    if (!window.confirm(`确定从白名单删除 ${userEmail} 吗？删除后这个邮箱不能再进入网站。`)) return;

    setStatus("");
    try {
      const response = await fetch("/api/admin/allowed-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "删除失败。");
        return;
      }

      setUsers((current) => current.filter((item) => item.email !== userEmail));
      setStatus("已从白名单删除。");
    } catch {
      setStatus("删除失败，请稍后再试。");
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 lg:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold">白名单管理</h1>
                <p className="mt-1 text-sm text-black/58">只有这里的邮箱可以登录网站。</p>
              </div>
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
          <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="text-sm">
              <span className="font-medium">添加邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
                placeholder="friend@example.com"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="focus-ring mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {saving ? "添加中" : "添加"}
            </button>
          </form>

          {status ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-black/65">{status}</p> : null}
        </section>

        <section className="surface mt-4 overflow-hidden rounded-lg">
          <div className="grid grid-cols-[minmax(0,1fr)_170px_52px] gap-3 border-b border-black/10 px-4 py-3 text-xs font-semibold text-black/50">
            <span>邮箱</span>
            <span>添加时间</span>
            <span>操作</span>
          </div>

          {loading ? <div className="px-4 py-5 text-sm text-black/55">正在读取白名单...</div> : null}
          {!loading && users.length === 0 ? <div className="px-4 py-5 text-sm text-black/55">还没有白名单邮箱。</div> : null}

          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-[minmax(0,1fr)_170px_52px] items-center gap-3 border-b border-black/5 px-4 py-3 text-sm">
              <span className="truncate font-medium">{user.email}</span>
              <span className="text-black/55">{new Date(user.created_at).toLocaleDateString()}</span>
              <button
                type="button"
                onClick={() => handleDelete(user.email)}
                className="focus-ring grid h-8 w-8 place-items-center rounded-md text-coral hover:bg-coral/10"
                aria-label={`删除 ${user.email}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
