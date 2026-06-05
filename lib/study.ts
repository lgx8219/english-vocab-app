import type { ErrorType, StudyWord } from "@/lib/types";

export function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/[^a-z'\- ]/g, "");
}

export function parseWordInput(input: string) {
  const seen = new Set<string>();
  return input
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(parseInputLine)
    .filter((item) => {
      if (!item.normalizedWord || seen.has(item.normalizedWord)) return false;
      seen.add(item.normalizedWord);
      return true;
    });
}

function parseInputLine(line: string) {
  const directPair = line.split(/\s+-\s+|：|:/);
  if (directPair.length > 1) {
    const [rawWord, ...meaningParts] = directPair;
    return [toParsedWord(rawWord, meaningParts.join(":"))];
  }

  const cells = line
    .split(/\t|,/)
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length >= 2 && /[\u3400-\u9fff]/.test(cells.slice(1).join(""))) {
    return [toParsedWord(cells[0], cells.slice(1).join("；"))];
  }

  return line
    .split(/,|;|；/)
    .map((word) => toParsedWord(word))
    .filter((item) => item.normalizedWord);
}

function toParsedWord(rawWord: string, rawMeaning = "") {
  const word = rawWord.trim();
  return {
    word,
    normalizedWord: normalizeWord(word),
    userMeaning: rawMeaning.trim() || undefined
  };
}

export function createStudyWord(word: string, userMeaning?: string): StudyWord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    word,
    normalizedWord: normalizeWord(word),
    userMeaning,
    masteryScore: 0,
    recognitionScore: 0,
    recallScore: 0,
    spellingScore: 0,
    usageScore: 0,
    level: 0,
    correctCount: 0,
    wrongCount: 0,
    lastReviewedAt: null,
    nextReviewAt: now,
    errorHistory: [],
    createdAt: now,
    updatedAt: now
  };
}

const intervalsMinutes = [10, 1440, 4320, 10080, 20160, 43200, 86400, 129600];

export function updateAfterAnswer(
  item: StudyWord,
  questionType: "recognition" | "recall" | "spelling" | "usage",
  isCorrect: boolean,
  usedHint = false,
  errorType?: ErrorType,
  originalAnswer?: string
): StudyWord {
  const now = new Date();
  const deltaMap = {
    recognition: 15,
    recall: 25,
    spelling: 25,
    usage: 20
  };
  const gain = usedHint ? Math.ceil(deltaMap[questionType] / 2) : deltaMap[questionType];
  const loss = questionType === "spelling" ? 12 : questionType === "usage" ? 15 : 10;
  const nextScore = clamp(item.masteryScore + (isCorrect ? gain : -loss), 0, 100);
  const nextLevel = isCorrect
    ? clamp(item.level + (nextScore > 80 ? 1 : 0), 0, 7)
    : clamp(item.level - 1, 0, 7);
  const interval = intervalsMinutes[nextLevel] ?? intervalsMinutes[0];
  const nextReviewAt = new Date(now.getTime() + interval * 60 * 1000).toISOString();

  return {
    ...item,
    masteryScore: nextScore,
    recognitionScore:
      questionType === "recognition"
        ? clamp(item.recognitionScore + (isCorrect ? gain : -loss), 0, 100)
        : item.recognitionScore,
    recallScore:
      questionType === "recall" ? clamp(item.recallScore + (isCorrect ? gain : -loss), 0, 100) : item.recallScore,
    spellingScore:
      questionType === "spelling"
        ? clamp(item.spellingScore + (isCorrect ? gain : -loss), 0, 100)
        : item.spellingScore,
    usageScore:
      questionType === "usage" ? clamp(item.usageScore + (isCorrect ? gain : -loss), 0, 100) : item.usageScore,
    level: nextLevel,
    correctCount: item.correctCount + (isCorrect ? 1 : 0),
    wrongCount: item.wrongCount + (isCorrect ? 0 : 1),
    lastReviewedAt: now.toISOString(),
    nextReviewAt,
    errorHistory:
      !isCorrect && errorType
        ? [
            {
              type: errorType,
              at: now.toISOString(),
              originalAnswer,
              correction: item.word
            },
            ...item.errorHistory
          ].slice(0, 30)
        : item.errorHistory,
    updatedAt: now.toISOString()
  };
}

export function isDue(item: StudyWord) {
  if (!item.nextReviewAt) return true;
  return new Date(item.nextReviewAt).getTime() <= Date.now();
}

export function duePriority(item: StudyWord) {
  const recentErrors = item.errorHistory.length;
  if (recentErrors > 0) return 0;
  if (isDue(item)) return 1;
  if (item.masteryScore < 60) return 2;
  return 3;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
