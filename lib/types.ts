export type AIProvider = "openai" | "deepseek";
export type TokenMode = "saving" | "normal" | "quality";
export type ErrorType =
  | "meaning_error"
  | "recall_error"
  | "spelling_error"
  | "confusion_error"
  | "usage_error"
  | "grammar_related_usage_error"
  | "collocation_error";

export type ExampleStyle = "daily" | "IELTS" | "postgraduate_exam" | "academic" | "spoken";

export type WordMeaning = {
  partOfSpeech: string;
  meaningCn: string;
  meaningEn?: string;
  usage?: string;
};

export type RootAffixAnalysis = {
  word: string;
  suitable_for_root_affix: boolean;
  confidence: "high" | "medium" | "low" | "uncertain" | "false";
  analysis_type: "root_affix" | "memory_aid" | "not_recommended";
  parts: Array<{
    text: string;
    type: "prefix" | "root" | "suffix";
    meaning_cn: string;
    meaning_en: string;
  }>;
  memory_logic: string | null;
  sources: Array<{ title: string; url: string }>;
  warning: string | null;
};

export type WordExample = {
  id: string;
  wordId: string;
  sentence: string;
  translationCn: string;
  style: ExampleStyle;
  difficulty: "easy" | "medium" | "hard";
  source: "ai" | "manual" | "mock";
  createdAt: string;
};

export type WordCard = {
  id: string;
  wordId: string;
  word: string;
  phonetic?: string | null;
  partOfSpeech: string;
  meanings: WordMeaning[];
  derivedWords: Array<{ word: string; pos?: string; meaningCn: string }>;
  collocations: string[];
  confusableWords: Array<{ word: string; noteCn: string }>;
  rootAffixAnalysis?: RootAffixAnalysis | null;
  notes?: string;
  examples: WordExample[];
  createdAt: string;
  updatedAt: string;
};

export type StudyWord = {
  id: string;
  word: string;
  normalizedWord: string;
  userMeaning?: string;
  card?: WordCard;
  masteryScore: number;
  recognitionScore: number;
  recallScore: number;
  spellingScore: number;
  usageScore: number;
  level: number;
  correctCount: number;
  wrongCount: number;
  outputPracticeCount?: number;
  lastOutputPracticedAt?: string | null;
  lastReviewedAt?: string | null;
  nextReviewAt?: string | null;
  errorHistory: Array<{
    type: ErrorType;
    at: string;
    originalAnswer?: string;
    correction?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type AISettings = {
  provider: AIProvider;
  model: string;
  apiKeyMasked?: string;
  tokenMode: TokenMode;
  status: "unknown" | "connected" | "failed";
};

export type TokenStats = {
  cardGenerations: number;
  exampleGenerations: number;
  imageExtractions: number;
  outputGrades: number;
  chats: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

export type OutputPrompt = {
  promptCn: string;
  chinese?: string;
  targetWords: string[];
  difficulty: "daily" | "postgraduate" | "ielts";
  mode: "strict";
  expectedUsage: Array<{
    word: string;
    meaningHintCn: string;
  }>;
};

export type ReadingPrompt = {
  title: string;
  passage: string;
  targetWords: string[];
  difficulty: "easy" | "medium" | "hard";
};

export type TranslationGrade = {
  score: number;
  is_passed: boolean;
  overall_feedback: string;
  target_word_results: Array<{
    word: string;
    meaning_in_context: string;
    user_translation_status: "correct" | "missing" | "incorrect" | "partial";
    comment: string;
  }>;
  missing_meanings: string[];
  serious_errors: string[];
  improved_translation: string;
  review_suggestions: string[];
};

export type OutputGrade = {
  score: number;
  overall_feedback: string;
  target_word_results: Array<{
    word: string;
    status:
      | "correct"
      | "acceptable"
      | "wrong_meaning"
      | "wrong_collocation"
      | "wrong_form"
      | "missing"
      | "forced";
    comment: string;
  }>;
  grammar_issues: Array<{
    type: string;
    original: string;
    suggestion: string;
    explanation: string;
  }>;
  collocation_issues: Array<{
    original: string;
    suggestion: string;
    explanation: string;
  }>;
  minimal_revision: string;
  natural_revision: string;
  exam_style_revision: string;
  next_practice_focus: string[];
};
