"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OutputGrade, OutputPrompt, StudyWord } from "@/lib/types";
import { updateAfterAnswer } from "@/lib/study";

type OutputPracticeMode = "all" | "today" | "weak" | "unpracticed";
type OutputDifficulty = "daily" | "kaoyan" | "ielts";
type OutputPracticeHistory = {
  id: string;
  created_at: string;
  word_ids: string[];
  words: string[];
  prompt_cn: string;
  user_answer?: string;
  ai_feedback?: OutputGrade;
  question_hash: string;
  completed_at?: string;
};

const HISTORY_KEY = "vocab-ai-study.output_practice_history";
const RECENT_WORD_ROUNDS = 5;
const RECENT_HASH_LIMIT = 50;

export function OutputTrainer({
  words,
  todayWords = [],
  onUpdate,
  onStats
}: {
  words: StudyWord[];
  todayWords?: StudyWord[];
  onUpdate: (word: StudyWord) => void;
  onStats: (inputTokens?: number, outputTokens?: number) => void;
}) {
  const targetWords = useMemo(() => words.filter((item) => item.card), [words]);
  const todayIds = useMemo(() => new Set(todayWords.map((item) => item.id)), [todayWords]);
  const [prompt, setPrompt] = useState<OutputPrompt | null>(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<OutputGrade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [length, setLength] = useState<"sentence" | "paragraph">("sentence");
  const [mode, setMode] = useState<OutputPracticeMode>("unpracticed");
  const [wordCount, setWordCount] = useState(3);
  const [difficulty, setDifficulty] = useState<OutputDifficulty>("daily");
  const [history, setHistory] = useState<OutputPracticeHistory[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(readOutputHistory());
  }, []);

  async function generatePrompt() {
    setLoading(true);
    setGrade(null);
    setError("");
    setNotice("");
    setAnswer("");
    try {
      const selected = selectWordsForOutputTraining({
        words: targetWords,
        todayIds,
        count: wordCount,
        mode,
        recentPracticeHistory: history
      });
      if (selected.warning) setNotice(selected.warning);
      const selectedWords = selected.words.map((item) => item.word);
      const recentPromptSummaries = history.slice(0, 10).map((item) => item.prompt_cn).filter(Boolean);
      const recentHashes = new Set(history.slice(0, RECENT_HASH_LIMIT).map((item) => item.question_hash));

      let finalPrompt: OutputPrompt | null = null;
      let finalJson: { meta?: { inputTokens?: number; outputTokens?: number } } = {};
      let finalHash = "";

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch("/api/ai/generate-output", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: selectedWords,
            length,
            targetCount: selectedWords.length,
            difficulty,
            recentPrompts: recentPromptSummaries,
            attempt
          })
        });
        const json = await response.json();
        if (!response.ok) {
          setError(json.error ?? "题目生成失败，请重试。");
          return;
        }
        const nextPrompt = json.data as OutputPrompt;
        const promptCn = getPromptCn(nextPrompt);
        const nextHash = makeQuestionHash("cn_to_en", nextPrompt.targetWords, promptCn);
        finalPrompt = nextPrompt;
        finalJson = json;
        finalHash = nextHash;
        if (!recentHashes.has(nextHash)) break;
      }

      if (!finalPrompt) {
        setError("题目生成失败，请重试。");
        return;
      }

      const now = new Date().toISOString();
      const usedWords = targetWords.filter((item) =>
        finalPrompt?.targetWords.some((word) => normalizeWord(word) === normalizeWord(item.word))
      );
      const historyItem: OutputPracticeHistory = {
        id: crypto.randomUUID(),
        created_at: now,
        word_ids: usedWords.map((item) => item.id),
        words: finalPrompt.targetWords,
        prompt_cn: getPromptCn(finalPrompt),
        question_hash: finalHash
      };
      const nextHistory = [historyItem, ...history].slice(0, 100);
      setHistory(nextHistory);
      writeOutputHistory(nextHistory);
      setCurrentHistoryId(historyItem.id);
      setPrompt(finalPrompt);
      onStats(finalJson.meta?.inputTokens, finalJson.meta?.outputTokens);
      for (const word of usedWords) {
        onUpdate({
          ...word,
          outputPracticeCount: (word.outputPracticeCount ?? 0) + 1,
          lastOutputPracticedAt: now,
          updatedAt: now
        });
      }
    } catch {
      setError("题目生成失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!prompt || !answer.trim()) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/grade-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chinese: getPromptCn(prompt),
          userEnglish: answer,
          targetWords: prompt.targetWords
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "批改失败，请重试。");
        return;
      }
      setGrade(json.data);
      if (currentHistoryId) {
        const nextHistory = history.map((item) =>
          item.id === currentHistoryId
            ? { ...item, user_answer: answer, ai_feedback: json.data, completed_at: new Date().toISOString() }
            : item
        );
        setHistory(nextHistory);
        writeOutputHistory(nextHistory);
      }
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
    } catch {
      setError("批改失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/45">AI Output</p>
          <h2 className="mt-1 text-xl font-semibold">中译英训练</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as OutputPracticeMode)}
            className="focus-ring rounded-md border border-black/15 bg-paper px-3 py-2 text-sm"
          >
            <option value="unpracticed">未练过优先</option>
            <option value="all">全词库随机</option>
            <option value="today">今日任务优先</option>
            <option value="weak">错词强化</option>
          </select>
          <select
            value={wordCount}
            onChange={(event) => setWordCount(Number(event.target.value))}
            className="focus-ring rounded-md border border-black/15 bg-paper px-3 py-2 text-sm"
          >
            <option value={1}>1 个词</option>
            <option value={3}>3 个词</option>
            <option value={5}>5 个词</option>
            <option value={10}>10 个词</option>
          </select>
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as OutputDifficulty)}
            className="focus-ring rounded-md border border-black/15 bg-paper px-3 py-2 text-sm"
          >
            <option value="daily">日常</option>
            <option value="kaoyan">考研</option>
            <option value="ielts">雅思</option>
          </select>
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
            onClick={generatePrompt}
            disabled={loading || targetWords.length === 0}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "处理中" : prompt ? "换一题" : "生成新题"}
          </button>
        </div>
      </div>

      {targetWords.length === 0 ? <p className="mt-4 text-sm text-black/60">先生成词卡，再做输出训练。</p> : null}
      {notice ? <p className="mt-4 rounded-md bg-paper px-3 py-2 text-sm text-black/60">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

      {prompt ? (
        <div className="mt-4">
          <div className="rounded-md bg-paper px-3 py-3 text-sm">
            <p>{getPromptCn(prompt)}</p>
            <p className="mt-2 text-xs text-black/50">建议使用：{prompt.targetWords.join(", ")}</p>
            {prompt.expectedUsage?.length ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-black/50">
                {prompt.expectedUsage.map((item) => (
                  <span key={`${item.word}-${item.meaningHintCn}`} className="rounded-md border border-black/10 px-2 py-1">
                    {item.word}：{item.meaningHintCn}
                  </span>
                ))}
              </div>
            ) : null}
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
          {grade.grammar_issues.length > 0 ? (
            <IssueList title="语法 / 句子问题" issues={grade.grammar_issues} />
          ) : null}
          {grade.collocation_issues.length > 0 ? (
            <IssueList title="搭配问题" issues={grade.collocation_issues} />
          ) : null}
          {grade.next_practice_focus.length > 0 ? (
            <div className="rounded-md border border-black/10 p-3 text-sm">
              <p className="font-semibold">下一次重点</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {grade.next_practice_focus.map((item) => (
                  <span key={item} className="rounded-md bg-paper px-2 py-1 text-black/65">{item}</span>
                ))}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setAnswer("");
              setGrade(null);
              setError("");
            }}
            className="focus-ring rounded-md border border-black/10 px-4 py-2 text-sm"
          >
            再写一次
          </button>
        </div>
      ) : null}
    </div>
  );
}

function selectWordsForOutputTraining({
  words,
  todayIds,
  count,
  mode,
  recentPracticeHistory
}: {
  words: StudyWord[];
  todayIds: Set<string>;
  count: number;
  mode: OutputPracticeMode;
  recentPracticeHistory: OutputPracticeHistory[];
}) {
  const unique = uniqueStudyWords(words);
  const usableCount = Math.min(count, unique.length);
  const recentWords = new Set(
    recentPracticeHistory
      .slice(0, RECENT_WORD_ROUNDS)
      .flatMap((item) => item.words)
      .map(normalizeWord)
  );
  const available = unique.filter((word) => !recentWords.has(normalizeWord(word.word)));
  const pool = available.length >= usableCount ? available : unique;
  const warning = unique.length < count ? "当前词库可用词较少，可能会重复部分单词。" : "";
  const ranked = weightedShuffle(pool.map((word) => ({ word, weight: outputWordWeight(word, mode, todayIds) })));
  const picked = ranked.slice(0, usableCount).map((item) => item.word);

  if (picked.length >= usableCount) return { words: picked, warning };

  const pickedIds = new Set(picked.map((item) => item.id));
  return {
    words: [...picked, ...weightedShuffle(unique.filter((word) => !pickedIds.has(word.id)).map((word) => ({ word, weight: outputWordWeight(word, mode, todayIds) }))).slice(0, usableCount - picked.length).map((item) => item.word)],
    warning
  };
}

function outputWordWeight(word: StudyWord, mode: OutputPracticeMode, todayIds: Set<string>) {
  let weight = 1 + Math.random() * 0.4;
  weight += Math.max(0, 100 - word.masteryScore) / 60;
  weight += Math.min(5, word.wrongCount) * 0.3;
  weight += 1 / ((word.outputPracticeCount ?? 0) + 1);
  if (!word.lastOutputPracticedAt) weight += 2.5;
  if (mode === "today" && todayIds.has(word.id)) weight += 3;
  if (mode === "weak") weight += Math.max(0, 80 - word.masteryScore) / 20 + Math.min(8, word.wrongCount) * 0.7;
  if (mode === "unpracticed" && !word.lastOutputPracticedAt) weight += 4;
  return Math.max(0.1, weight);
}

function weightedShuffle<T>(items: Array<{ word: T; weight: number }>) {
  return [...items].sort((a, b) => weightedRank(b.weight) - weightedRank(a.weight));
}

function weightedRank(weight: number) {
  return Math.random() * weight;
}

function uniqueStudyWords(words: StudyWord[]) {
  const byWord = new Map<string, StudyWord>();
  for (const word of words) {
    const key = normalizeWord(word.word);
    if (!key || byWord.has(key)) continue;
    byWord.set(key, word);
  }
  return Array.from(byWord.values());
}

function readOutputHistory(): OutputPracticeHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as OutputPracticeHistory[]) : [];
  } catch {
    return [];
  }
}

function writeOutputHistory(history: OutputPracticeHistory[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 本地历史只是用于避免重复，写入失败不影响答题。
  }
}

function makeQuestionHash(taskType: string, words: string[], promptCn: string) {
  const normalized = `${taskType}|${words.map(normalizeWord).sort().join(",")}|${promptCn.replace(/\s+/g, "").toLowerCase()}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function getPromptCn(prompt: OutputPrompt) {
  return prompt.promptCn || prompt.chinese || "";
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

function IssueList({
  title,
  issues
}: {
  title: string;
  issues: Array<{ original: string; suggestion: string; explanation: string; type?: string }>;
}) {
  return (
    <div className="rounded-md border border-black/10 p-3 text-sm">
      <p className="font-semibold">{title}</p>
      <div className="mt-2 space-y-2">
        {issues.map((issue, index) => (
          <div key={`${issue.original}-${index}`} className="rounded-md bg-paper px-3 py-2">
            {issue.original ? <p><span className="text-black/45">原句：</span>{issue.original}</p> : null}
            {issue.suggestion ? <p className="mt-1"><span className="text-black/45">建议：</span>{issue.suggestion}</p> : null}
            {issue.explanation ? <p className="mt-1 text-black/60">{issue.explanation}</p> : null}
          </div>
        ))}
      </div>
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
