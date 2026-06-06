create extension if not exists pgcrypto;

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  word text not null,
  normalized_word text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.words add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.words add column if not exists source text;
alter table public.words add column if not exists status text default 'new';
alter table public.words add column if not exists mastery_score integer default 0;
alter table public.words add column if not exists recognition_score integer default 0;
alter table public.words add column if not exists recall_score integer default 0;
alter table public.words add column if not exists spelling_score integer default 0;
alter table public.words add column if not exists usage_score integer default 0;
alter table public.words add column if not exists level integer default 0;
alter table public.words add column if not exists correct_count integer default 0;
alter table public.words add column if not exists review_count integer default 0;
alter table public.words add column if not exists wrong_count integer default 0;
alter table public.words add column if not exists error_history_json jsonb default '[]'::jsonb;
alter table public.words add column if not exists output_practice_count integer default 0;
alter table public.words add column if not exists last_output_practiced_at timestamp with time zone;
alter table public.words add column if not exists first_learned_at timestamp with time zone;
alter table public.words add column if not exists last_reviewed_at timestamp with time zone;
alter table public.words add column if not exists next_review_at timestamp with time zone;
alter table public.words add column if not exists created_at timestamp with time zone default now();
alter table public.words add column if not exists updated_at timestamp with time zone default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'words_user_normalized_unique'
  ) then
    alter table public.words
      add constraint words_user_normalized_unique unique(user_id, normalized_word);
  end if;
end $$;

create table if not exists public.word_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  word_id uuid references public.words(id) on delete cascade,
  normalized_word text,
  card_json jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.word_cards add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.word_cards add column if not exists word_id uuid references public.words(id) on delete cascade;
alter table public.word_cards add column if not exists normalized_word text;
alter table public.word_cards add column if not exists card_json jsonb;
alter table public.word_cards add column if not exists created_at timestamp with time zone default now();
alter table public.word_cards add column if not exists updated_at timestamp with time zone default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'word_cards_user_normalized_unique'
  ) then
    alter table public.word_cards
      add constraint word_cards_user_normalized_unique unique(user_id, normalized_word);
  end if;
end $$;

alter table public.words enable row level security;
alter table public.word_cards enable row level security;

drop policy if exists "Users can select own words" on public.words;
create policy "Users can select own words"
on public.words for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own words" on public.words;
create policy "Users can insert own words"
on public.words for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own words" on public.words;
create policy "Users can update own words"
on public.words for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own words" on public.words;
create policy "Users can delete own words"
on public.words for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own word cards" on public.word_cards;
create policy "Users can select own word cards"
on public.word_cards for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own word cards" on public.word_cards;
create policy "Users can insert own word cards"
on public.word_cards for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own word cards" on public.word_cards;
create policy "Users can update own word cards"
on public.word_cards for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own word cards" on public.word_cards;
create policy "Users can delete own word cards"
on public.word_cards for delete
using (auth.uid() = user_id);
