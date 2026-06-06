"use client";

import { BookOpen, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReadingPrompt, StudyWord, TranslationGrade } from "@/lib/types";

export function ReadingTranslationTrainer({
  words,
  onStats
}: {
  words: StudyWord[];
  onStats: (inputTokens?: number, outputTokens?: number) => void;
}) {
  const targetWords = useMemo(() => words.filter((item) => item.card).slice(0, 10), [words]);
  const [prompt, setPrompt] = useState<ReadingPrompt | null>(null);
  const [translation, setTranslation] = useState("");
  const [grade, setGrade] = useState<TranslationGrade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [length, setLength] = useState<"sentence" | "paragraph">("paragraph");

  async function generateReading() {
    setLoading(true);
    setError("");
    setGrade(null);
    setTranslation("");
    try {
      const response = await fetch("/api/ai/generate-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: targetWords.map((item) => item.word), length })
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "阅读题目生成失败，请重试。");
        return;
      }
      setPrompt(json.data);
      onStats(json.meta?.inputTokens, json.meta?.outputTokens);
    } catch {
      setError("阅读题目生成失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  async function submitTranslation() {
    if (!prompt || !translation.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/grade-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passage: prompt.passage,
          userTranslation: translation,
          targetWords: prompt.targetWords
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "翻译批改失败，请重试。");
        return;
      }
      setGrade(json.data);
      onStats(json.meta?.inputTokens, json.meta?.outputTokens);
    } catch {
      setError("翻译批改失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="surface rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/45">Reading Translation</p>
          <h2 className="mt-1 text-xl font-semibold">英译中训练</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={length}
            onChange={(event) => setLength(event.target.value as "sentence" | "paragraph")}
            className="focus-ring rounded-md border border-black/15 bg-paper px-3 py-2 text-sm"
          >
            <option value="sentence">句子</option>
            <option value="paragraph">段落</option>
          </select>
          <button
            type="button"
            onClick={generateReading}
            disabled={loading || targetWords.length === 0}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "处理中" : "生成题目"}
          </button>
        </div>
      </div>

      {targetWords.length === 0 ? <p className="mt-4 text-sm text-black/60">先生成词卡，再做英译中训练。</p> : null}
      {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

      {prompt ? (
        <div className="mt-4">
          <div className="rounded-md bg-paper px-3 py-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <BookOpen className="h-4 w-4" />
              {prompt.title}
            </div>
            <p className="leading-6">{prompt.passage}</p>
            <p className="mt-3 text-xs text-black/50">目标词：{prompt.targetWords.join(", ")}</p>
          </div>
          <textarea
            value={translation}
            onChange={(event) => setTranslation(event.target.value)}
            className="focus-ring mt-3 min-h-36 w-full resize-y rounded-md border border-black/15 px-3 py-2 text-sm"
            placeholder="把上面的英文段落翻译成中文"
          />
          <button
            type="button"
            onClick={submitTranslation}
            disabled={loading || !translation.trim()}
            className="focus-ring mt-3 rounded-md bg-mint px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            提交评价
          </button>
        </div>
      ) : null}

      {grade ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-black/10 p-3">
            <p className="text-sm font-semibold">评价 {grade.score} 分</p>
            <p className="mt-1 text-sm text-black/65">{grade.overall_feedback}</p>
          </div>
          <div className="rounded-md bg-paper p-3 text-sm">
            <p className="font-semibold">参考改进版</p>
            <p className="mt-2 text-black/65">{grade.improved_translation}</p>
          </div>
          <div className="space-y-2">
            {grade.target_word_results.map((result) => (
              <div key={result.word} className="rounded-md bg-paper px-3 py-2 text-sm">
                <span className="font-medium">{result.word}</span> · {result.user_translation_status} · {result.comment}
              </div>
            ))}
          </div>
          {grade.review_suggestions.length > 0 ? (
            <div className="rounded-md border border-black/10 p-3 text-sm">
              <p className="font-semibold">复习建议</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-black/65">
                {grade.review_suggestions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
