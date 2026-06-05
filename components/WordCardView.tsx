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
  const [exampleIndex, setExampleIndex] = useState(0);
  const example = useMemo(() => item.card?.examples?.[exampleIndex % Math.max(1, item.card.examples.length)], [item.card, exampleIndex]);

  async function generate() {
    setLoading(true);
    try {
      const response = await fetch("/api/ai/generate-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: item.word })
      });
      const json = await response.json();
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
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold">核心意思</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {item.card.meanings.map((meaning, index) => (
              <li key={`${meaning.meaningCn}-${index}`} className="rounded-md bg-paper px-3 py-2">
                {meaning.partOfSpeech} · {meaning.meaningCn}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-semibold">常见搭配</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.card.collocations.map((collocation) => (
              <span key={collocation} className="rounded-md border border-black/10 px-2 py-1 text-sm">
                {collocation}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h3 className="text-sm font-semibold">派生词</h3>
          <div className="mt-2 space-y-2 text-sm">
            {item.card.derivedWords.map((entry) => (
              <div key={entry.word} className="rounded-md bg-paper px-3 py-2">
                <span className="font-medium">{entry.word}</span> · {entry.meaningCn}
              </div>
            ))}
          </div>
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
      </div>
    </article>
  );
}
