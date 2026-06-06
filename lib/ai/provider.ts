import { outputGradeSchema, outputPromptSchema, readingPromptSchema, translationGradeSchema, wordCardSchema } from "@/lib/ai/schemas";
import { mockGrade, mockOutputPrompt } from "@/lib/ai/mock";
import { extractEnglishWords } from "@/lib/text/word-extract";
import type { AIProvider, OutputGrade, OutputPrompt, ReadingPrompt, TokenMode, TranslationGrade } from "@/lib/types";

type AIConfig = {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  tokenMode: TokenMode;
};

type AITask = "default" | "card" | "example" | "output" | "grade" | "chat" | "vision";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ExtractedWords = {
  items: Array<{ word: string; count?: number; meaningCn?: string | null }>;
  rawText: string;
  warnings: string[];
};

export function getServerAIConfig(task: AITask = "default"): AIConfig {
  const provider = (process.env.AI_PROVIDER === "deepseek" ? "deepseek" : "openai") as AIProvider;
  const model = modelFor(provider, task);
  const apiKey = provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY;

  return {
    provider,
    model,
    apiKey,
    tokenMode: "normal"
  };
}

export function getServerAIModelSummary() {
  const provider = (process.env.AI_PROVIDER === "deepseek" ? "deepseek" : "openai") as AIProvider;
  return {
    provider,
    defaultModel: modelFor(provider, "default"),
    cardModel: modelFor(provider, "card"),
    outputModel: modelFor(provider, "output"),
    gradeModel: modelFor(provider, "grade"),
    chatModel: modelFor(provider, "chat"),
    visionModel: modelFor("openai", "vision")
  };
}

export function getDefaultModelForProvider(provider: AIProvider) {
  return provider === "deepseek" ? "deepseek-chat" : "gpt-4.1-mini";
}

function modelFor(provider: AIProvider, task: AITask) {
  if (provider === "deepseek") {
    const fallback = process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || "deepseek-chat";
    return (
      {
        default: fallback,
        card: process.env.DEEPSEEK_MODEL_CARD,
        example: process.env.DEEPSEEK_MODEL_EXAMPLE,
        output: process.env.DEEPSEEK_MODEL_OUTPUT,
        grade: process.env.DEEPSEEK_MODEL_GRADE,
        chat: process.env.DEEPSEEK_MODEL_CHAT,
        vision: process.env.DEEPSEEK_MODEL_VISION
      }[task] || fallback
    );
  }

  const fallback = process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-5.2";
  return (
    {
      default: fallback,
      card: process.env.OPENAI_MODEL_CARD,
      example: process.env.OPENAI_MODEL_EXAMPLE,
      output: process.env.OPENAI_MODEL_OUTPUT,
      grade: process.env.OPENAI_MODEL_GRADE,
      chat: process.env.OPENAI_MODEL_CHAT,
      vision: process.env.OPENAI_MODEL_VISION
    }[task] || fallback
  );
}

function endpointFor(provider: AIProvider) {
  return provider === "deepseek"
    ? "https://api.deepseek.com/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5);
}

async function callJsonAI<T>({
  config,
  messages,
  fallback,
  schemaName,
  temperature = 0.3
}: {
  config: AIConfig;
  messages: ChatMessage[];
  fallback: T;
  schemaName: string;
  temperature?: number;
}): Promise<{ data: T; meta: { inputTokens: number; outputTokens: number; mocked: boolean } }> {
  const inputText = messages.map((message) => `${message.role}: ${message.content}`).join("\n");

  if (!config.apiKey) {
    return {
      data: fallback,
      meta: { inputTokens: estimateTokens(inputText), outputTokens: estimateTokens(JSON.stringify(fallback)), mocked: true }
    };
  }

  const response = await fetch(endpointFor(config.provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty content");
  }

  const data = JSON.parse(content) as T;
  return {
    data,
    meta: {
      inputTokens: payload.usage?.prompt_tokens ?? estimateTokens(inputText),
      outputTokens: payload.usage?.completion_tokens ?? estimateTokens(content),
      mocked: false
    }
  };
}

export async function testAIConnection(config: AIConfig) {
  if (!config.apiKey) {
    throw new Error("请先到 AI 设置页输入你的 API Key。");
  }

  const result = await callJsonAI({
    config,
    fallback: { ok: true },
    schemaName: "connection_test",
    messages: [
      {
        role: "system",
        content: "只返回 JSON：{\"ok\":true}。"
      },
      {
        role: "user",
        content: "测试连接。"
      }
    ]
  });

  return result.meta;
}

export async function generateCard(word: string, config = getServerAIConfig("card")) {
  if (!config.apiKey) {
    throw new Error("请先到 AI 设置页输入你的 API Key。");
  }

  const messages = buildWordCardMessages(word);
  let lastMeta: { inputTokens: number; outputTokens: number; mocked: boolean } | null = null;
  let lastFailure = "quality";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callJsonAI<unknown>({
        config,
        fallback: {},
        schemaName: "word_card",
        messages: attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: "user",
                content:
                  `上一次结果没有通过校验，失败原因：${lastFailure}。请重新生成完整、准确、自然的词卡 JSON。核心字段必须包含：word, partOfSpeech, meanings, examples。不要输出解释，不要输出占位内容。`
              }
            ]
      });
      lastMeta = result.meta;
      const normalized = normalizeWordCard(result.data, word);
      const parsed = wordCardSchema.parse(normalized);
      const quality = validateWordCardQuality(parsed, word);
      if (quality.ok) return { data: parsed, meta: result.meta };
      lastFailure = quality.reason;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message.slice(0, 160) : "schema";
    }
  }

  throw new WordCardQualityError("词卡生成失败，请重试。", lastMeta ?? undefined);
}

export class WordCardQualityError extends Error {
  meta?: { inputTokens: number; outputTokens: number; mocked: boolean };

  constructor(message: string, meta?: { inputTokens: number; outputTokens: number; mocked: boolean }) {
    super(message);
    this.name = "WordCardQualityError";
    this.meta = meta;
  }
}

function buildWordCardMessages(word: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是严谨的英语词汇老师和词典编辑助手。根据用户提供的英文单词或短语生成适合英语学习者的词卡。准确优先；不确定就留空、返回空数组或 null，不要编造。释义要自然清楚、中文友好；搭配必须真实自然；例句必须语法正确并符合该词真实用法；派生词只写真实常见派生词；词根词缀分析只有可靠时才写，不适合拆分时返回 null。只返回合法 JSON object，不要 Markdown，不要解释。"
    },
    {
      role: "user",
      content:
        `目标词：${word}\n` +
        "返回 JSON 字段：word, phonetic, partOfSpeech, meanings, collocations, derivedWords, examples, rootAffixAnalysis, notes。\n" +
        "字段规则：word 必须是目标词；phonetic 为标准音标，不确定则为空字符串；partOfSpeech 为真实常见词性数组或字符串；meanings 数组内包含 pos, meaningCn, meaningEn, usage；collocations 为真实自然搭配数组，无法确认可为空数组；derivedWords 数组内包含 word, pos, meaningCn，只写真实常见派生词；examples 至少 2 条，每项包含 sentence, translationCn, style；rootAffixAnalysis 可靠时返回对象，不可靠或不适合拆分时返回 null；notes 可为空字符串。\n" +
        "质量禁令：不要输出占位内容；不要输出 unknown、N/A、待确认；不要伪造音标；不要添加错误词性；不要机械拼接搭配；不要把近义词误当派生词；不要输出和目标词无关的内容。"
    }
  ];
}

function normalizeWordCard(raw: unknown, word: string) {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const meanings = normalizeMeanings(data.meanings);
  const examples = normalizeExamples(data.examples);

  return {
    word: readString(data.word, word),
    phonetic: normalizePhonetic(readString(data.phonetic, readString(data.phonetics, ""))),
    partOfSpeech: normalizePartOfSpeech(data.partOfSpeech ?? data.part_of_speech),
    meanings,
    derivedWords: normalizeDerivedWords(data.derivedWords ?? data.derived_words),
    collocations: normalizeStringArray(data.collocations),
    confusableWords: normalizeConfusableWords(data.confusableWords ?? data.confusable_words),
    rootAffixAnalysis: normalizeRootAffix(data.rootAffixAnalysis ?? data.root_affix_analysis),
    notes: readString(data.notes, ""),
    examples
  };
}

function normalizeMeanings(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return { partOfSpeech: "", meaningCn: entry };
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const meaningCn = readString(item.meaningCn, readString(item.meaning_cn, readString(item.meaning, "")));
      if (!meaningCn) return null;
      return {
        partOfSpeech: readString(item.partOfSpeech, readString(item.part_of_speech, readString(item.pos, ""))),
        meaningCn,
        meaningEn: readString(item.meaningEn, readString(item.meaning_en, "")) || undefined,
        usage: readString(item.usage, "") || undefined
      };
    })
    .filter(Boolean);
}

function normalizeDerivedWords(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const derivedWord = readString(item.word, "");
      const pos = readString(item.pos, readString(item.partOfSpeech, readString(item.part_of_speech, "")));
      const meaningCn = readString(item.meaningCn, readString(item.meaning_cn, readString(item.meaning, "")));
      return derivedWord && meaningCn ? { word: derivedWord, pos: pos || undefined, meaningCn } : null;
    })
    .filter(Boolean);
}

function normalizeConfusableWords(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const confusableWord = readString(item.word, "");
      const noteCn = readString(item.noteCn, readString(item.note_cn, readString(item.note, "")));
      return confusableWord && noteCn ? { word: confusableWord, noteCn } : null;
    })
    .filter(Boolean);
}

function normalizeExamples(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const sentence = readString(item.sentence, "");
      const translationCn = readString(item.translationCn, readString(item.translation_cn, readString(item.translation, "")));
      if (!sentence || !translationCn) return null;
      return {
        sentence,
        translationCn,
        style: normalizeExampleStyle(item.style, index),
        difficulty: normalizeDifficulty(item.difficulty)
      };
    })
    .filter(Boolean);
}

function normalizeRootAffix(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const simpleParts = [
    normalizeSimpleRootPart(item.prefix, "prefix"),
    normalizeSimpleRootPart(item.root, "root"),
    normalizeSimpleRootPart(item.suffix, "suffix")
  ].filter(Boolean);
  const confidence = normalizeRootConfidence(item.confidence);
  const analysisType = normalizeAnalysisType(item.analysis_type ?? item.analysisType);
  const parts = Array.isArray(item.parts) ? item.parts.map(normalizeRootPart).filter(Boolean) : simpleParts;
  const memoryLogic = readNullableString(item.memory_logic ?? item.memoryLogic ?? item.explanation);
  if (parts.length === 0 && !memoryLogic) return null;
  return {
    word: readString(item.word, ""),
    suitable_for_root_affix: Boolean(item.suitable_for_root_affix ?? item.suitableForRootAffix),
    confidence,
    analysis_type: analysisType,
    parts,
    memory_logic: memoryLogic,
    sources: [],
    warning: readNullableString(item.warning)
  };
}

function normalizeSimpleRootPart(raw: unknown, type: "prefix" | "root" | "suffix") {
  const text = readString(raw, "");
  return text ? { text, type, meaning_cn: "", meaning_en: "" } : null;
}

function normalizeRootPart(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const type = readString(item.type, "root").toLowerCase();
  return {
    text: readString(item.text, ""),
    type: type === "prefix" || type === "suffix" ? type : "root",
    meaning_cn: readString(item.meaning_cn, readString(item.meaningCn, "")),
    meaning_en: readString(item.meaning_en, readString(item.meaningEn, ""))
  };
}

function normalizeStringArray(raw: unknown) {
  return Array.isArray(raw) ? raw.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizePartOfSpeech(raw: unknown) {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean).join(" / ");
  return readString(raw, "");
}

function normalizePhonetic(raw: string) {
  if (!raw) return "";
  const value = raw.trim();
  return /^\/[^/]{2,40}\/$/.test(value) || /^\[[^\]]{2,40}\]$/.test(value) ? value : "";
}

function normalizeExampleStyle(raw: unknown, index: number) {
  const value = String(raw ?? "").toLowerCase();
  if (value === "ielts") return "IELTS";
  if (value === "postgraduate_exam" || value === "postgraduate" || value === "exam") return "postgraduate_exam";
  if (value === "academic") return "academic";
  if (value === "spoken") return "spoken";
  if (value === "daily") return "daily";
  return ["daily", "IELTS", "postgraduate_exam", "academic", "spoken"][index % 5];
}

function normalizeDifficulty(raw: unknown) {
  const value = String(raw ?? "").toLowerCase();
  return value === "hard" || value === "medium" ? value : "easy";
}

function normalizeRootConfidence(raw: unknown) {
  const value = String(raw ?? "").toLowerCase();
  return value === "high" || value === "medium" || value === "uncertain" || value === "false" ? value : "low";
}

function normalizeAnalysisType(raw: unknown) {
  const value = String(raw ?? "").toLowerCase();
  return value === "root_affix" || value === "memory_aid" ? value : "not_recommended";
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "no") return false;
  }
  return fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateWordCardQuality(card: ReturnType<typeof wordCardSchema.parse>, requestedWord: string) {
  const requested = normalizeComparableWord(requestedWord);
  const returned = normalizeComparableWord(card.word);
  if (!requested || !returned || !wordsMatch(requested, returned)) return { ok: false, reason: "word mismatch" };
  if (!card.meanings.length) return { ok: false, reason: "missing meanings" };
  if (!card.examples.length) return { ok: false, reason: "missing examples" };
  if (!card.partOfSpeech.trim()) return { ok: false, reason: "missing partOfSpeech" };
  if (containsPlaceholder(card.word) || containsPlaceholder(card.partOfSpeech) || containsPlaceholder(card.notes ?? "")) return { ok: false, reason: "placeholder" };
  if (card.phonetic && !normalizePhonetic(card.phonetic)) return { ok: false, reason: "bad phonetic" };
  for (const meaning of card.meanings) {
    if (!meaning.meaningCn.trim() || containsPlaceholder(meaning.meaningCn) || containsPlaceholder(meaning.partOfSpeech)) return { ok: false, reason: "bad meaning" };
  }
  for (const example of card.examples) {
    if (!example.sentence.trim() || !example.translationCn.trim()) return { ok: false, reason: "bad example" };
    if (containsPlaceholder(example.sentence) || containsPlaceholder(example.translationCn)) return { ok: false, reason: "placeholder example" };
  }
  return { ok: true, reason: "" };
}

function normalizeComparableWord(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function wordsMatch(requested: string, returned: string) {
  return requested === returned || requested.replace(/-/g, " ") === returned.replace(/-/g, " ");
}

function containsPlaceholder(value: string) {
  return /核心含义待确认|待确认|unknown|n\/a|not available|占位|无法确定/i.test(value);
}

export async function generateOutputPrompt(
  words: string[],
  config = getServerAIConfig("output"),
  length: "sentence" | "paragraph" = "sentence",
  options: {
    targetCount?: number;
    difficulty?: string;
    recentPrompts?: string[];
    attempt?: number;
  } = {}
) {
  const fallback = mockOutputPrompt(words);
  const requestedCount = Math.max(1, Math.min(10, options.targetCount ?? (length === "paragraph" ? 5 : 2), words.length));
  const maxWords = requestedCount;
  const variation = randomPracticeVariation();
  const recentPrompts = (options.recentPrompts ?? []).slice(0, 10).map((item, index) => `${index + 1}. ${item}`).join("\n");
  const levelLabel = outputDifficultyLabel(options.difficulty);
  const result = await callJsonAI({
    config,
    fallback,
    schemaName: "output_prompt",
    temperature: 0.95,
    messages: [
      {
        role: "system",
        content:
          "你是英语输出训练题目生成器。只返回 JSON object。你的任务是根据目标英文词生成一条中文中译英练习题，让用户把中文翻译成英文并尽量使用目标词。你不能生成作文题、问答题、阅读题、讨论题或开放式问题。你不能给英文答案。你只能生成中文陈述句或中文短段。"
      },
      {
        role: "user",
        content:
          `本次必须围绕这些英文词出题：${words.join(", ")}。\n` +
          `目标词数：尽量使用 ${requestedCount} 个词；如果词太多导致一句话不自然，可以生成一小段中文。\n` +
          `题型：${length === "paragraph" || requestedCount >= 5 ? "中文短段落，2 到 4 句" : requestedCount >= 3 ? "中文一句或两句" : "中文单句"}。\n` +
          `难度/场景：${levelLabel}。\n` +
          `本次随机语境：${variation}。\n` +
          `随机编号：${crypto.randomUUID()}-${options.attempt ?? 0}。\n` +
          (recentPrompts ? `最近生成过的题目摘要，请避开这些表达、人物、场景和句式：\n${recentPrompts}\n` : "") +
          "硬性禁止：不要出现问号；不要出现“你认为”“是否同意”“讨论”“观点”“优缺点”“写一篇”“agree/disagree”“advantages and disadvantages”等作文题表达；不要出现任何英文目标词；不要生成英文题目；不要生成阅读理解题。\n" +
          "请生成一个全新的中文中译英练习句或短段。中文内容要自然，用户翻译成英文时应该能自然用上目标词。\n" +
          `targetWords 最多 ${maxWords} 个，只放题目真正需要使用的词。expectedUsage 只给每个目标词的中文含义提示，不要给英文答案句子。\n` +
          "生成 JSON 字段：promptCn, targetWords, difficulty, expectedUsage, mode。difficulty 只能是 daily/postgraduate/ielts，mode 固定 strict。"
      }
    ]
  });

  const data = outputPromptSchema.parse(normalizeOutputPrompt(result.data, words));
  data.targetWords = data.targetWords.slice(0, maxWords);
  if (!data.promptCn.trim() || isInvalidOutputPrompt(data.promptCn, data.targetWords)) {
    throw new Error("AI returned invalid output prompt");
  }
  return { ...result, data };
}

function outputDifficultyLabel(value?: string) {
  if (value === "kaoyan" || value === "postgraduate") return "考研，正式一些，偏社会、教育、科技、经济类表达，但只生成中译英句子或短段，不生成作文题";
  if (value === "ielts") return "雅思，偏教育、科技、社会、环境等真实话题";
  return "日常，真实自然，说人话";
}

function isInvalidOutputPrompt(promptCn: string, targetWords: string[]) {
  const lower = promptCn.toLowerCase();
  if (/[?？]/.test(promptCn)) return true;
  if (/你认为|是否同意|讨论|观点|优缺点|写一篇|作文|阅读理解|agree|disagree|advantages|disadvantages|to what extent/i.test(promptCn)) return true;
  return targetWords.some((word) => word && lower.includes(word.toLowerCase()));
}

export async function generateReadingPrompt(words: string[], config = getServerAIConfig("output"), length: "sentence" | "paragraph" = "paragraph") {
  const targetWords = words.slice(0, 10);
  const maxWords = length === "paragraph" ? 5 : 2;
  const variation = randomPracticeVariation();
  const fallback: ReadingPrompt = {
    title: "Context Reading",
    passage: "",
    targetWords,
    difficulty: "medium"
  };
  const result = await callJsonAI({
    config,
    fallback,
    schemaName: "reading_prompt",
    temperature: 0.85,
    messages: [
      {
        role: "system",
        content:
          "你是英语英译中训练出题助手。只返回 JSON object。用用户今日词生成自然英文句子或短文，让用户翻译成中文。内容要像真实阅读材料或真实表达，说人话，逻辑自然。自然优先，不要为了覆盖词汇而硬塞词。"
      },
      {
        role: "user",
        content:
          `可选今日词：${targetWords.join(", ")}\n` +
          `题型：${length === "paragraph" ? "英文短文，80 到 120 词" : "英文单句或两句"}。\n` +
          `本次随机语境：${variation}。\n` +
          `随机编号：${crypto.randomUUID()}。\n` +
          "不要复用上一次的句子结构、人物、场景或表达方式。\n" +
          `请只选择适合放在同一语境里的 ${length === "paragraph" ? "3 到 5" : "1 到 2"} 个词，最多 ${maxWords} 个。不要把不相关的词硬凑在一起。\n` +
          "生成 JSON：title, passage, targetWords, difficulty。targetWords 只放 passage 里实际自然使用到的词。difficulty 用 easy/medium/hard。"
      }
    ]
  });

  const data = readingPromptSchema.parse(normalizeReadingPrompt(result.data, targetWords));
  data.targetWords = data.targetWords.slice(0, maxWords);
  if (!data.passage.trim()) throw new Error("AI returned empty reading passage");
  return { ...result, data };
}

function randomPracticeVariation() {
  const scenes = [
    "校园学习",
    "工作沟通",
    "健康生活",
    "旅行见闻",
    "科技使用",
    "家庭日常",
    "朋友聊天",
    "城市生活",
    "考试备考",
    "环境与社会"
  ];
  const tones = ["自然口语", "简洁书面语", "考试表达", "轻松叙述", "现实建议"];
  return `${scenes[Math.floor(Math.random() * scenes.length)]} / ${tones[Math.floor(Math.random() * tones.length)]}`;
}

export async function gradeTranslation({
  passage,
  userTranslation,
  targetWords,
  config
}: {
  passage: string;
  userTranslation: string;
  targetWords: string[];
  config?: AIConfig;
}): Promise<{ data: TranslationGrade; meta: { inputTokens: number; outputTokens: number; mocked: boolean } }> {
  const activeConfig = config ?? getServerAIConfig("grade");
  const fallback: TranslationGrade = {
    score: 0,
    is_passed: false,
    overall_feedback: "",
    target_word_results: [],
    missing_meanings: [],
    serious_errors: [],
    improved_translation: "",
    review_suggestions: []
  };
  const result = await callJsonAI({
    config: activeConfig,
    fallback,
    schemaName: "translation_grade",
    messages: [
      {
        role: "system",
        content:
          "你是英语阅读翻译批改老师。只返回 JSON object。不要要求逐字一致，重点检查核心意思、逻辑关系、目标词语境含义、漏译误译和中文自然度。反馈要简洁。"
      },
      {
        role: "user",
        content:
          `英文原文：${passage}\n用户中文翻译：${userTranslation}\n目标词：${targetWords.join(", ")}\n` +
          "返回 JSON：score, is_passed, overall_feedback, target_word_results, missing_meanings, serious_errors, improved_translation, review_suggestions。target_word_results 每项包含 word, meaning_in_context, user_translation_status(correct/missing/incorrect/partial), comment。"
      }
    ]
  });

  return { ...result, data: translationGradeSchema.parse(normalizeTranslationGrade(result.data)) };
}

export async function gradeOutput({
  chinese,
  userEnglish,
  targetWords,
  config
}: {
  chinese: string;
  userEnglish: string;
  targetWords: string[];
  config?: AIConfig;
}): Promise<{ data: OutputGrade; meta: { inputTokens: number; outputTokens: number; mocked: boolean } }> {
  const activeConfig = config ?? getServerAIConfig("grade");
  const fallback = mockGrade(userEnglish, targetWords);
  const result = await callJsonAI({
    config: activeConfig,
    fallback,
    schemaName: "output_grade",
    messages: [
      {
        role: "system",
        content:
          "你是严格但有帮助的英语写作批改老师。只返回 JSON object。不要要求逐字一致。反馈要具体、可执行，不要只说笼统好坏。重点检查：目标词是否自然使用、词义是否匹配中文、搭配、词形、语法、句子结构、是否中式英文。最多指出 3 个最重要问题，每个问题说明为什么错、怎么改。"
      },
      {
        role: "user",
        content:
          `中文原题：${chinese}\n用户英文：${userEnglish}\n建议使用的目标词：${targetWords.join(", ")}\n` +
          "返回 JSON 字段：score, overall_feedback, target_word_results, grammar_issues, collocation_issues, minimal_revision, natural_revision, exam_style_revision, next_practice_focus。\n" +
          "要求：overall_feedback 用中文，先总结最关键问题；target_word_results 逐个说明目标词是否用对；grammar_issues 和 collocation_issues 最多各 3 项；三个 revision 要真的重写，不要复制用户原句；next_practice_focus 给出 2 到 5 个下一步练习重点。"
      }
    ]
  });

  return { ...result, data: outputGradeSchema.parse(normalizeOutputGrade(result.data, userEnglish, targetWords)) };
}

export function normalizeOutputPrompt(raw: unknown, fallbackWords: string[]) {
  const data = asRecord(raw);
  const promptCn = readString(data.promptCn, readString(data.prompt_cn, readString(data.chinese, readString(data.prompt, readString(data.sentence, readString(data.text, ""))))));
  const targetWords = normalizeStringArray(data.targetWords ?? data.target_words ?? data.words).filter(Boolean).length
    ? normalizeStringArray(data.targetWords ?? data.target_words ?? data.words)
    : fallbackWords;
  return {
    promptCn,
    chinese: promptCn,
    targetWords,
    difficulty: normalizeOutputDifficulty(data.difficulty),
    mode: "strict",
    expectedUsage: normalizeExpectedUsage(data.expectedUsage ?? data.expected_usage, targetWords)
  };
}

function normalizeOutputDifficulty(value: unknown): "daily" | "postgraduate" | "ielts" {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("ielts") || text.includes("雅思")) return "ielts";
  if (text.includes("postgraduate") || text.includes("kaoyan") || text.includes("考研")) return "postgraduate";
  return "daily";
}

function normalizeExpectedUsage(raw: unknown, targetWords: string[]) {
  if (Array.isArray(raw)) {
    const items = raw
      .map((item) => {
        const record = asRecord(item);
        return {
          word: readString(record.word, ""),
          meaningHintCn: readString(record.meaningHintCn, readString(record.meaning_hint_cn, readString(record.meaning, "根据中文语境自然使用")))
        };
      })
      .filter((item) => item.word);
    if (items.length) return items;
  }
  return targetWords.map((word) => ({ word, meaningHintCn: "根据中文语境自然使用" }));
}

export function normalizeReadingPrompt(raw: unknown, fallbackWords: string[]) {
  const data = asRecord(raw);
  return {
    title: readString(data.title, "英译中训练"),
    passage: readString(data.passage, readString(data.article, readString(data.paragraph, readString(data.text, readString(data.sentence, ""))))),
    targetWords: normalizeStringArray(data.targetWords ?? data.target_words ?? data.words).filter(Boolean).length
      ? normalizeStringArray(data.targetWords ?? data.target_words ?? data.words)
      : fallbackWords,
    difficulty: normalizeDifficulty(data.difficulty)
  };
}

export function normalizeTranslationGrade(raw: unknown) {
  const data = asRecord(raw);
  return {
    score: readNumber(data.score, 0),
    is_passed: readBoolean(data.is_passed ?? data.isPassed, readNumber(data.score, 0) >= 60),
    overall_feedback: readString(data.overall_feedback, readString(data.overallFeedback, readString(data.feedback, ""))),
    target_word_results: normalizeTranslationWordResults(data.target_word_results ?? data.targetWordResults),
    missing_meanings: normalizeStringArray(data.missing_meanings ?? data.missingMeanings),
    serious_errors: normalizeStringArray(data.serious_errors ?? data.seriousErrors),
    improved_translation: readString(data.improved_translation, readString(data.improvedTranslation, readString(data.reference_translation, ""))),
    review_suggestions: normalizeStringArray(data.review_suggestions ?? data.reviewSuggestions ?? data.suggestions)
  };
}

function normalizeOutputGrade(raw: unknown, userEnglish: string, targetWords: string[]) {
  const data = asRecord(raw);
  return {
    score: readNumber(data.score, 0),
    overall_feedback: readString(data.overall_feedback, readString(data.overallFeedback, readString(data.feedback, ""))),
    target_word_results: normalizeOutputWordResults(data.target_word_results ?? data.targetWordResults, targetWords),
    grammar_issues: normalizeIssueArray(data.grammar_issues ?? data.grammarIssues),
    collocation_issues: normalizeCollocationArray(data.collocation_issues ?? data.collocationIssues),
    minimal_revision: readString(data.minimal_revision, readString(data.minimalRevision, userEnglish)),
    natural_revision: readString(data.natural_revision, readString(data.naturalRevision, userEnglish)),
    exam_style_revision: readString(data.exam_style_revision, readString(data.examStyleRevision, userEnglish)),
    next_practice_focus: normalizeStringArray(data.next_practice_focus ?? data.nextPracticeFocus)
  };
}

function normalizeTranslationWordResults(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = asRecord(entry);
    return {
      word: readString(item.word, ""),
      meaning_in_context: readString(item.meaning_in_context, readString(item.meaningInContext, "")),
      user_translation_status: normalizeTranslationStatus(item.user_translation_status ?? item.userTranslationStatus ?? item.status),
      comment: readString(item.comment, "")
    };
  }).filter((item) => item.word);
}

function normalizeOutputWordResults(raw: unknown, targetWords: string[]) {
  const rows = Array.isArray(raw) ? raw : [];
  const normalized = rows.map((entry) => {
    const item = asRecord(entry);
    return {
      word: readString(item.word, ""),
      status: normalizeOutputStatus(item.status),
      comment: readString(item.comment, "")
    };
  }).filter((item) => item.word);
  if (normalized.length) return normalized;
  return targetWords.map((word) => ({ word, status: "missing" as const, comment: "未检测到该目标词的使用情况。" }));
}

function normalizeIssueArray(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = asRecord(entry);
    return {
      type: readString(item.type, "expression"),
      original: readString(item.original, ""),
      suggestion: readString(item.suggestion, ""),
      explanation: readString(item.explanation, "")
    };
  });
}

function normalizeCollocationArray(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const item = asRecord(entry);
    return {
      original: readString(item.original, ""),
      suggestion: readString(item.suggestion, ""),
      explanation: readString(item.explanation, "")
    };
  });
}

function normalizeTranslationStatus(raw: unknown) {
  const value = String(raw ?? "").toLowerCase();
  if (value === "correct" || value === "missing" || value === "incorrect" || value === "partial") return value;
  if (value === "wrong") return "incorrect";
  return "partial";
}

function normalizeOutputStatus(raw: unknown) {
  const value = String(raw ?? "").toLowerCase();
  if (
    value === "correct" ||
    value === "acceptable" ||
    value === "wrong_meaning" ||
    value === "wrong_collocation" ||
    value === "wrong_form" ||
    value === "missing" ||
    value === "forced"
  ) return value;
  return "acceptable";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function chatWithTutor(message: string, messages: ChatMessage[], context: unknown, config = getServerAIConfig("chat")) {
  const fallback = {
    reply:
      "我可以帮你解释单词、区分近义词、检查句子、造例句或给学习建议。你可以直接问我具体问题。"
  };
  const recentMessages = messages
    .slice(-5)
    .map((item) => `${item.role === "assistant" ? "assistant" : "user"}: ${item.content}`)
    .join("\n");

  return callJsonAI({
    config,
    fallback,
    schemaName: "chat_reply",
    messages: [
      {
        role: "system",
        content:
          "你是一个嵌入英语学习网站的 AI 英语学习助手。你的任务是帮助用户背单词、理解词义、学习语法、练习翻译、批改英文、生成例句、解释搭配、区分近义词和制定学习建议。规则：1. 不要默认把用户输入翻译成英文。2. 只有当用户明确要求“翻译”“帮我翻成英文”“translate”等时，才执行翻译。3. 如果用户问“这个词什么意思”“怎么用”“有什么区别”，要解释。4. 如果用户发来英文句子并要求检查，要指出语法、搭配、自然度问题。5. 如果用户要求造句，要根据目标考试或难度生成例句。6. 如果用户问学习建议，要给出具体建议。7. 如果当前上下文里有 current_word、today_words、recent_errors，要优先结合这些信息回答。8. 回答要简洁、清楚、适合英语学习。9. 涉及词根词缀或词源时，不确定就说明不确定，不要编造。10. 默认用中文回答，除非用户要求英文回答。只返回 JSON：{\"reply\":\"...\"}。"
      },
      {
        role: "user",
        content: `当前上下文：${JSON.stringify(context).slice(0, 3500)}\n最近对话：${recentMessages.slice(0, 2000)}\n当前用户输入：${message}`
      }
    ]
  });
}

export async function extractWordsFromImage({
  imageDataUrl,
  mimeType,
  config = getServerAIConfig("vision")
}: {
  imageDataUrl: string;
  mimeType: string;
  config?: AIConfig;
}): Promise<{ data: ExtractedWords; meta: { inputTokens: number; outputTokens: number; mocked: boolean } }> {
  const fallback: ExtractedWords = {
    items: [],
    rawText: "",
    warnings: ["未配置可识别图片的 OpenAI API Key，无法从图片中提取单词。"]
  };
  const inputTokens = estimateTokens(`image:${mimeType}:${imageDataUrl.slice(0, 1200)}`);

  if (!config.apiKey) {
    return {
      data: fallback,
      meta: { inputTokens, outputTokens: estimateTokens(JSON.stringify(fallback)), mocked: true }
    };
  }

  if (config.provider !== "openai") {
    throw new Error("当前 DeepSeek 模型暂不支持图片 OCR，请切换到支持视觉识别的模型，或使用 OpenAI 视觉模型。");
  }

  const response = await fetch(endpointFor(config.provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "你是 OCR 引擎。请从图片中提取所有可见英文文字。只返回图片中的原文，不要翻译，不要解释，不要补充图片中不存在的内容。保留英文单词、短语和句子。如果图片中没有英文文字，返回空字符串。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "请提取这张图片中的所有可见英文原文。"
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Image OCR request failed: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned empty image OCR content");
  }

  const rawText = content.trim();
  const items = extractEnglishWords(rawText);
  return {
    data: {
      items,
      rawText,
      warnings: items.length === 0 ? ["没有在图片中识别到英文单词。"] : []
    },
    meta: {
      inputTokens: payload.usage?.prompt_tokens ?? inputTokens,
      outputTokens: payload.usage?.completion_tokens ?? estimateTokens(rawText),
      mocked: false
    }
  };
}
