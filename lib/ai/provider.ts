import { outputGradeSchema, outputPromptSchema, wordCardSchema } from "@/lib/ai/schemas";
import { mockCard, mockGrade, mockOutputPrompt } from "@/lib/ai/mock";
import { extractEnglishWords } from "@/lib/text/word-extract";
import type { AIProvider, OutputGrade, OutputPrompt, TokenMode } from "@/lib/types";

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
  schemaName
}: {
  config: AIConfig;
  messages: ChatMessage[];
  fallback: T;
  schemaName: string;
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
      temperature: 0.3,
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
  const fallback = mockCard(word);
  const result = await callJsonAI({
    config,
    fallback,
    schemaName: "word_card",
    messages: [
      {
        role: "system",
        content:
          "你是严谨的英语词汇学习助手。只返回 JSON。不要编造词义、词源、词根词缀；不确定就返回 unavailable 或 not_recommended。稳定词卡内容要简洁。"
      },
      {
        role: "user",
        content: `为单词 "${word}" 生成词卡 JSON，字段包括 word, phonetic, partOfSpeech, meanings, derivedWords, collocations, confusableWords, rootAffixAnalysis, examples。例句生成 daily, IELTS, postgraduate_exam, academic, spoken 各一条，并给中文翻译。`
      }
    ]
  });

  return { ...result, data: wordCardSchema.parse(result.data) };
}

export async function generateOutputPrompt(words: string[], config = getServerAIConfig("output")) {
  const fallback = mockOutputPrompt(words);
  const result = await callJsonAI({
    config,
    fallback,
    schemaName: "output_prompt",
    messages: [
      {
        role: "system",
        content:
          "你是英语输出训练出题助手。只返回 JSON。生成一个中文句子，让用户必须用目标词翻译成英文，句子自然，不硬塞词。"
      },
      {
        role: "user",
        content: `目标词：${words.join(", ")}。生成 strict 模式输出练习，字段 chinese, targetWords, difficulty, mode。`
      }
    ]
  });

  return { ...result, data: outputPromptSchema.parse(result.data) };
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
          "你是严格但简洁的英语写作批改老师。只返回 JSON。最多指出 3 个重要问题。不要要求逐字一致，重点检查目标词语义、搭配、词形、语法和自然度。"
      },
      {
        role: "user",
        content: `中文原句：${chinese}\n用户英文：${userEnglish}\n目标词：${targetWords.join(", ")}\n返回 score, overall_feedback, target_word_results, grammar_issues, collocation_issues, minimal_revision, natural_revision, exam_style_revision, next_practice_focus。`
      }
    ]
  });

  return { ...result, data: outputGradeSchema.parse(result.data) };
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
