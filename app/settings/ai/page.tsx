import Link from "next/link";
import { AISettingsPanel } from "@/components/AISettingsPanel";
import { LogoutButton } from "@/components/LogoutButton";

export default function AISettingsRoute() {
  return (
    <main className="min-h-screen px-4 py-6 lg:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">AI 设置</h1>
            <p className="mt-1 text-sm text-black/58">每个账号使用自己的 API Key。</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="focus-ring rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium hover:bg-paper">
              回到网站
            </Link>
            <LogoutButton />
          </div>
        </header>
        <AISettingsPanel />
      </div>
    </main>
  );
}
