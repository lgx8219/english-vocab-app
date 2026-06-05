import { LogoutButton } from "@/components/LogoutButton";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="surface w-full max-w-md rounded-lg p-6 text-center">
        <h1 className="text-2xl font-semibold">你没有访问权限</h1>
        <p className="mt-3 text-sm leading-6 text-black/60">请联系网站所有者添加你的邮箱。</p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </section>
    </main>
  );
}
