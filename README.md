# Vocab AI Study

一个自用英语单词学习网站 MVP：上传词表、生成词卡、三轮训练、错词强化、简单复习调度、AI 输出练习、AI 批改、聊天助手和 token 统计。

## 本地启动

```bash
npm install
npm run dev
```

也可以使用 pnpm：

```bash
pnpm install
pnpm dev
```

复制 `.env.example` 为 `.env.local`，填入 Supabase 与 AI Key。没有 AI Key 时，后端会返回可演示的 mock JSON，方便先跑通流程。

本项目现在使用 Supabase Auth 登录。登录邮箱必须存在于 `allowed_users` 表，否则会进入无权限页面。

AI 模型支持按任务配置，OpenAI 和 DeepSeek 都有独立变量：

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL_CARD=deepseek-chat
DEEPSEEK_MODEL_GRADE=deepseek-chat
DEEPSEEK_MODEL_CHAT=deepseek-chat
```

切换 OpenAI 时使用 `OPENAI_MODEL_CARD`、`OPENAI_MODEL_GRADE`、`OPENAI_MODEL_CHAT` 等同名变量。默认 OpenAI 模型使用 `gpt-5.2`；如果你想省 token，可以把词卡、例句等任务改成 `gpt-5-mini` 或 `gpt-5-nano`。

## Supabase

数据库建表 SQL 在 `supabase/schema.sql`。

白名单表：

```sql
create extension if not exists "pgcrypto";

create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);
```

添加邮箱：

```sql
insert into public.allowed_users (email)
values ('你的邮箱@example.com')
on conflict (email) do nothing;
```

## AI 安全

OpenAI / DeepSeek API Key 只在 Route Handlers 中读取环境变量或服务端配置，不会暴露到前端。

第三阶段后，普通用户可以在 `/settings/ai` 输入自己的 OpenAI 或 DeepSeek Key。Key 会由后端使用 `API_KEY_ENCRYPTION_SECRET` 加密后写入 `user_ai_keys`，前端只显示 `****abcd` 这样的预览。

需要额外环境变量：

```bash
API_KEY_ENCRYPTION_SECRET=一段足够长的随机字符串
```
