"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudyWord, WordCard } from "@/lib/types";

export function WordCardView({
  item,
  onGenerated,
  onStats
}: {
  item: StudyWord;
  onGenerated: (card: WordCard) => void;
  onStats: (inputTokens?: number, outputTokens?: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const example = useMemo(() => item.card?.examples?.[exampleIndex % Math.max(1, item.card.examples.length)], [item.card, exampleIndex]);

  async function generate() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/ai/generate-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: item.word })
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "词卡生成失败，请检查 AI 设置。");
        return;
      }
      if (!json.data?.examples || !Array.isArray(json.data.examples)) {
        setError("AI 返回的词卡格式不完整，请换一个模型或重试。");
        return;
      }
      const now = new Date().toISOString();
      const card: WordCard = {
        ...json.data,
        id: crypto.randomUUID(),
        wordId: item.id,
        examples: json.data.examples.map((entry: WordCard["examples"][number]) => ({
          ...entry,
          id: crypto.randomUUID(),
          wordId: item.id,
          source: entry.source ?? (json.meta?.mocked ? "mock" : "ai"),
          createdAt: now
        })),
        createdAt: now,
        updatedAt: now
      };
      onGenerated(card);
      onStats(json.meta?.inputTokens, json.meta?.outputTokens);
      setSuccess("词卡已保存。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "词卡生成失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  if (!item.card) {
    return (
      <div className="surface rounded-lg p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-black/45">Word Card</p>
            <h2 className="mt-1 text-3xl font-semibold">{item.word}</h2>
            {item.userMeaning ? <p className="mt-2 text-sm text-black/60">你上传的意思：{item.userMeaning}</p> : null}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "生成中" : "生成词卡"}
          </button>
        </div>
        <p className="text-sm text-black/55">词性、词义、派生词、搭配和例句会生成后缓存，不会每次打开重复消耗 token。</p>
        {success ? <p className="mt-3 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint">{success}</p> : null}
        {error ? <p className="mt-3 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}
      </div>
    );
  }

  return (
    <article className="surface rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/45">Word Card</p>
          <h2 className="mt-1 text-4xl font-semibold">{item.card.word}</h2>
          <p className="mt-2 text-sm text-black/55">
            {item.card.phonetic ? `${item.card.phonetic} · ` : ""}
            {item.card.partOfSpeech}
          </p>
        </div>
        <div className="rounded-md border border-black/10 px-3 py-2 text-sm">
          掌握度 <span className="font-semibold">{item.masteryScore}</span>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "生成中" : "重新生成词卡"}
        </button>
      </div>
      {success ? <p className="mt-4 rounded-md bg-mint/10 px-3 py-2 text-sm text-mint">{success}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold">核心意思</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {item.card.meanings.map((meaning, index) => (
              <li key={`${meaning.meaningCn}-${index}`} className="rounded-md bg-paper px-3 py-2">
                <p>{meaning.partOfSpeech ? `${meaning.partOfSpeech} · ` : ""}{meaning.meaningCn}</p>
                {meaning.meaningEn ? <p className="mt-1 text-xs text-black/55">{meaning.meaningEn}</p> : null}
                {meaning.usage ? <p className="mt-1 text-xs text-black/45">{meaning.usage}</p> : null}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-semibold">常见搭配</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.card.collocations.length > 0 ? (
              item.card.collocations.map((collocation) => (
                <span key={collocation} className="rounded-md border border-black/10 px-2 py-1 text-sm">
                  {collocation}
                </span>
              ))
            ) : (
              <p className="text-sm text-black/50">暂无常见搭配</p>
            )}
          </div>
        </section>
        <section>
          <h3 className="text-sm font-semibold">派生词</h3>
          <div className="mt-2 space-y-2 text-sm">
            {item.card.derivedWords.length > 0 ? (
              item.card.derivedWords.map((entry) => (
                <div key={entry.word} className="rounded-md bg-paper px-3 py-2">
                  <span className="font-medium">{entry.word}</span>{entry.pos ? ` · ${entry.pos}` : ""} · {entry.meaningCn}
                </div>
              ))
            ) : (
              <p className="text-sm text-black/50">暂无常见派生词</p>
            )}
          </div>
        </section>
        <section>
          <h3 className="text-sm font-semibold">词根词缀</h3>
          {item.card.rootAffixAnalysis ? (
            <div className="mt-2 rounded-md bg-paper px-3 py-3 text-sm">
              {item.card.rootAffixAnalysis.parts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {item.card.rootAffixAnalysis.parts.map((part) => (
                    <span key={`${part.type}-${part.text}`} className="rounded-md border border-black/10 px-2 py-1">
                      {part.text} · {part.type}
                    </span>
                  ))}
                </div>
              ) : null}
              {item.card.rootAffixAnalysis.memory_logic ? (
                <p className="mt-2 text-black/60">{item.card.rootAffixAnalysis.memory_logic}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-black/50">暂无可靠词根词缀分析</p>
          )}
        </section>
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">缓存例句</h3>
            <button
              type="button"
              onClick={() => setExampleIndex((value) => value + 1)}
              className="focus-ring rounded p-2"
              aria-label="换个例句"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {example ? (
            <div className="mt-2 rounded-md bg-paper px-3 py-3 text-sm">
              <p className="font-medium">{example.sentence}</p>
              <p className="mt-2 text-black/60">{example.translationCn}</p>
              <p className="mt-2 text-xs text-black/45">{example.style}</p>
            </div>
          ) : null}
        </section>
        {item.card.notes ? (
          <section>
            <h3 className="text-sm font-semibold">用法提醒</h3>
            <p className="mt-2 rounded-md bg-paper px-3 py-3 text-sm text-black/65">{item.card.notes}</p>
          </section>
        ) : null}
      </div>
    </article>
  );
}
