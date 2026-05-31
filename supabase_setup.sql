-- ============================================================
--  KUDASAI — Supabase Schema Setup
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- ── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text not null,
  balance   numeric default 0
);

alter table public.profiles enable row level security;

create policy "Anyone can read profiles"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id);


-- ── 2. POSTS ────────────────────────────────────────────────
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  content    text,
  image      text,
  video      text,
  likes      integer default 0,
  created_at timestamptz default now()
);

alter table public.posts enable row level security;

create policy "Anyone can read posts"
  on public.posts for select using (true);

create policy "Authenticated users can create posts"
  on public.posts for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update posts"
  on public.posts for update
  using (auth.role() = 'authenticated');


-- ── 3. LIKES ────────────────────────────────────────────────
create table if not exists public.likes (
  post_id  uuid references public.posts(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

alter table public.likes enable row level security;

create policy "Anyone can read likes"
  on public.likes for select using (true);

create policy "Authenticated users can like posts"
  on public.likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike their own likes"
  on public.likes for delete
  using (auth.uid() = user_id);


-- ── 4. REALTIME ─────────────────────────────────────────────
-- Enable realtime on the posts table so the live feed works
alter publication supabase_realtime add table public.posts;


-- ── 5. STORAGE BUCKETS ──────────────────────────────────────
-- Run these in the SQL editor (or create manually in Storage tab)

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload images"
  on storage.objects for insert
  with check (bucket_id = 'images' and auth.role() = 'authenticated');

create policy "Anyone can read images"
  on storage.objects for select
  using (bucket_id = 'images');

create policy "Authenticated users can upload videos"
  on storage.objects for insert
  with check (bucket_id = 'videos' and auth.role() = 'authenticated');

create policy "Anyone can read videos"
  on storage.objects for select
  using (bucket_id = 'videos');
