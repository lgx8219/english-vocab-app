import { extractEnglishWords, isLikelyEnglishTerm } from "@/lib/text/word-extract";

export type ExtractMode = "smart" | "vocab" | "table" | "fulltext";

export type ParsedTerm = {
  word: string;
  count: number;
};

const titlePatterns = [
  /^vocabulary\b/i,
  /^word\s*list\b/i,
  /^unit\s+\d+\b/i,
  /^chapter\s+\d+\b/i,
  /^lesson\s+\d+\b/i,
  /^page\s+\d+\b/i,
  /^directions?\b/i,
  /^read\s+the\s+following\b/i,
  /^translate\s+the\s+following\b/i,
  /^example\b/i
];

const partOfSpeechPattern = /^(v|vi|vt|n|adj|adv|prep|conj|pron|phr|phrase|num|art|int|abbr)\.?$/i;
const tableHeaderPattern = /^(word|words|vocabulary|term|terms|english|meaning|translation|chinese|中文|释义)$/i;

export function parseTermsFromText(text: string, mode: ExtractMode): ParsedTerm[] {
  if (mode === "fulltext") return extractEnglishWords(text);
  if (mode === "table") return parseTableTerms(text);
  if (mode === "smart") return parseSmartTerms(text);
  return parseVocabTerms(text);
}

export function parseSmartTerms(text: string): ParsedTerm[] {
  if (looksLikeTable(text)) return parseTableTerms(text);
  const tableTerms = parseTableTerms(text);
  const vocabTerms = parseVocabTerms(text);
  if (tableTerms.length >= Math.max(2, vocabTerms.length)) return tableTerms;
  return vocabTerms;
}

function looksLikeTable(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const tableLikeRows = lines.filter((line) => line.includes(",") || line.includes("\t") || /\s{2,}/.test(line)).length;
  return tableLikeRows / lines.length >= 0.6;
}

export function parseVocabTerms(text: string): ParsedTerm[] {
  const counts = new Map<string, number>();

  for (const rawLine of text.split(/\r?\n/)) {
    const term = parseVocabLine(rawLine);
    if (!term) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }

  return toSortedTerms(counts);
}

export function parseTableTerms(text: string): ParsedTerm[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => splitTableLine(line))
    .filter((row) => row.length > 0);
  const columnIndex = detectWordColumn(rows);
  const counts = new Map<string, number>();

  for (const row of rows) {
    const term = parseCellTerm(row[columnIndex] ?? "");
    if (!term) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }

  return toSortedTerms(counts);
}

function detectWordColumn(rows: string[][]) {
  const maxColumns = Math.max(0, ...rows.map((row) => row.length));
  let bestIndex = 0;
  let bestScore = -1;

  for (let column = 0; column < maxColumns; column += 1) {
    let score = 0;
    for (const row of rows) {
      const cell = row[column] ?? "";
      const term = parseCellTerm(cell);
      if (term) score += hasChinese(cell) ? 1 : 3;
      if (/^(word|vocabulary|term)$/i.test(cell.trim())) score += 2;
      if (/^(meaning|translation|中文|释义)$/i.test(cell.trim())) score -= 3;
      if (hasChinese(cell)) score -= 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = column;
    }
  }

  return bestIndex;
}

function parseVocabLine(rawLine: string) {
  const line = rawLine.trim().replace(/\s+/g, " ");
  if (!line || isNoiseLine(line)) return "";

  const chineseIndex = line.search(/[\u3400-\u9FFF]/);
  const separatorIndex = line.search(/\s[-:：;,，；]\s|[-:：,，；]/);
  const boundaryCandidates = [chineseIndex, separatorIndex].filter((index) => index >= 0);
  const boundary = boundaryCandidates.length ? Math.min(...boundaryCandidates) : -1;
  if (boundary < 0) return "";

  const head = line.slice(0, boundary).trim();
  return cleanHeadTerm(head);
}

function parseCellTerm(cell: string) {
  const normalized = cell.trim().replace(/\s+/g, " ");
  if (!normalized || isNoiseLine(normalized)) return "";
  if (tableHeaderPattern.test(normalized)) return "";
  return cleanHeadTerm(normalized);
}

function cleanHeadTerm(value: string) {
  const withoutPhonetic = value
    .replace(/\/[^/]{1,40}\//g, " ")
    .replace(/\[[^\]]{1,40}\]/g, " ")
    .replace(/\((v|vi|vt|n|adj|adv|prep|conj|pron|phr|phrase|num|art|int|abbr)\.?\)/gi, " ")
    .replace(/[,:：;；，-]+$/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  const tokens = withoutPhonetic.split(" ").filter(Boolean);
  const termTokens: string[] = [];
  for (const token of tokens) {
    if (partOfSpeechPattern.test(token)) break;
    const cleaned = token.replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, "");
    if (!cleaned) continue;
    termTokens.push(cleaned);
  }

  const term = termTokens.join(" ").toLowerCase();
  if (!isLikelyEnglishTerm(term)) return "";
  if (titlePatterns.some((pattern) => pattern.test(term))) return "";
  return term;
}

function splitTableLine(line: string) {
  if (line.includes(",")) return parseCsvLine(line);
  if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
  return line.split(/\s{2,}/).map((cell) => cell.trim());
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function isNoiseLine(line: string) {
  if (/^\d+$/.test(line)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(line)) return true;
  if (/^20\d{2}$/.test(line)) return true;
  if (titlePatterns.some((pattern) => pattern.test(line))) return true;
  if (/^例句[:：]/.test(line)) return true;
  return false;
}

function hasChinese(value: string) {
  return /[\u3400-\u9FFF]/.test(value);
}

function toSortedTerms(counts: Map<string, number>) {
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
}
