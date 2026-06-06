"use client";

import { BookOpen, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReadingPrompt, StudyWord, TranslationGrade } from "@/lib/types";

type PracticeMode = "all" | "today" | "weak" | "unpracticed";
type PracticeDifficulty = "daily" | "kaoyan" | "ielts";
type ReadingHistory = {
  id: string;
  created_at: string;
  word_ids: string[];
  words: string[];
  passage: string;
  question_hash: string;
};

const HISTORY_KEY = "vocab-ai-study.reading_translation_history";
const RECENT_WORD_ROUNDS = 5;
const RECENT_HASH_LIMIT = 50;

export function ReadingTranslationTrainer({
  words,
  todayWords = [],
  onStats
}: {
  words: StudyWord[];
  todayWords?: StudyWord[];
  onStats: (inputTokens?: number, outputTokens?: number) => void;
}) {
  const targetWords = useMemo(() => words.filter((item) => item.card), [words]);
  const todayIds = useMemo(() => new Set(todayWords.map((item) => item.id)), [todayWords]);
  const [prompt, setPrompt] = useState<ReadingPrompt | null>(null);
  const [translation, setTranslation] = useState("");
  const [grade, setGrade] = useState<TranslationGrade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [length, setLength] = useState<"sentence" | "paragraph">("paragraph");
  const [mode, setMode] = useState<PracticeMode>("unpracticed");
  const [wordCount, setWordCount] = useState(3);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>("daily");
  const [history, setHistory] = useState<ReadingHistory[]>([]);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  async function generateReading() {
    setLoading(true);
    setError("");
    setNotice("");
    setGrade(null);
    setTranslation("");
    try {
      const selected = selectWords({
        words: targetWords,
        todayIds,
        count: wordCount,
        mode,
        history
      });
      if (selected.warning) setNotice(selected.warning);
      const selectedWords = selected.words.map((item) => item.word);
      const recentPrompts = history.slice(0, 10).map((item) => item.passage);
      const recentHashes = new Set(history.slice(0, RECENT_HASH_LIMIT).map((item) => item.question_hash));
      let finalPrompt: ReadingPrompt | null = null;
      let finalJson: { meta?: { inputTokens?: number; outputTokens?: number } } = {};
      let finalHash = "";

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch("/api/ai/generate-reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: selectedWords,
            length,
            targetCount: selectedWords.length,
            difficulty,
            recentPrompts,
            attempt
          })
        });
        const json = await response.json();
        if (!response.ok) {
          setError(json.error ?? "阅读题目生成失败，请重试。");
          return;
        }
        const nextPrompt = json.data as ReadingPrompt;
        const nextHash = makeHash("en_to_cn", nextPrompt.targetWords, nextPrompt.passage);
        finalPrompt = nextPrompt;
        finalJson = json;
        finalHash = nextHash;
        if (!recentHashes.has(nextHash)) break;
      }
      if (!finalPrompt) {
        setError("阅读题目生成失败，请重试。");
        return;
      }
      const usedWords = targetWords.filter((item) =>
        finalPrompt?.targetWords.some((word) => normalizeWord(word) === normalizeWord(item.word))
      );
      const item: ReadingHistory = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        word_ids: usedWords.map((word) => word.id),
        words: finalPrompt.targetWords,
        passage: finalPrompt.passage,
        question_hash: finalHash
      };
      const nextHistory = [item, ...history].slice(0, 100);
      setHistory(nextHistory);
      writeHistory(nextHistory);
      setPrompt(finalPrompt);
      onStats(finalJson.meta?.inputTokens, finalJson.meta?.outputTokens);
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

  function clearCurrentQuestion() {
    setPrompt(null);
    setTranslation("");
    setGrade(null);
    setError("");
    setNotice("");
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
            value={mode}
            onChange={(event) => setMode(event.target.value as PracticeMode)}
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
            onChange={(event) => setDifficulty(event.target.value as PracticeDifficulty)}
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
            onClick={generateReading}
            disabled={loading || targetWords.length === 0}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "处理中" : prompt ? "换一题" : "生成题目"}
          </button>
        </div>
      </div>

      {targetWords.length === 0 ? <p className="mt-4 text-sm text-black/60">先生成词卡，再做英译中训练。</p> : null}
      {notice ? <p className="mt-4 rounded-md bg-paper px-3 py-2 text-sm text-black/60">{notice}</p> : null}
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
            提交
          </button>
          <button
            type="button"
            onClick={clearCurrentQuestion}
            disabled={loading}
            className="focus-ring ml-2 mt-3 rounded-md border border-black/10 px-4 py-2 text-sm"
          >
            清除本题
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
          <button
            type="button"
            onClick={clearCurrentQuestion}
            className="focus-ring rounded-md border border-black/10 px-4 py-2 text-sm text-coral"
          >
            清除本题
          </button>
        </div>
      ) : null}
    </section>
  );
}

function selectWords({
  words,
  todayIds,
  count,
  mode,
  history
}: {
  words: StudyWord[];
  todayIds: Set<string>;
  count: number;
  mode: PracticeMode;
  history: ReadingHistory[];
}) {
  const unique = uniqueWords(words);
  const usableCount = Math.min(count, unique.length);
  const recentWords = new Set(history.slice(0, RECENT_WORD_ROUNDS).flatMap((item) => item.words).map(normalizeWord));
  const available = unique.filter((word) => !recentWords.has(normalizeWord(word.word)));
  const pool = available.length >= usableCount ? available : unique;
  const warning = unique.length < count ? "当前词库可用词较少，可能会重复部分单词。" : "";
  const ranked = weightedShuffle(pool.map((word) => ({ word, weight: wordWeight(word, mode, todayIds) })));
  return { words: ranked.slice(0, usableCount).map((item) => item.word), warning };
}

function wordWeight(word: StudyWord, mode: PracticeMode, todayIds: Set<string>) {
  let weight = 1 + Math.random() * 0.4;
  weight += Math.max(0, 100 - word.masteryScore) / 70;
  weight += Math.min(5, word.wrongCount) * 0.3;
  if (mode === "today" && todayIds.has(word.id)) weight += 3;
  if (mode === "weak") weight += Math.max(0, 80 - word.masteryScore) / 20 + Math.min(8, word.wrongCount) * 0.7;
  if (mode === "unpracticed" && !(word.outputPracticeCount ?? 0)) weight += 2;
  return Math.max(0.1, weight);
}

function weightedShuffle<T>(items: Array<{ word: T; weight: number }>) {
  return [...items].sort((a, b) => Math.random() * b.weight - Math.random() * a.weight);
}

function uniqueWords(words: StudyWord[]) {
  const byWord = new Map<string, StudyWord>();
  for (const word of words) {
    const key = normalizeWord(word.word);
    if (key && !byWord.has(key)) byWord.set(key, word);
  }
  return Array.from(byWord.values());
}

function readHistory(): ReadingHistory[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ReadingHistory[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(history: ReadingHistory[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 只是去重缓存，失败不影响练习。
  }
}

function makeHash(taskType: string, words: string[], passage: string) {
  const normalized = `${taskType}|${words.map(normalizeWord).sort().join(",")}|${passage.replace(/\s+/g, "").toLowerCase()}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}
