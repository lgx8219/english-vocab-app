"use client";

import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { OutputGrade, OutputPrompt, StudyWord } from "@/lib/types";
import { updateAfterAnswer } from "@/lib/study";

export function OutputTrainer({
  words,
  onUpdate,
  onStats
}: {
  words: StudyWord[];
  onUpdate: (word: StudyWord) => void;
  onStats: (inputTokens?: number, outputTokens?: number) => void;
}) {
  const targetWords = useMemo(() => words.filter((item) => item.card).slice(0, 5), [words]);
  const [prompt, setPrompt] = useState<OutputPrompt | null>(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<OutputGrade | null>(null);
  const [loading, setLoading] = useState(false);

  async function generatePrompt() {
    setLoading(true);
    setGrade(null);
    try {
      const response = await fetch("/api/ai/generate-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: targetWords.map((item) => item.word) })
      });
      const json = await response.json();
      setPrompt(json.data);
      onStats(json.meta?.inputTokens, json.meta?.outputTokens);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!prompt || !answer.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ai/grade-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chinese: prompt.chinese,
          userEnglish: answer,
          targetWords: prompt.targetWords
        })
      });
      const json = await response.json();
      setGrade(json.data);
      onStats(json.meta?.inputTokens, json.meta?.outputTokens);
      for (const result of json.data.target_word_results) {
        const word = targetWords.find((item) => item.word.toLowerCase() === result.word.toLowerCase());
        if (!word) continue;
        const ok = result.status === "correct" || result.status === "acceptable";
        onUpdate(
          updateAfterAnswer(
            word,
            "usage",
            ok,
            false,
            result.status === "wrong_collocation" ? "collocation_error" : "usage_error",
            answer
          )
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/45">AI Output</p>
          <h2 className="mt-1 text-xl font-semibold">输出训练</h2>
        </div>
        <button
          type="button"
          onClick={generatePrompt}
          disabled={loading || targetWords.length === 0}
          className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "处理中" : "生成中文题"}
        </button>
      </div>

      {targetWords.length === 0 ? <p className="mt-4 text-sm text-black/60">先生成词卡，再做输出训练。</p> : null}

      {prompt ? (
        <div className="mt-4">
          <div className="rounded-md bg-paper px-3 py-3 text-sm">
            <p>{prompt.chinese}</p>
            <p className="mt-2 text-xs text-black/50">必须使用：{prompt.targetWords.join(", ")}</p>
          </div>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="focus-ring mt-3 min-h-32 w-full resize-y rounded-md border border-black/15 px-3 py-2 text-sm"
            placeholder="写下你的英文翻译"
          />
          <button type="button" onClick={submit} disabled={loading} className="focus-ring mt-3 rounded-md bg-mint px-4 py-2 text-sm font-medium text-white">
            提交批改
          </button>
        </div>
      ) : null}

      {grade ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-md border border-black/10 p-3">
            <p className="text-sm font-semibold">得分 {grade.score}</p>
            <p className="mt-1 text-sm text-black/65">{grade.overall_feedback}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Revision title="最小修改版" text={grade.minimal_revision} />
            <Revision title="自然表达版" text={grade.natural_revision} />
            <Revision title="考试高分版" text={grade.exam_style_revision} />
          </div>
          <div className="space-y-2">
            {grade.target_word_results.map((result) => (
              <div key={result.word} className="rounded-md bg-paper px-3 py-2 text-sm">
                <span className="font-medium">{result.word}</span> · {result.status} · {result.comment}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Revision({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md bg-paper p-3 text-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-black/65">{text}</p>
    </div>
  );
}
