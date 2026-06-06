import type { OutputGrade, OutputPrompt } from "@/lib/types";

export function mockOutputPrompt(words: string[]): OutputPrompt {
  const selected = shuffle(words).slice(0, Math.min(3, words.length));
  const scenes = [
    `朋友临时取消计划后，我还是想保持原来的安排，并找到一个更合适的解决办法。`,
    `老师让我们比较两种学习方法，说明哪一种更有效，以及它能带来什么实际帮助。`,
    `公司准备调整项目流程，但大家担心新方法会影响团队之间的沟通。`,
    `我想解释一个习惯为什么很难坚持，以及怎样一步一步改善它。`
  ];
  return {
    promptCn: scenes[Math.floor(Math.random() * scenes.length)],
    targetWords: selected,
    difficulty: "daily",
    mode: "strict",
    expectedUsage: selected.map((word) => ({ word, meaningHintCn: "根据中文语境自然使用" }))
  };
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
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
