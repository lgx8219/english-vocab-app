"use client";

import { KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AIProvider } from "@/lib/types";

type PublicAIKey = {
  provider: AIProvider;
  model: string;
  keyPreview: string | null;
  isActive: boolean;
  updatedAt: string;
};

const defaultModels: Record<AIProvider, string> = {
  openai: "gpt-4.1-mini",
  deepseek: "deepseek-chat"
};

export function AISettingsPanel() {
  const [provider, setProvider] = useState<AIProvider>("openai");
  const [model, setModel] = useState(defaultModels.openai);
  const [apiKey, setApiKey] = useState("");
  const [keys, setKeys] = useState<PublicAIKey[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(true);

  const currentKey = useMemo(() => keys.find((item) => item.provider === provider) ?? null, [keys, provider]);

  useEffect(() => {
    loadKeys();
  }, []);

  useEffect(() => {
    const existing = keys.find((item) => item.provider === provider);
    setModel(existing?.model ?? defaultModels[provider]);
    setApiKey("");
  }, [keys, provider]);

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const response = await fetch("/api/user/ai-key", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        setStatus(json.error ?? "读取 AI 设置失败。");
        return;
      }
      setKeys(Array.isArray(json.keys) ? json.keys : []);
    } catch {
      setStatus("读取 AI 设置失败。");
    } finally {
      setLoadingKeys(false);
    }
  }

  async function saveAndTest() {
    setStatus("");

    if (!apiKey.trim()) {
      setStatus("请输入 API Key。");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/user/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "连接失败，请检查 API Key 是否正确。");
        return;
      }

      setKeys((current) => [json.key, ...current.filter((item) => item.provider !== json.key.provider)]);
      setApiKey("");
      setStatus(json.message ?? "AI 已连接，可以使用。");
    } catch {
      setStatus("连接失败，请检查 API Key 是否正确。");
    } finally {
      setLoading(false);
    }
  }

  async function testExistingKey() {
    setStatus("");
    setLoading(true);
    try {
      const response = await fetch("/api/user-ai-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      const json = await response.json();
      setStatus(response.ok ? "AI 已连接，可以使用。" : json.message ?? "连接失败，请检查 API Key 是否正确。");
    } catch {
      setStatus("连接失败，请检查 API Key 是否正确。");
    } finally {
      setLoading(false);
    }
  }

  async function deleteKey() {
    if (!currentKey) return;
    if (!window.confirm(`确定删除 ${providerLabel(provider)} 的 API Key 吗？删除后相关 AI 功能会提示重新配置。`)) return;

    setStatus("");
    setLoading(true);
    try {
      const response = await fetch("/api/user/ai-key", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      const json = await response.json();

      if (!response.ok) {
        setStatus(json.error ?? "删除失败。");
        return;
      }

      setKeys((current) => current.filter((item) => item.provider !== provider));
      setStatus(json.message ?? "已删除 API Key。");
    } catch {
      setStatus("删除失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="surface rounded-lg p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">接入 AI</h2>
          <p className="mt-1 text-sm leading-6 text-black/60">
            把你的 OpenAI 或 DeepSeek API Key 粘贴到这里，网站会用它为你生成词卡、例句和批改结果。你的 Key 只用于你自己的账号。
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">服务商</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as AIProvider)}
            className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
          >
            <option value="openai">OpenAI / ChatGPT</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium">模型</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="font-medium">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="focus-ring mt-2 w-full rounded-md border border-black/15 bg-white px-3 py-2"
            placeholder={currentKey ? "留空表示不修改，输入新 Key 可重新设置" : "粘贴你的 API Key"}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={saveAndTest} disabled={loading} className="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? "测试中" : "保存并测试"}
        </button>
        <button type="button" onClick={testExistingKey} disabled={loading || !currentKey} className="focus-ring inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />
          测试连接
        </button>
        <button type="button" onClick={deleteKey} disabled={loading || !currentKey} className="focus-ring inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-coral disabled:opacity-50">
          <Trash2 className="h-4 w-4" />
          删除 API Key
        </button>
      </div>

      <div className="mt-5 rounded-md bg-paper p-3 text-sm">
        {loadingKeys ? (
          <p className="text-black/55">正在读取 AI 设置...</p>
        ) : currentKey ? (
          <div className="grid gap-2">
            <StatusRow label="服务商" value={providerLabel(currentKey.provider)} />
            <StatusRow label="模型" value={currentKey.model} />
            <StatusRow label="Key" value={currentKey.keyPreview ?? "已配置"} />
            <StatusRow label="更新时间" value={new Date(currentKey.updatedAt).toLocaleString()} />
            <StatusRow label="连接状态" value="已保存，点击测试连接可再次确认" />
          </div>
        ) : (
          <p className="text-black/55">还没有配置 Key。AI 功能会提示：请先到 AI 设置页输入你的 API Key。</p>
        )}
      </div>

      {status ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-black/65">{status}</p> : null}
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/10 pb-2 last:border-b-0 last:pb-0">
      <span className="text-black/55">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

function providerLabel(provider: AIProvider) {
  return provider === "deepseek" ? "DeepSeek" : "OpenAI / ChatGPT";
}
