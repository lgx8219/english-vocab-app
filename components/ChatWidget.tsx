"use client";

import { MessageCircle, Send, X } from "lucide-react";
import { useState } from "react";
import type { StudyWord } from "@/lib/types";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
};

export function ChatWidget({
  currentWord,
  todayWords,
  onStats
}: {
  currentWord?: StudyWord;
  todayWords: StudyWord[];
  onStats: (inputTokens?: number, outputTokens?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function send() {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    const nextMessages: ChatItem[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          messages: nextMessages.slice(-5),
          context: {
            mode: "chat",
            current_word: currentWord
              ? {
                  word: currentWord.word,
                  meaning: currentWord.card?.meanings?.[0]?.meaningCn ?? currentWord.userMeaning,
                  example: currentWord.card?.examples?.[0]?.sentence
                }
              : null,
            today_words: todayWords.slice(0, 12).map((item) => item.word),
            recent_errors: todayWords.flatMap((item) => item.errorHistory.slice(0, 2)).slice(0, 6)
          }
        })
      });
      const json = await response.json();
      onStats(json.meta?.inputTokens, json.meta?.outputTokens);
      setMessages([...nextMessages, { role: "assistant", content: json.data?.reply ?? json.error ?? "我暂时没能生成回答。" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-ink text-white shadow-soft"
        aria-label="打开 AI 聊天助手"
      >
        <MessageCircle className="h-5 w-5" />
      </button>
      {open ? (
        <section className="fixed bottom-20 right-5 z-50 flex h-[560px] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-soft">
          <header className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">AI 聊天助手</h2>
              <p className="text-xs text-black/55">带当前词卡和今日词表上下文</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="focus-ring rounded p-2" aria-label="关闭">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-paper/60 p-4">
            {messages.length === 0 ? (
              <div className="rounded-md border border-dashed border-black/15 p-3 text-sm text-black/60">
                可以问“这个词怎么用？”、“帮我检查造句”、“这些词怎么一起记？”
              </div>
            ) : null}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                  message.role === "user" ? "ml-auto bg-ink text-white" : "assistant-bubble"
                }`}
              >
                {message.content}
              </div>
            ))}
            {loading ? <div className="text-sm text-black/50">正在思考...</div> : null}
          </div>
          <div className="flex gap-2 border-t border-black/10 p-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") send();
              }}
              className="focus-ring min-w-0 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
              placeholder="问一个单词用法问题"
            />
            <button type="button" onClick={send} className="focus-ring rounded-md bg-mint px-3 text-white" aria-label="发送">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
