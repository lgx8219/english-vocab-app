export type ExtractedWord = {
  word: string;
  count: number;
};

const ignoredWords = new Set([
  "the",
  "and",
  "you",
  "your",
  "are",
  "was",
  "were",
  "that",
  "this",
  "with",
  "from",
  "for",
  "but",
  "not",
  "can",
  "have",
  "has",
  "had"
]);

export function extractEnglishWords(text: string): ExtractedWord[] {
  const counts = new Map<string, number>();

  for (const match of text.matchAll(/[A-Za-z][A-Za-z'-]{1,}/g)) {
    const word = match[0].replace(/^[-']+|[-']+$/g, "").toLowerCase();
    if (!isLikelyEnglishWord(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

export function isUsableExtractedText(text: string) {
  const words = extractEnglishWords(text);
  const printableRatio = text.length === 0 ? 0 : Array.from(text).filter((char) => /[\x09\x0A\x0D\x20-\x7E]/.test(char)).length / text.length;
  return words.length >= 3 && printableRatio > 0.65;
}

function isLikelyEnglishWord(word: string) {
  if (word.length < 2 || word.length > 32) return false;
  if (ignoredWords.has(word)) return false;
  if (!/[aeiouy]/.test(word)) return false;
  if (/(.)\1{3,}/.test(word)) return false;
  if (/^[bcdfghjklmnpqrstvwxyz]{5,}$/i.test(word)) return false;
  return true;
}
