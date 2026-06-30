-- 사용자 프로필 — Supabase Auth(auth.users) 와 1:1. 자격(EligibilityForm) + 부가.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nickname     text,
  -- 자격 프로필 (EligibilityForm 그대로)
  age          text,
  married      text,
  married_years text,
  household    text,
  income       text,
  assets       text,
  house_owner  text,
  region       text,
  special_case text[] default '{}',
  -- 부가
  alerts       jsonb default '{}'::jsonb,
  updated_at   timestamptz default now()
);

alter table public.profiles enable row level security;

-- 본인 행만 읽기/생성/수정 (auth.uid() = id)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
