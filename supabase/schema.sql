create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'deepseek')),
  model text not null,
  encrypted_api_key text,
  server_env_key boolean default true,
  token_mode text not null default 'normal' check (token_mode in ('saving', 'normal', 'quality')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_ai_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'deepseek')),
  encrypted_api_key text not null,
  model text not null,
  key_preview text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);

alter table public.user_ai_keys enable row level security;

drop policy if exists "Users can read own ai keys" on public.user_ai_keys;
create policy "Users can read own ai keys"
on public.user_ai_keys
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own ai keys" on public.user_ai_keys;
create policy "Users can insert own ai keys"
on public.user_ai_keys
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own ai keys" on public.user_ai_keys;
create policy "Users can update own ai keys"
on public.user_ai_keys
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ai keys" on public.user_ai_keys;
create policy "Users can delete own ai keys"
on public.user_ai_keys
for delete
using (auth.uid() = user_id);

create table if not exists public.words (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  word text not null,
  normalized_word text not null,
  created_at timestamptz not null default now(),
  unique(user_id, normalized_word)
);

create table if not exists public.word_cards (
  id uuid primary key default uuid_generate_v4(),
  word_id uuid not null references public.words(id) on delete cascade,
  phonetic text,
  part_of_speech text,
  meanings_json jsonb not null default '[]'::jsonb,
  derived_words_json jsonb not null default '[]'::jsonb,
  collocations_json jsonb not null default '[]'::jsonb,
  confusable_words_json jsonb not null default '[]'::jsonb,
  root_affix_analysis_json jsonb,
  sources_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.examples (
  id uuid primary key default uuid_generate_v4(),
  word_id uuid not null references public.words(id) on delete cascade,
  sentence text not null,
  translation_cn text not null,
  style text not null,
  difficulty text not null default 'medium',
  source text not null default 'ai',
  created_at timestamptz not null default now()
);

create table if not exists public.study_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  mastery_score integer not null default 0,
  recognition_score integer not null default 0,
  recall_score integer not null default 0,
  spelling_score integer not null default 0,
  usage_score integer not null default 0,
  level integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, word_id)
);

create table if not exists public.practice_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  session_type text not null,
  target_words_json jsonb not null default '[]'::jsonb,
  score integer,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.practice_answers (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references public.practice_sessions(id) on delete cascade,
  word_id uuid references public.words(id) on delete set null,
  question_type text not null,
  user_answer text,
  correct_answer text,
  is_correct boolean not null default false,
  used_hint boolean not null default false,
  error_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_errors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  word_id uuid references public.words(id) on delete cascade,
  error_type text not null,
  original_answer text,
  correction text,
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  task_type text not null,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  estimated_input_tokens integer not null default 0,
  estimated_output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.study_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  total_words integer not null,
  target_days integer not null,
  daily_minutes integer not null,
  mode text not null,
  plan_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
