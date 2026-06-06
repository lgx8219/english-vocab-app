"use client";

import { useEffect, useMemo, useState } from "react";
import type { AISettings, StudyWord, TokenStats, WordCard } from "@/lib/types";
import { createStudyWord, parseWordInput } from "@/lib/study";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteWordsFromSupabase,
  loadStudyWordsFromSupabase,
  upsertWordCardToSupabase,
  upsertWordsToSupabase
} from "@/lib/supabase/study-sync";

const WORDS_KEY = "vocab-ai-study.words";
const SETTINGS_KEY = "vocab-ai-study.settings";
const STATS_KEY = "vocab-ai-study.stats";
const THEME_KEY = "vocab-ai-study.theme";

export type ThemeMode = "system" | "light" | "dark";

const defaultSettings: AISettings = {
  provider: "openai",
  model: "按后端环境变量",
  apiKeyMasked: "",
  tokenMode: "normal",
  status: "unknown"
};

const defaultStats: TokenStats = {
  cardGenerations: 0,
  exampleGenerations: 0,
  imageExtractions: 0,
  outputGrades: 0,
  chats: 0,
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0
};

type StudyBackup = {
  app: "vocab-ai-study";
  exportVersion: 2;
  version?: number;
  exportedAt: string;
  words: StudyWord[];
  wordCards: WordCard[];
  exampleCache: NonNullable<WordCard["examples"]>;
  studyProgress: Array<{
    word: string;
    normalizedWord: string;
    masteryScore: number;
    recognitionScore: number;
    recallScore: number;
    spellingScore: number;
    usageScore: number;
    level: number;
    updatedAt: string;
  }>;
  mastery: Array<{ word: string; normalizedWord: string; masteryScore: number; updatedAt: string }>;
  errorRecords: StudyWord["errorHistory"];
  reviewSchedule: Array<{ word: string; normalizedWord: string; nextReviewAt?: string | null; updatedAt: string }>;
  aiGradingRecords: unknown[];
  settings: AISettings;
  userSettings: AISettings;
  stats: TokenStats;
  studyPlans: unknown[];
  calendarTasks: unknown[];
};

export type ImportMode = "merge" | "overwrite";

export function useLocalStudyStore() {
  const [words, setWords] = useState<StudyWord[]>([]);
  const [settings, setSettings] = useState<AISettings>(defaultSettings);
  const [stats, setStats] = useState<TokenStats>(defaultStats);
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [hydrated, setHydrated] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "synced" | "local" | "error">("idle");

  useEffect(() => {
    setWords(readJson(WORDS_KEY, []));
    setSettings(readJson(SETTINGS_KEY, defaultSettings));
    setStats(readJson(STATS_KEY, defaultStats));
    setThemeState(readJson(THEME_KEY, "system"));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refreshFromSupabase();
  }, [hydrated]);

  useEffect(() => {
    if (hydrated) writeJson(WORDS_KEY, words);
  }, [words, hydrated]);

  useEffect(() => {
    if (hydrated) writeJson(SETTINGS_KEY, settings);
  }, [settings, hydrated]);

  useEffect(() => {
    if (hydrated) writeJson(STATS_KEY, stats);
  }, [stats, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeJson(THEME_KEY, theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    applyTheme();
    const legacyMedia = media as MediaQueryList & {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", applyTheme);
    } else {
      legacyMedia.addListener?.(applyTheme);
    }
    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", applyTheme);
      } else {
        legacyMedia.removeListener?.(applyTheme);
      }
    };
  }, [theme, hydrated]);

  const todayWords = useMemo(() => {
    return [...words]
      .sort((a, b) => {
        const aRank = a.errorHistory.length > 0 ? 0 : a.masteryScore < 60 ? 1 : 2;
        const bRank = b.errorHistory.length > 0 ? 0 : b.masteryScore < 60 ? 1 : 2;
        return aRank - bRank || a.masteryScore - b.masteryScore;
      })
      .slice(0, 30);
  }, [words]);

  async function refreshFromSupabase() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSyncStatus("local");
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setSyncStatus("local");
      return;
    }
    setRemoteUserId(data.user.id);
    setSyncStatus("loading");
    try {
      const remoteWords = await loadStudyWordsFromSupabase(supabase, data.user.id);
      setWords(remoteWords);
      writeJson(WORDS_KEY, remoteWords);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  async function upload(input: string) {
    const parsed = parseWordInput(input);
    let added = 0;
    let reused = 0;
    const byNormalized = new Map(words.map((item) => [item.normalizedWord, item]));
    for (const item of parsed) {
      const existing = byNormalized.get(item.normalizedWord);
      if (existing) {
        reused += 1;
        byNormalized.set(item.normalizedWord, {
          ...existing,
          userMeaning: item.userMeaning || existing.userMeaning,
          nextReviewAt: existing.masteryScore >= 85 ? existing.nextReviewAt : new Date().toISOString()
        });
      } else {
        added += 1;
        byNormalized.set(item.normalizedWord, createStudyWord(item.word, item.userMeaning));
      }
    }
    const nextWords = Array.from(byNormalized.values());
    setWords(nextWords);
    await persistWords(nextWords);
    await refreshFromSupabase();
    return { total: parsed.length, added, reused };
  }

  function attachCard(wordId: string, card: WordCard) {
    const existing = words.find((item) => item.id === wordId);
    const target = existing ? { ...existing, card, updatedAt: new Date().toISOString() } : undefined;
    setWords((current) => current.map((item) => (item.id === wordId && target ? target : item)));
    if (target) void persistCard(target, card);
  }

  function updateWord(next: StudyWord) {
    setWords((current) => current.map((item) => (item.id === next.id ? next : item)));
    void persistWords([next]);
  }

  function deleteWord(wordId: string) {
    setWords((current) => current.filter((item) => item.id !== wordId));
    void deleteRemoteWords([wordId]);
  }

  function deleteWords(wordIds: string[]) {
    const ids = new Set(wordIds);
    setWords((current) => current.filter((item) => !ids.has(item.id)));
    void deleteRemoteWords(wordIds);
  }

  function bumpStats(kind: "card" | "example" | "image" | "grade" | "chat", inputTokens = 0, outputTokens = 0) {
    setStats((current) => ({
      ...current,
      cardGenerations: current.cardGenerations + (kind === "card" ? 1 : 0),
      exampleGenerations: current.exampleGenerations + (kind === "example" ? 1 : 0),
      imageExtractions: (current.imageExtractions ?? 0) + (kind === "image" ? 1 : 0),
      outputGrades: current.outputGrades + (kind === "grade" ? 1 : 0),
      chats: current.chats + (kind === "chat" ? 1 : 0),
      estimatedInputTokens: current.estimatedInputTokens + inputTokens,
      estimatedOutputTokens: current.estimatedOutputTokens + outputTokens
    }));
  }

  function exportData(): StudyBackup {
    const wordCards = words.map((word) => word.card).filter(Boolean) as WordCard[];

    return {
      app: "vocab-ai-study",
      exportVersion: 2,
      version: 2,
      exportedAt: new Date().toISOString(),
      words,
      wordCards,
      exampleCache: wordCards.flatMap((card) => card.examples ?? []),
      studyProgress: words.map((word) => ({
        word: word.word,
        normalizedWord: word.normalizedWord,
        masteryScore: word.masteryScore,
        recognitionScore: word.recognitionScore,
        recallScore: word.recallScore,
        spellingScore: word.spellingScore,
        usageScore: word.usageScore,
        level: word.level,
        updatedAt: word.updatedAt
      })),
      mastery: words.map((word) => ({
        word: word.word,
        normalizedWord: word.normalizedWord,
        masteryScore: word.masteryScore,
        updatedAt: word.updatedAt
      })),
      errorRecords: words.flatMap((word) => word.errorHistory),
      reviewSchedule: words.map((word) => ({
        word: word.word,
        normalizedWord: word.normalizedWord,
        nextReviewAt: word.nextReviewAt,
        updatedAt: word.updatedAt
      })),
      aiGradingRecords: [],
      settings: {
        ...settings,
        apiKeyMasked: settings.apiKeyMasked ? "********" : ""
      },
      userSettings: {
        ...settings,
        apiKeyMasked: settings.apiKeyMasked ? "********" : ""
      },
      stats
      ,
      studyPlans: [],
      calendarTasks: []
    };
  }

  function importData(raw: unknown, mode: ImportMode = "merge") {
    const backup = parseBackup(raw);
    let added = 0;
    let updated = 0;

    if (mode === "overwrite") {
      setWords(backup.words);
      setSettings({
        ...backup.settings,
        apiKeyMasked: "",
        status: "unknown"
      });
      setStats(backup.stats);
      void persistWords(backup.words);
      void Promise.all(backup.words.map((word) => word.card ? persistCard(word, word.card) : Promise.resolve()));
      return { added: backup.words.length, updated: 0, total: backup.words.length, mode };
    }

    let nextWords: StudyWord[] = [];
    setWords((current) => {
      const byNormalized = new Map(current.map((item) => [item.normalizedWord, item]));

      for (const incoming of backup.words) {
        const existing = byNormalized.get(incoming.normalizedWord);
        if (!existing) {
          added += 1;
          byNormalized.set(incoming.normalizedWord, incoming);
          continue;
        }

        updated += 1;
        byNormalized.set(incoming.normalizedWord, mergeStudyWord(existing, incoming));
      }

      nextWords = Array.from(byNormalized.values());
      return nextWords;
    });
    void persistWords(nextWords);
    void Promise.all(nextWords.map((word) => word.card ? persistCard(word, word.card) : Promise.resolve()));

    setSettings((current) => ({
      ...current,
      provider: backup.settings.provider ?? current.provider,
      model: backup.settings.model ?? current.model,
      tokenMode: backup.settings.tokenMode ?? current.tokenMode,
      status: "unknown"
    }));

    setStats((current) => ({
      cardGenerations: Math.max(current.cardGenerations ?? 0, backup.stats.cardGenerations ?? 0),
      exampleGenerations: Math.max(current.exampleGenerations ?? 0, backup.stats.exampleGenerations ?? 0),
      imageExtractions: Math.max(current.imageExtractions ?? 0, backup.stats.imageExtractions ?? 0),
      outputGrades: Math.max(current.outputGrades ?? 0, backup.stats.outputGrades ?? 0),
      chats: Math.max(current.chats ?? 0, backup.stats.chats ?? 0),
      estimatedInputTokens: Math.max(current.estimatedInputTokens ?? 0, backup.stats.estimatedInputTokens ?? 0),
      estimatedOutputTokens: Math.max(current.estimatedOutputTokens ?? 0, backup.stats.estimatedOutputTokens ?? 0)
    }));

    return { added, updated, total: backup.words.length, mode };
  }

  return {
    hydrated,
    syncStatus,
    words,
    todayWords,
    settings,
    stats,
    theme,
    setSettings,
    setWords,
    setTheme: setThemeState,
    upload,
    attachCard,
    updateWord,
    deleteWord,
    deleteWords,
    bumpStats,
    exportData,
    importData
  };

  async function persistWords(nextWords: StudyWord[]) {
    const supabase = getSupabaseBrowserClient();
    const userId = remoteUserId;
    if (!supabase || !userId || nextWords.length === 0) return;
    try {
      await upsertWordsToSupabase(supabase, userId, nextWords);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  async function persistCard(word: StudyWord, card: WordCard) {
    const supabase = getSupabaseBrowserClient();
    const userId = remoteUserId;
    if (!supabase || !userId) return;
    try {
      await upsertWordCardToSupabase(supabase, userId, word, card);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }

  async function deleteRemoteWords(wordIds: string[]) {
    const supabase = getSupabaseBrowserClient();
    const userId = remoteUserId;
    if (!supabase || !userId || wordIds.length === 0) return;
    try {
      await deleteWordsFromSupabase(supabase, userId, wordIds);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Some browsers can block localStorage; the app should still render.
  }
}

function parseBackup(raw: unknown): StudyBackup {
  if (!raw || typeof raw !== "object") {
    throw new Error("备份文件格式不正确。");
  }

  const data = raw as Partial<StudyBackup>;
  if (data.app !== "vocab-ai-study" || !Array.isArray(data.words)) {
    throw new Error("这不是 Vocab AI Study 的备份文件。");
  }

  const exportVersion = data.exportVersion ?? data.version ?? 1;
  if (exportVersion !== 1 && exportVersion !== 2) {
    throw new Error("备份版本不支持。");
  }

  const words = data.words.filter(isStudyWord);
  const wordCards = words.map((word) => word.card).filter(Boolean) as WordCard[];

  return {
    app: "vocab-ai-study",
    exportVersion: 2,
    version: 2,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    words,
    wordCards: Array.isArray(data.wordCards) ? data.wordCards.filter(isWordCard) : wordCards,
    exampleCache: Array.isArray(data.exampleCache) ? data.exampleCache : wordCards.flatMap((card) => card.examples ?? []),
    studyProgress: Array.isArray(data.studyProgress) ? data.studyProgress : [],
    mastery: Array.isArray(data.mastery) ? data.mastery : [],
    errorRecords: Array.isArray(data.errorRecords) ? data.errorRecords : words.flatMap((word) => word.errorHistory),
    reviewSchedule: Array.isArray(data.reviewSchedule) ? data.reviewSchedule : [],
    aiGradingRecords: Array.isArray(data.aiGradingRecords) ? data.aiGradingRecords : [],
    settings: {
      ...defaultSettings,
      ...(data.userSettings ?? data.settings ?? {}),
      apiKeyMasked: ""
    },
    userSettings: {
      ...defaultSettings,
      ...(data.userSettings ?? data.settings ?? {}),
      apiKeyMasked: ""
    },
    stats: {
      ...defaultStats,
      ...(data.stats ?? {})
    },
    studyPlans: Array.isArray(data.studyPlans) ? data.studyPlans : [],
    calendarTasks: Array.isArray(data.calendarTasks) ? data.calendarTasks : []
  };
}

function isStudyWord(value: unknown): value is StudyWord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StudyWord>;
  return typeof item.id === "string" && typeof item.word === "string" && typeof item.normalizedWord === "string";
}

function isWordCard(value: unknown): value is WordCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<WordCard>;
  return typeof card.id === "string" && typeof card.word === "string";
}

function mergeStudyWord(existing: StudyWord, incoming: StudyWord): StudyWord {
  const incomingIsNewer = new Date(incoming.updatedAt).getTime() > new Date(existing.updatedAt).getTime();
  const base = incomingIsNewer ? incoming : existing;
  const other = incomingIsNewer ? existing : incoming;

  const mergedCard = mergeWordCards(existing.card, incoming.card, base.card ?? other.card);
  const latestReview = latestDate(existing.nextReviewAt, incoming.nextReviewAt);

  return {
    ...base,
    masteryScore: base.masteryScore,
    recognitionScore: base.recognitionScore,
    recallScore: base.recallScore,
    spellingScore: base.spellingScore,
    usageScore: base.usageScore,
    level: Math.max(existing.level, incoming.level),
    correctCount: Math.max(existing.correctCount, incoming.correctCount),
    wrongCount: Math.max(existing.wrongCount, incoming.wrongCount),
    card: mergedCard,
    errorHistory: mergeErrors(existing.errorHistory, incoming.errorHistory),
    nextReviewAt: latestReview,
    updatedAt: new Date(Math.max(new Date(existing.updatedAt).getTime(), new Date(incoming.updatedAt).getTime())).toISOString()
  };
}

function mergeWordCards(existing?: WordCard, incoming?: WordCard, fallback?: WordCard) {
  if (!existing && !incoming) return fallback;
  if (!existing) return incoming;
  if (!incoming) return existing;

  const incomingIsNewer = new Date(incoming.updatedAt).getTime() > new Date(existing.updatedAt).getTime();
  const base = incomingIsNewer ? incoming : existing;

  return {
    ...base,
    examples: mergeExamples(existing.examples ?? [], incoming.examples ?? []),
    updatedAt: new Date(Math.max(new Date(existing.updatedAt).getTime(), new Date(incoming.updatedAt).getTime())).toISOString()
  };
}

function mergeExamples(existing: WordCard["examples"], incoming: WordCard["examples"]) {
  const seen = new Set<string>();
  return [...existing, ...incoming].filter((example) => {
    const key = `${example.sentence}-${example.translationCn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeErrors(existing: StudyWord["errorHistory"], incoming: StudyWord["errorHistory"]) {
  const seen = new Set<string>();
  return [...existing, ...incoming]
    .filter((error) => {
      const key = `${error.type}-${error.at}-${error.originalAnswer ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 50);
}

function latestDate(a?: string | null, b?: string | null) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
