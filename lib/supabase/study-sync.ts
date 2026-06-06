"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyWord, WordCard } from "@/lib/types";

type WordRow = {
  id: string;
  user_id: string;
  word: string;
  normalized_word: string;
  source?: string | null;
  status?: string | null;
  mastery_score?: number | null;
  recognition_score?: number | null;
  recall_score?: number | null;
  spelling_score?: number | null;
  usage_score?: number | null;
  level?: number | null;
  correct_count?: number | null;
  review_count?: number | null;
  wrong_count?: number | null;
  error_history_json?: StudyWord["errorHistory"] | null;
  output_practice_count?: number | null;
  last_output_practiced_at?: string | null;
  first_learned_at?: string | null;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  created_at: string;
  updated_at: string;
};

type CardRow = {
  id: string;
  user_id: string;
  word_id?: string | null;
  normalized_word: string;
  card_json?: WordCard | null;
  created_at: string;
  updated_at: string;
};

export async function loadStudyWordsFromSupabase(supabase: SupabaseClient, userId: string) {
  const { data: wordRows, error: wordsError } = await supabase
    .from("words")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (wordsError) throw wordsError;

  const { data: cardRows, error: cardsError } = await supabase
    .from("word_cards")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (cardsError) throw cardsError;

  return mergeWordAndCardRows((wordRows ?? []) as WordRow[], (cardRows ?? []) as CardRow[]);
}

export async function upsertWordsToSupabase(supabase: SupabaseClient, userId: string, words: StudyWord[]) {
  const rows = words.map((word) => ({
    user_id: userId,
    word: word.word,
    normalized_word: word.normalizedWord,
    source: word.userMeaning ?? null,
    status: "new",
    mastery_score: word.masteryScore,
    recognition_score: word.recognitionScore,
    recall_score: word.recallScore,
    spelling_score: word.spellingScore,
    usage_score: word.usageScore,
    level: word.level,
    correct_count: word.correctCount,
    review_count: word.correctCount + word.wrongCount,
    wrong_count: word.wrongCount,
    error_history_json: word.errorHistory,
    output_practice_count: word.outputPracticeCount ?? 0,
    last_output_practiced_at: word.lastOutputPracticedAt ?? null,
    first_learned_at: word.createdAt,
    last_reviewed_at: word.lastReviewedAt ?? null,
    next_review_at: word.nextReviewAt ?? null,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from("words")
    .upsert(rows, { onConflict: "user_id,normalized_word" });

  if (error) throw error;
}

export async function deleteWordsFromSupabase(supabase: SupabaseClient, userId: string, wordIds: string[]) {
  if (wordIds.length === 0) return;
  const { error } = await supabase.from("words").delete().eq("user_id", userId).in("id", wordIds);
  if (error) throw error;
}

export async function upsertWordCardToSupabase(supabase: SupabaseClient, userId: string, word: StudyWord, card: WordCard) {
  const { error } = await supabase.from("word_cards").upsert(
    {
      user_id: userId,
      word_id: word.id,
      normalized_word: word.normalizedWord,
      card_json: card,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,normalized_word" }
  );
  if (error) throw error;
}

function mergeWordAndCardRows(wordRows: WordRow[], cardRows: CardRow[]): StudyWord[] {
  const cardsByWordId = new Map<string, WordCard>();
  const cardsByNormalized = new Map<string, WordCard>();

  for (const row of cardRows) {
    if (!row.card_json) continue;
    const card = normalizeCard(row.card_json, row);
    if (row.word_id) cardsByWordId.set(row.word_id, card);
    cardsByNormalized.set(row.normalized_word, card);
  }

  return wordRows.map((row) => {
    const card = cardsByWordId.get(row.id) ?? cardsByNormalized.get(row.normalized_word);
    return {
      id: row.id,
      word: row.word,
      normalizedWord: row.normalized_word,
      userMeaning: row.source ?? undefined,
      card,
      masteryScore: row.mastery_score ?? 0,
      recognitionScore: row.recognition_score ?? 0,
      recallScore: row.recall_score ?? 0,
      spellingScore: row.spelling_score ?? 0,
      usageScore: row.usage_score ?? 0,
      level: row.level ?? 0,
      correctCount: row.correct_count ?? Math.max(0, (row.review_count ?? 0) - (row.wrong_count ?? 0)),
      wrongCount: row.wrong_count ?? 0,
      outputPracticeCount: row.output_practice_count ?? 0,
      lastOutputPracticedAt: row.last_output_practiced_at ?? null,
      lastReviewedAt: row.last_reviewed_at ?? null,
      nextReviewAt: row.next_review_at ?? null,
      errorHistory: Array.isArray(row.error_history_json) ? row.error_history_json : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

function normalizeCard(card: WordCard, row: CardRow): WordCard {
  return {
    ...card,
    id: card.id ?? row.id,
    wordId: card.wordId ?? row.word_id ?? "",
    createdAt: card.createdAt ?? row.created_at,
    updatedAt: card.updatedAt ?? row.updated_at
  };
}
