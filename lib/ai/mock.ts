import type { OutputGrade, OutputPrompt, WordCard } from "@/lib/types";

const commonMeanings: Record<string, string> = {
  maintain: "维持，保持",
  abandon: "放弃，抛弃",
  sufficient: "足够的，充分的",
  approach: "方法；接近；处理",
  benefit: "好处；使受益"
};

export function mockCard(word: string): Omit<WordCard, "id" | "wordId" | "createdAt" | "updatedAt"> {
  const normalized = word.trim().toLowerCase();
  const meaning = commonMeanings[normalized] ?? "核心含义待确认";
  const partOfSpeech = normalized.endsWith("tion") ? "noun" : "verb / noun / adjective";

  return {
    word,
    phonetic: null,
    partOfSpeech,
    meanings: [{ partOfSpeech, meaningCn: meaning }],
    derivedWords: [
      { word: `${normalized}able`, meaningCn: "相关形容词形式，可按实际词典确认" },
      { word: `${normalized}ing`, meaningCn: "相关动名词或现在分词形式" }
    ].filter((item) => item.word.length < 18),
    collocations: [
      `${normalized} a habit`,
      `${normalized} progress`,
      `${normalized} effectively`,
      `a practical ${normalized}`
    ],
    confusableWords: [],
    rootAffixAnalysis: {
      word,
      suitable_for_root_affix: false,
      confidence: "low",
      analysis_type: "not_recommended",
      parts: [],
      memory_logic: null,
      sources: [],
      warning: "未接入真实 AI 或权威来源时，不展示词根词缀，建议通过例句和搭配记忆。"
    },
    examples: [
      {
        id: "",
        wordId: "",
        sentence: `It is useful to understand how to use "${normalized}" in a real context.`,
        translationCn: `理解如何在真实语境中使用 ${normalized} 很有帮助。`,
        style: "daily",
        difficulty: "easy",
        source: "mock",
        createdAt: ""
      },
      {
        id: "",
        wordId: "",
        sentence: `Students can improve their writing by applying "${normalized}" naturally.`,
        translationCn: `学生可以通过自然使用 ${normalized} 来提升写作。`,
        style: "IELTS",
        difficulty: "medium",
        source: "mock",
        createdAt: ""
      },
      {
        id: "",
        wordId: "",
        sentence: `The author uses "${normalized}" to clarify the central argument.`,
        translationCn: `作者使用 ${normalized} 来阐明核心论点。`,
        style: "academic",
        difficulty: "medium",
        source: "mock",
        createdAt: ""
      },
      {
        id: "",
        wordId: "",
        sentence: `A clear sentence helps you remember "${normalized}" faster.`,
        translationCn: `清楚的句子能帮助你更快记住 ${normalized}。`,
        style: "spoken",
        difficulty: "easy",
        source: "mock",
        createdAt: ""
      },
      {
        id: "",
        wordId: "",
        sentence: `The concept of "${normalized}" often appears in exam passages.`,
        translationCn: `${normalized} 这个概念常出现在考试文章中。`,
        style: "postgraduate_exam",
        difficulty: "medium",
        source: "mock",
        createdAt: ""
      }
    ]
  };
}

export function mockOutputPrompt(words: string[]): OutputPrompt {
  const selected = words.slice(0, 3);
  return {
    chinese: `请用英文表达：我们需要${selected.join("、")}这些概念，才能清楚说明一个有效的学习方法。`,
    targetWords: selected,
    difficulty: "medium",
    mode: "strict"
  };
}

export function mockGrade(userEnglish: string, targetWords: string[]): OutputGrade {
  const lower = userEnglish.toLowerCase();
  const missing = targetWords.filter((word) => !lower.includes(word.toLowerCase()));
  return {
    score: Math.max(55, 88 - missing.length * 12),
    overall_feedback:
      missing.length > 0
        ? "整体意思可以理解，但有目标词没有使用。下一轮先把目标词自然放进句子。"
        : "目标词基本都使用到了，下一步可以优化搭配和句子自然度。",
    target_word_results: targetWords.map((word) => ({
      word,
      status: missing.includes(word) ? "missing" : "acceptable",
      comment: missing.includes(word) ? "本题要求使用这个词，但你的句子里没有体现。" : "已使用，真实批改会进一步判断语义和搭配。"
    })),
    grammar_issues: [
      {
        type: "clarity",
        original: userEnglish.slice(0, 80),
        suggestion: "Make the subject and verb relationship clearer.",
        explanation: "演示模式只做轻量反馈；配置真实 AI 后会返回最多 3 个关键问题。"
      }
    ],
    collocation_issues: [],
    minimal_revision: userEnglish,
    natural_revision: `A natural version could be: ${userEnglish}`,
    exam_style_revision: `From an exam perspective, the sentence should present the idea more precisely: ${userEnglish}`,
    next_practice_focus: missing.length > 0 ? missing : targetWords.slice(0, 2)
  };
}
