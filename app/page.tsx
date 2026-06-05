"use client";

import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  Database,
  Download,
  FileText,
  ImagePlus,
  ShieldCheck,
  Layers,
  ListPlus,
  Monitor,
  Moon,
  ChevronLeft,
  ChevronRight,
  Play,
  Settings,
  Sun,
  Trash2,
  UploadCloud,
  Upload
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AISettingsPanel } from "@/components/AISettingsPanel";
import { ChatWidget } from "@/components/ChatWidget";
import { LogoutButton } from "@/components/LogoutButton";
import { OutputTrainer } from "@/components/OutputTrainer";
import { TrainingPanel } from "@/components/TrainingPanel";
import { WordCardView } from "@/components/WordCardView";
import { useLocalStudyStore } from "@/hooks/useLocalStudyStore";
import type { ImportMode } from "@/hooks/useLocalStudyStore";
import { useThemeMode } from "@/hooks/useThemeMode";
import { duePriority, isDue } from "@/lib/study";

type Tab = "dashboard" | "upload" | "cards" | "train" | "output" | "library" | "plan" | "settings";

export default function Home() {
  useThemeMode();
  const store = useLocalStudyStore();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [input, setInput] = useState("");
  const [uploadResult, setUploadResult] = useState<string>("");
  const [fileStatus, setFileStatus] = useState<string>("");
  const [imageStatus, setImageStatus] = useState<string>("");
  const [imageLoading, setImageLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string>("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);

  const selectedWord = useMemo(
    () => store.words.find((item) => item.id === selectedId) ?? store.todayWords[0],
    [store.words, store.todayWords, selectedId]
  );

  const dueCount = store.words.filter(isDue).length;
  const wrongCount = store.words.filter((item) => item.errorHistory.length > 0).length;
  const generatedCards = store.words.filter((item) => item.card).length;

  function handleUpload() {
    const result = store.upload(input);
    setUploadResult(`已解析 ${result.total} 个词，新增 ${result.added} 个，更新 ${result.reused} 个。`);
    setTab("cards");
  }

  function handleDeleteWord(wordId: string) {
    const word = store.words.find((item) => item.id === wordId);
    if (!word) return;
    if (!window.confirm(`确定删除 “${word.word}” 吗？这个词的词卡、掌握度和错误记录都会一起删除。`)) return;
    store.deleteWord(wordId);
    if (selectedId === wordId) {
      setSelectedId(null);
    }
  }

  async function handleTextFile(file?: File) {
    if (!file) return;
    setFileStatus(`正在解析 ${file.name}...`);
    try {
      if (/\.(txt|csv|md)$/i.test(file.name)) {
        const text = await file.text();
        setInput((current) => mergeInput(current, text));
        setFileStatus(`已读取 ${file.name}，内容已加入下方编辑区，可检查后上传。`);
        return;
      }

      const response = await fetch("/api/files/extract-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          base64: await readFileAsBase64(file)
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setFileStatus(json.error ?? "文件解析失败。");
        return;
      }
      setInput((current) => mergeInput(current, (json.words ?? []).join("\n")));
      setFileStatus(`已从 ${file.name} 识别 ${json.words?.length ?? 0} 个英文单词。`);
    } catch {
      setFileStatus("文件解析失败，请换一个文件试试。");
    }
  }

  async function handleImageFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageStatus("请选择图片文件。");
      return;
    }
    setImageLoading(true);
    setImageStatus("正在识别图片里的单词...");
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      const response = await fetch("/api/ai/extract-words-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, mimeType: file.type })
      });
      const json = await response.json();
      if (!response.ok) {
        setImageStatus(json.error ?? "图片识别失败。");
        return;
      }

      const extracted = (json.data?.items ?? [])
        .map((item: { word: string; meaningCn?: string | null }) =>
          item.meaningCn ? `${item.word} - ${item.meaningCn}` : item.word
        )
        .join("\n");

      store.bumpStats("image", json.meta?.inputTokens, json.meta?.outputTokens);

      if (!extracted) {
        setImageStatus(json.data?.warnings?.[0] ?? "没有从图片中识别到明确的英语单词。");
        return;
      }

      setInput((current) => mergeInput(current, extracted));
      const warning = json.data?.warnings?.length ? ` ${json.data.warnings[0]}` : "";
      setImageStatus(`已从 ${file.name} 识别 ${json.data.items.length} 个词，已加入下方编辑区。${warning}`);
    } catch {
      setImageStatus("图片识别失败，请确认已配置支持视觉识别的 OpenAI 模型。");
    } finally {
      setImageLoading(false);
    }
  }

  function handleExportData() {
    const backup = store.exportData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `vocab-ai-study-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupStatus(`已导出 ${backup.words.length} 个单词的数据备份。`);
  }

  async function handleImportData(file?: File) {
    if (!file) return;
    if (importMode === "overwrite" && !window.confirm("建议先导出当前数据备份，避免误覆盖。确定继续覆盖导入吗？")) return;
    try {
      const text = await file.text();
      const result = store.importData(JSON.parse(text), importMode);
      setBackupStatus(
        result.mode === "overwrite"
          ? `已覆盖导入 ${result.total} 个词。`
          : `已合并导入 ${result.total} 个词：新增 ${result.added} 个，合并更新 ${result.updated} 个。`
      );
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "导入失败，请检查备份文件。");
    }
  }

  function toggleSelectedWord(wordId: string) {
    setSelectedWordIds((current) => current.includes(wordId) ? current.filter((id) => id !== wordId) : [...current, wordId]);
  }

  function handleBatchDelete() {
    if (selectedWordIds.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedWordIds.length} 个词吗？相关词卡、掌握度和错误记录都会一起删除。`)) return;
    store.deleteWords(selectedWordIds);
    setSelectedWordIds([]);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl gap-5 px-4 py-5 lg:px-6">
        <aside className="surface sticky top-5 hidden h-[calc(100vh-2.5rem)] w-64 shrink-0 flex-col rounded-lg p-3 lg:flex">
          <div className="px-3 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white">
              <Brain className="h-5 w-5" />
            </div>
            <h1 className="mt-3 text-lg font-semibold">Vocab AI Study</h1>
            <p className="mt-1 text-xs leading-5 text-black/55">上传、理解、记住、拼对、用对。</p>
          </div>
          <nav className="mt-2 space-y-1">
            <NavButton tab="dashboard" active={tab} setTab={setTab} icon={<BarChart3 />} label="首页" />
            <NavButton tab="upload" active={tab} setTab={setTab} icon={<Upload />} label="上传单词" />
            <NavButton tab="cards" active={tab} setTab={setTab} icon={<BookOpen />} label="词卡" />
            <NavButton tab="train" active={tab} setTab={setTab} icon={<Play />} label="今日训练" />
            <NavButton tab="output" active={tab} setTab={setTab} icon={<Layers />} label="输出训练" />
            <NavButton tab="library" active={tab} setTab={setTab} icon={<Database />} label="词库" />
            <NavButton tab="plan" active={tab} setTab={setTab} icon={<CalendarDays />} label="学习计划" />
            <NavButton tab="settings" active={tab} setTab={setTab} icon={<Settings />} label="AI 设置" />
            <AdminLink />
          </nav>
          <div className="mt-auto px-3 pb-2">
            <LogoutButton compact />
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="surface mb-5 rounded-lg px-4 py-4 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold">Vocab AI Study</h1>
              <LogoutButton />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {(["dashboard", "upload", "cards", "train", "output", "library", "plan", "settings"] as Tab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`focus-ring shrink-0 rounded-md px-3 py-2 text-sm ${tab === item ? "bg-ink text-white" : "bg-paper"}`}
                >
                  {tabLabel(item)}
                </button>
              ))}
              <a
                href="/admin/allowed-users"
                className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm"
              >
                <ShieldCheck className="h-4 w-4" />
                白名单
              </a>
            </div>
          </header>

          {tab === "dashboard" ? (
            <PageShell title="今日概览" subtitle="先上传今天要背的词，再生成词卡和训练。">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={<ListPlus />} label="今日任务" value={store.todayWords.length} />
                <Metric icon={<CalendarDays />} label="到期复习" value={dueCount} />
                <Metric icon={<CheckCircle2 />} label="已有词卡" value={generatedCards} />
                <Metric icon={<Brain />} label="错词数量" value={wrongCount} />
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section className="surface rounded-lg p-5">
                  <h2 className="text-lg font-semibold">快捷开始</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Action label="上传词表" onClick={() => setTab("upload")} />
                    <Action label="生成词卡" onClick={() => setTab("cards")} />
                    <Action label="开始训练" onClick={() => setTab("train")} />
                  </div>
                </section>
                <section className="surface rounded-lg p-5">
                  <h2 className="text-lg font-semibold">任务顺序</h2>
                  <p className="mt-3 text-sm leading-6 text-black/60">错词优先，其次是到期复习词、模糊词和新词。答题会更新掌握度、错误类型和下次复习时间。</p>
                </section>
              </div>
            </PageShell>
          ) : null}

          {tab === "upload" ? (
            <PageShell title="上传单词" subtitle="支持手动粘贴、文本/CSV 文件和图片识别。">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="surface block rounded-lg p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold">上传文本文件</h2>
                      <p className="text-sm text-black/55">支持 .txt / .csv / .md</p>
                    </div>
                  </div>
                    <input
                    type="file"
                    accept=".txt,.csv,.md,.docx,.pdf,text/plain,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => handleTextFile(event.target.files?.[0])}
                    className="mt-4 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-2 file:text-sm file:font-medium"
                  />
                  {fileStatus ? <p className="mt-3 text-sm text-mint">{fileStatus}</p> : null}
                </label>

                <label className="surface block rounded-lg p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-mint text-white">
                      <ImagePlus className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold">上传图片识别</h2>
                      <p className="text-sm text-black/55">图片会发到本站后端，再由 AI 识别</p>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={imageLoading}
                    onChange={(event) => handleImageFile(event.target.files?.[0])}
                    className="mt-4 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-60"
                  />
                  {imageStatus ? <p className={`mt-3 text-sm ${imageStatus.includes("失败") || imageStatus.includes("没有") ? "text-coral" : "text-mint"}`}>{imageStatus}</p> : null}
                </label>

              </div>

              <div className="surface mt-4 rounded-lg p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">待上传词表</h2>
                  <button type="button" onClick={() => setInput("")} className="focus-ring rounded-md border border-black/10 px-3 py-2 text-sm">
                    清空
                  </button>
                </div>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="focus-ring min-h-72 w-full resize-y rounded-md border border-black/15 bg-white px-3 py-3 text-sm leading-6"
                />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleUpload} className="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
                    上传并进入今日任务
                  </button>
                  {uploadResult ? <p className="text-sm text-mint">{uploadResult}</p> : null}
                </div>
              </div>
            </PageShell>
          ) : null}

          {tab === "cards" ? (
            <PageShell title="词卡生成" subtitle="稳定内容只生成一次，例句缓存后可随机切换。">
              <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <WordList
                  words={store.todayWords}
                  selectedId={selectedWord?.id}
                  onSelect={setSelectedId}
                  onDelete={handleDeleteWord}
                />
                {selectedWord ? (
                  <WordCardView
                    item={selectedWord}
                    onGenerated={(card) => store.attachCard(selectedWord.id, card)}
                    onStats={(inputTokens, outputTokens) => store.bumpStats("card", inputTokens, outputTokens)}
                  />
                ) : (
                  <Empty text="还没有单词。先上传今天想背的词。" />
                )}
              </div>
            </PageShell>
          ) : null}

          {tab === "train" ? (
            <PageShell title="今日训练" subtitle="三轮：英文识别中文、中文回忆英文、拼写。错词和使用提示会进入不熟池。">
              <TrainingPanel words={store.todayWords} onUpdate={store.updateWord} />
            </PageShell>
          ) : null}

          {tab === "output" ? (
            <PageShell title="AI 输出训练" subtitle="严格模式：AI 生成中文句子，你用今日目标词翻译成英文，再由 AI 批改。">
              <OutputTrainer words={store.todayWords} onUpdate={store.updateWord} onStats={(i, o) => store.bumpStats("grade", i, o)} />
            </PageShell>
          ) : null}

          {tab === "library" ? (
            <PageShell title="词库" subtitle="查看掌握度、复习时间和最近错误。">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-black/55">已选择 {selectedWordIds.length} 个词</p>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  disabled={selectedWordIds.length === 0}
                  className="focus-ring rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium text-coral disabled:opacity-50"
                >
                  批量删除
                </button>
              </div>
              <div className="surface overflow-hidden rounded-lg">
                <div className="grid grid-cols-[32px_1.1fr_0.7fr_0.6fr_1fr_44px] gap-3 border-b border-black/10 px-4 py-3 text-xs font-semibold text-black/50">
                  <span />
                  <span>单词</span>
                  <span>掌握度</span>
                  <span>等级</span>
                  <span>下次复习</span>
                  <span>操作</span>
                </div>
                {[...store.words].sort((a, b) => duePriority(a) - duePriority(b)).map((word) => (
                  <div key={word.id} className="grid grid-cols-[32px_1.1fr_0.7fr_0.6fr_1fr_44px] items-center gap-3 border-b border-black/5 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedWordIds.includes(word.id)}
                      onChange={() => toggleSelectedWord(word.id)}
                      aria-label={`选择 ${word.word}`}
                    />
                    <span className="font-medium">{word.word}</span>
                    <span>{word.masteryScore}</span>
                    <span>{word.level}</span>
                    <span className="truncate text-black/55">{word.nextReviewAt ? new Date(word.nextReviewAt).toLocaleString() : "现在"}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteWord(word.id)}
                      className="focus-ring grid h-8 w-8 place-items-center rounded-md text-coral hover:bg-coral/10"
                      aria-label={`删除 ${word.word}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </PageShell>
          ) : null}

          {tab === "plan" ? (
            <PageShell title="简单学习计划" subtitle="第一版先判断目标是否现实，不做复杂词频分析。">
              <PlanPanel totalWords={store.words.length} />
              <StudyCalendar words={store.words} />
            </PageShell>
          ) : null}

          {tab === "settings" ? (
            <PageShell title="AI 设置" subtitle="每个用户保存自己的 API Key；Key 会由后端加密保存。">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-4">
                <AISettingsPanel />

                <section className="surface rounded-lg p-5">
                  <h2 className="text-lg font-semibold">外观</h2>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <ThemeButton active={store.theme === "light"} icon={<Sun />} label="浅色" onClick={() => store.setTheme("light")} />
                    <ThemeButton active={store.theme === "dark"} icon={<Moon />} label="深色" onClick={() => store.setTheme("dark")} />
                    <ThemeButton active={store.theme === "system"} icon={<Monitor />} label="系统" onClick={() => store.setTheme("system")} />
                  </div>
                </section>

                <section className="surface rounded-lg p-5">
                  <h2 className="text-lg font-semibold">数据备份</h2>
                  <p className="mt-2 text-sm leading-6 text-black/60">
                    导出会保存词库、词卡、例句缓存、掌握度、错误历史、复习计划、学习设置和统计数据；不会导出真实 API Key。
                  </p>
                  <div className="mt-4 rounded-md bg-paper p-3 text-sm text-black/60">
                    建议先导出当前数据备份，避免误覆盖。
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === "merge"}
                        onChange={() => setImportMode("merge")}
                      />
                      合并导入
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === "overwrite"}
                        onChange={() => setImportMode("overwrite")}
                      />
                      覆盖导入
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleExportData}
                      className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white"
                    >
                      <Download className="h-4 w-4" />
                      一键导出
                    </button>
                    <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-md border border-black/10 px-4 py-2 text-sm font-medium">
                      <UploadCloud className="h-4 w-4" />
                      一键导入
                      <input
                        type="file"
                        accept="application/json,.json"
                        onChange={(event) => handleImportData(event.target.files?.[0])}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  {backupStatus ? <p className="mt-3 text-sm text-mint">{backupStatus}</p> : null}
                </section>
                </div>

                <section className="surface rounded-lg p-5">
                  <h2 className="text-lg font-semibold">Token 使用统计</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <Stat label="词卡生成" value={store.stats.cardGenerations} />
                    <Stat label="例句生成" value={store.stats.exampleGenerations} />
                    <Stat label="图片识别" value={store.stats.imageExtractions ?? 0} />
                    <Stat label="批改次数" value={store.stats.outputGrades} />
                    <Stat label="聊天次数" value={store.stats.chats} />
                    <Stat label="估算输入 token" value={store.stats.estimatedInputTokens} />
                    <Stat label="估算输出 token" value={store.stats.estimatedOutputTokens} />
                  </div>
                </section>
              </div>
            </PageShell>
          ) : null}
        </section>
      </div>
      <ChatWidget
        currentWord={selectedWord}
        todayWords={store.todayWords}
        onStats={(inputTokens, outputTokens) => store.bumpStats("chat", inputTokens, outputTokens)}
      />
    </main>
  );
}

function PageShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-black/58">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function NavButton({
  tab,
  active,
  setTab,
  icon,
  label
}: {
  tab: Tab;
  active: Tab;
  setTab: (tab: Tab) => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setTab(tab)}
      className={`focus-ring flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm ${
        active === tab ? "bg-ink text-white" : "text-black/65 hover:bg-paper"
      }`}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function AdminLink() {
  return (
    <a
      href="/admin/allowed-users"
      className="focus-ring flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-black/65 hover:bg-paper"
    >
      <ShieldCheck className="h-4 w-4" />
      白名单管理
    </a>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-black/55">{label}</p>
        <span className="text-mint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring rounded-md border border-black/10 bg-paper px-3 py-3 text-sm font-medium hover:border-mint">
      {label}
    </button>
  );
}

function ThemeButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${
        active ? "border-ink bg-ink text-white" : "border-black/10 bg-white hover:bg-paper"
      }`}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function WordList({
  words,
  selectedId,
  onSelect,
  onDelete
}: {
  words: ReturnType<typeof useLocalStudyStore>["todayWords"];
  selectedId?: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="surface max-h-[calc(100vh-10rem)] overflow-y-auto rounded-lg p-2">
      {words.length === 0 ? <Empty text="还没有单词。" /> : null}
      {words.map((word) => (
        <div
          key={word.id}
          className={`mb-1 flex items-center gap-2 rounded-md ${
            selectedId === word.id ? "bg-ink text-white" : "hover:bg-paper"
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect(word.id)}
            className="focus-ring min-w-0 flex-1 rounded-md px-3 py-3 text-left text-sm"
          >
            <span className="block truncate font-medium">{word.word}</span>
            <span className={`mt-1 block truncate text-xs ${selectedId === word.id ? "text-white/65" : "text-black/45"}`}>
              {word.card ? "已有词卡" : "待生成"} · 掌握度 {word.masteryScore}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(word.id)}
            className={`focus-ring mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-md ${
              selectedId === word.id ? "text-white/75 hover:bg-white/10" : "text-coral hover:bg-coral/10"
            }`}
            aria-label={`删除 ${word.word}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-black/15 p-4 text-sm text-black/55">{text}</div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-2">
      <span className="text-black/60">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function PlanPanel({ totalWords }: { totalWords: number }) {
  const [days, setDays] = useState(20);
  const [minutes, setMinutes] = useState(45);
  const dailyNew = Math.ceil(totalWords / Math.max(1, days));
  const reviewLoad = Math.ceil(dailyNew * 2.5);
  const realistic = dailyNew <= Math.max(15, Math.floor(minutes / 1.2));
  const mode = dailyNew <= 30 ? "稳定模式" : dailyNew <= 60 ? "标准模式" : "冲刺模式";

  return (
    <div className="surface rounded-lg p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium">总词数</span>
          <input readOnly value={totalWords} className="mt-2 w-full rounded-md border border-black/15 bg-paper px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="font-medium">目标天数</span>
          <input value={days} onChange={(event) => setDays(Number(event.target.value) || 1)} className="focus-ring mt-2 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="font-medium">每日分钟</span>
          <input value={minutes} onChange={(event) => setMinutes(Number(event.target.value) || 1)} className="focus-ring mt-2 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-paper p-3 text-sm">
          <p className="text-black/50">模式</p>
          <p className="mt-1 font-semibold">{mode}</p>
        </div>
        <div className="rounded-md bg-paper p-3 text-sm">
          <p className="text-black/50">每日新词</p>
          <p className="mt-1 font-semibold">{dailyNew}</p>
        </div>
        <div className="rounded-md bg-paper p-3 text-sm">
          <p className="text-black/50">预计复习</p>
          <p className="mt-1 font-semibold">{reviewLoad}</p>
        </div>
      </div>
      <p className={`mt-4 text-sm ${realistic ? "text-mint" : "text-coral"}`}>
        {realistic ? "这个目标基本现实。" : "这个目标偏紧，更适合快速过筛，不能代表稳定掌握。"}
      </p>
    </div>
  );
}

function StudyCalendar({ words }: { words: ReturnType<typeof useLocalStudyStore>["words"] }) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const monthDays = getCalendarDays(visibleMonth);
  const selectedMonthValue = toDateInputValue(visibleMonth);

  function shiftMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const days = monthDays.map((date) => {
    const day = toDateKey(date);
    const due = words.filter((word) => (word.nextReviewAt ?? "").slice(0, 10) === day);
    const learned = words.filter((word) => word.createdAt.slice(0, 10) === day);
    return { day, date, due, learned, inMonth: date.getMonth() === visibleMonth.getMonth() };
  });

  return (
    <section className="surface mt-4 rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">学习日历</h2>
          <p className="mt-1 text-sm text-black/55">可以查看过去或未来任意月份。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => shiftMonth(-1)} className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-black/10 bg-white" aria-label="上个月">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="month"
            value={selectedMonthValue}
            onChange={(event) => {
              const [year, month] = event.target.value.split("-").map(Number);
              if (year && month) setVisibleMonth(new Date(year, month - 1, 1));
            }}
            className="focus-ring rounded-md border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => shiftMonth(1)} className="focus-ring grid h-9 w-9 place-items-center rounded-md border border-black/10 bg-white" aria-label="下个月">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setVisibleMonth(startOfMonth(new Date()))} className="focus-ring rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
            今天
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-black/50">
        {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {days.map((item) => (
          <div key={item.day} className={`min-h-28 rounded-md border border-black/10 bg-white p-3 text-sm ${item.inMonth ? "" : "opacity-45"}`}>
            <p className="font-semibold">{item.date.getDate()}</p>
            <p className="mt-2 text-black/55">新学 {item.learned.length}</p>
            <p className="text-black/55">复习 {item.due.length}</p>
            {item.due.length > 0 ? (
              <p className="mt-2 truncate text-xs text-mint">{item.due.slice(0, 3).map((word) => word.word).join(", ")}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getCalendarDays(month: Date) {
  const first = startOfMonth(month);
  const start = new Date(first);
  const mondayOffset = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function tabLabel(tab: Tab) {
  return {
    dashboard: "首页",
    upload: "上传",
    cards: "词卡",
    train: "训练",
    output: "输出",
    library: "词库",
    plan: "计划",
    settings: "设置"
  }[tab];
}

function mergeInput(current: string, addition: string) {
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) return current;
  const trimmedCurrent = current.trim();
  return trimmedCurrent ? `${trimmedCurrent}\n${trimmedAddition}` : trimmedAddition;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
