import { z } from "zod";

export const wordCardSchema = z.object({
  word: z.string(),
  phonetic: z.string().nullable(),
  partOfSpeech: z.string(),
  meanings: z.array(
    z.object({
      partOfSpeech: z.string(),
      meaningCn: z.string(),
      meaningEn: z.string().optional(),
      usage: z.string().optional()
    })
  ),
  derivedWords: z.array(
    z.object({
      word: z.string(),
      pos: z.string().optional(),
      meaningCn: z.string()
    })
  ),
  collocations: z.array(z.string()),
  confusableWords: z.array(
    z.object({
      word: z.string(),
      noteCn: z.string()
    })
  ),
  rootAffixAnalysis: z
    .object({
      word: z.string(),
      suitable_for_root_affix: z.boolean(),
      confidence: z.enum(["high", "medium", "low", "uncertain", "false"]),
      analysis_type: z.enum(["root_affix", "memory_aid", "not_recommended"]),
      parts: z.array(
        z.object({
          text: z.string(),
          type: z.enum(["prefix", "root", "suffix"]),
          meaning_cn: z.string(),
          meaning_en: z.string()
        })
      ),
      memory_logic: z.string().nullable(),
      sources: z.array(z.object({ title: z.string(), url: z.string() })),
      warning: z.string().nullable()
    })
    .nullable(),
  notes: z.string().optional(),
  examples: z.array(
    z.object({
      sentence: z.string(),
      translationCn: z.string(),
      style: z.enum(["daily", "IELTS", "postgraduate_exam", "academic", "spoken"]),
      difficulty: z.enum(["easy", "medium", "hard"])
    })
  )
});

export const outputPromptSchema = z.object({
  promptCn: z.string(),
  chinese: z.string().optional(),
  targetWords: z.array(z.string()),
  difficulty: z.enum(["daily", "postgraduate", "ielts"]),
  mode: z.literal("strict"),
  expectedUsage: z.array(
    z.object({
      word: z.string(),
      meaningHintCn: z.string()
    })
  )
});

export const readingPromptSchema = z.object({
  title: z.string(),
  passage: z.string(),
  targetWords: z.array(z.string()),
  difficulty: z.enum(["easy", "medium", "hard"])
});

export const translationGradeSchema = z.object({
  score: z.number(),
  is_passed: z.boolean(),
  overall_feedback: z.string(),
  target_word_results: z.array(
    z.object({
      word: z.string(),
      meaning_in_context: z.string(),
      user_translation_status: z.enum(["correct", "missing", "incorrect", "partial"]),
      comment: z.string()
    })
  ),
  missing_meanings: z.array(z.string()),
  serious_errors: z.array(z.string()),
  improved_translation: z.string(),
  review_suggestions: z.array(z.string())
});

export const outputGradeSchema = z.object({
  score: z.number(),
  overall_feedback: z.string(),
  target_word_results: z.array(
    z.object({
      word: z.string(),
      status: z.enum([
        "correct",
        "acceptable",
        "wrong_meaning",
        "wrong_collocation",
        "wrong_form",
        "missing",
        "forced"
      ]),
      comment: z.string()
    })
  ),
  grammar_issues: z.array(
    z.object({
      type: z.string(),
      original: z.string(),
      suggestion: z.string(),
      explanation: z.string()
    })
  ),
  collocation_issues: z.array(
    z.object({
      original: z.string(),
      suggestion: z.string(),
      explanation: z.string()
    })
  ),
  minimal_revision: z.string(),
  natural_revision: z.string(),
  exam_style_revision: z.string(),
  next_practice_focus: z.array(z.string())
});
