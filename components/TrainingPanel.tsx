"use client";

import { Check, Lightbulb, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudyWord } from "@/lib/types";
import { updateAfterAnswer } from "@/lib/study";

type Round = "recognition" | "recall" | "spelling" | "done";

export function TrainingPanel({
  words,
  onUpdate
}: {
  words: StudyWord[];
  onUpdate: (word: StudyWord) => void;
}) {
  const trainable = useMemo(() => words.filter((item) => item.card), [words]);
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState<Round>("recognition");
  const [answer, setAnswer] = useState("");
  const [usedHint, setUsedHint] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [weakIds, setWeakIds] = useState<string[]>([]);
  const current = trainable[index];

  const options = useMemo(() => {
    if (!current?.card) return [];
    const correct = current.card.meanings[0]?.meaningCn ?? current.userMeaning ?? current.word;
    const distractors = trainable
      .filter((item) => item.id !== current.id)
      .map((item) => item.card?.meanings[0]?.meaningCn ?? item.userMeaning)
      .filter(Boolean)
      .slice(0, 3) as string[];
    return shuffle([correct, ...distractors, "保持稳定并逐步提升", "处理问题的方法"].slice(0, 4));
  }, [current, trainable]);

  if (trainable.length === 0) {
    return (
      <div className="surface rounded-lg p-5 text-sm text-black/60">
        先在词库里生成至少一张词卡，再开始三轮训练。
      </div>
    );
  }

  if (round === "done") {
    const mastered = trainable.filter((item) => item.masteryScore >= 80).length;
    const basic = trainable.filter((item) => item.masteryScore >= 50 && item.masteryScore < 80).length;
    return (
      <div className="surface rounded-lg p-5">
        <h2 className="text-xl font-semibold">今日训练总结</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric label="今日词数" value={trainable.length} />
          <Metric label="已掌握" value={mastered} />
          <Metric label="基本掌握" value={basic} />
          <Metric label="不熟池" value={weakIds.length} />
        </div>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setRound("recognition");
            setWeakIds([]);
            setFeedback(null);
          }}
          className="focus-ring mt-5 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
        >
          <RotateCcw className="h-4 w-4" />
          再练一轮
        </button>
      </div>
    );
  }

  const meaning = current.card?.meanings[0]?.meaningCn ?? current.userMeaning ?? "";
  const prompt =
    round === "recognition"
      ? "英文识别中文"
      : round === "recall"
        ? "中文回忆英文"
        : "拼写训练";

  function submitRecognition(option: string) {
    const correct = option === meaning;
    finish(correct, correct ? "答对了，英文识别已记录。" : `这题应选：${meaning}`, "meaning_error", option);
  }

  function submitTyped() {
    const normalized = answer.trim().toLowerCase();
    const target = current.word.toLowerCase();
    const correct = normalized === target;
    const close = !correct && levenshtein(normalized, target) <= 2;
    finish(
      correct,
      correct
        ? "答对了。"
        : close
          ? `很接近，正确拼写是 ${current.word}。`
          : `正确答案是 ${current.word}。`,
      round === "spelling" ? "spelling_error" : "recall_error",
      answer
    );
  }

  function finish(ok: boolean, text: string, errorType: "meaning_error" | "recall_error" | "spelling_error", originalAnswer?: string) {
    const updated = updateAfterAnswer(current, round === "done" ? "recognition" : round, ok, usedHint, errorType, originalAnswer);
    onUpdate(updated);
    if (!ok || usedHint) setWeakIds((ids) => Array.from(new Set([...ids, current.id])));
    setFeedback({ ok, text });
  }

  function next() {
    setAnswer("");
    setUsedHint(false);
    setFeedback(null);
    if (index < trainable.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (round === "recognition") {
      setIndex(0);
      setRound("recall");
      return;
    }
    if (round === "recall") {
      setIndex(0);
      setRound("spelling");
      return;
    }
    if (weakIds.length > 0) {
      setIndex(0);
      setRound("recognition");
      setWeakIds([]);
      return;
    }
    setRound("done");
  }

  return (
    <div className="surface rounded-lg p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/45">{prompt}</p>
          <h2 className="mt-1 text-2xl font-semibold">{current.word}</h2>
        </div>
        <div className="rounded-md border border-black/10 px-3 py-2 text-sm">
          {index + 1}/{trainable.length}
        </div>
      </div>

      {round === "recognition" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={Boolean(feedback)}
              onClick={() => submitRecognition(option)}
              className="focus-ring min-h-14 rounded-md border border-black/10 bg-white px-4 py-3 text-left text-sm hover:border-mint disabled:opacity-70"
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <p className="mb-3 rounded-md bg-paper px-3 py-3 text-sm">
            {round === "recall" ? `中文意思：${meaning}` : `根据意思拼写英文：${meaning}`}
          </p>
          <div className="flex gap-2">
            <input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={Boolean(feedback)}
              className="focus-ring min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2"
              placeholder="输入英文"
            />
            <button
              type="button"
              onClick={submitTyped}
              disabled={Boolean(feedback)}
              className="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
            >
              提交
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setUsedHint(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm"
            >
              <Lightbulb className="h-4 w-4" />
              首字母 {current.word[0]} · {current.word.length} 个字母
            </button>
            {usedHint ? <span className="py-2 text-xs text-coral">已使用提示，本题加分会降低。</span> : null}
          </div>
        </div>
      )}

      {feedback ? (
        <div className={`mt-4 rounded-md px-3 py-3 text-sm ${feedback.ok ? "bg-mint/10 text-mint" : "bg-coral/10 text-coral"}`}>
          <div className="flex items-start gap-2">
            {feedback.ok ? <Check className="mt-0.5 h-4 w-4" /> : <X className="mt-0.5 h-4 w-4" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={next} className="focus-ring mt-3 rounded-md bg-ink px-4 py-2 text-sm text-white">
            下一题
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs text-black/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}
