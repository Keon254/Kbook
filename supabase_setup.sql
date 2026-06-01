-- ============================================================
--  KUDASAI — Supabase Schema Setup (Full)
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  Safe to re-run: tables use IF NOT EXISTS, policies are
--  dropped and recreated so there are no duplicate errors.
-- ============================================================


-- ── 1. PROFILES ─────────────────────────────────────────────
create table if not exists public.profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text not null,
  balance   numeric default 0
);
alter table public.profiles enable row level security;

drop policy if exists "Anyone can read profiles"       on public.profiles;
drop policy if exists "Users can insert their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
create policy "Anyone can read profiles"       on public.profiles for select using (true);
create policy "Users can insert their profile" on public.profiles for insert with check (auth.uid()=user_id);
create policy "Users can update their profile" on public.profiles for update using (auth.uid()=user_id);


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

drop policy if exists "Anyone can read posts"                on public.posts;
drop policy if exists "Authenticated users can create posts" on public.posts;
drop policy if exists "Authenticated users can update posts" on public.posts;
drop policy if exists "Users can delete their own posts"     on public.posts;
create policy "Anyone can read posts"                on public.posts for select using (true);
create policy "Authenticated users can create posts" on public.posts for insert with check (auth.role()='authenticated');
create policy "Authenticated users can update posts" on public.posts for update using (auth.role()='authenticated');
create policy "Users can delete their own posts"     on public.posts for delete using (auth.uid()=user_id);


-- ── 3. LIKES ────────────────────────────────────────────────
create table if not exists public.likes (
  post_id  uuid references public.posts(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);
alter table public.likes enable row level security;

drop policy if exists "Anyone can read likes"        on public.likes;
drop policy if exists "Authenticated users can like" on public.likes;
drop policy if exists "Users can unlike"             on public.likes;
create policy "Anyone can read likes"        on public.likes for select using (true);
create policy "Authenticated users can like" on public.likes for insert with check (auth.uid()=user_id);
create policy "Users can unlike"             on public.likes for delete using (auth.uid()=user_id);


-- ── 4. COMMENTS ─────────────────────────────────────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);
alter table public.comments enable row level security;

drop policy if exists "Anyone can read comments"        on public.comments;
drop policy if exists "Authenticated users can comment" on public.comments;
drop policy if exists "Users can delete their comments" on public.comments;
create policy "Anyone can read comments"        on public.comments for select using (true);
create policy "Authenticated users can comment" on public.comments for insert with check (auth.role()='authenticated');
create policy "Users can delete their comments" on public.comments for delete using (auth.uid()=user_id);


-- ── 5. NOTIFICATIONS ─────────────────────────────────────────
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  from_user_id uuid references auth.users(id) on delete cascade,
  type         text not null,
  post_id      uuid references public.posts(id) on delete set null,
  read         boolean default false,
  created_at   timestamptz default now()
);
alter table public.notifications enable row level security;

drop policy if exists "Users can read their notifications"   on public.notifications;
drop policy if exists "Authenticated users can notify"       on public.notifications;
drop policy if exists "Users can update their notifications" on public.notifications;
create policy "Users can read their notifications"   on public.notifications for select using (auth.uid()=user_id);
create policy "Authenticated users can notify"       on public.notifications for insert with check (auth.role()='authenticated');
create policy "Users can update their notifications" on public.notifications for update using (auth.uid()=user_id);


-- ── 6. FOLLOWS ───────────────────────────────────────────────
create table if not exists public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid references auth.users(id) on delete cascade,
  following_id uuid references auth.users(id) on delete cascade,
  created_at   timestamptz default now(),
  unique (follower_id, following_id)
);
alter table public.follows enable row level security;

drop policy if exists "Anyone can read follows"        on public.follows;
drop policy if exists "Authenticated users can follow" on public.follows;
drop policy if exists "Users can unfollow"             on public.follows;
create policy "Anyone can read follows"        on public.follows for select using (true);
create policy "Authenticated users can follow" on public.follows for insert with check (auth.uid()=follower_id);
create policy "Users can unfollow"             on public.follows for delete using (auth.uid()=follower_id);


-- ── 7. REPOSTS ───────────────────────────────────────────────
create table if not exists public.reposts (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);
alter table public.reposts enable row level security;

drop policy if exists "Anyone can read reposts"        on public.reposts;
drop policy if exists "Authenticated users can repost" on public.reposts;
drop policy if exists "Users can un-repost"            on public.reposts;
create policy "Anyone can read reposts"        on public.reposts for select using (true);
create policy "Authenticated users can repost" on public.reposts for insert with check (auth.uid()=user_id);
create policy "Users can un-repost"            on public.reposts for delete using (auth.uid()=user_id);


-- ── 8. BOOKMARKS ─────────────────────────────────────────────
create table if not exists public.bookmarks (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.posts(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);
alter table public.bookmarks enable row level security;

drop policy if exists "Users can read their bookmarks"   on public.bookmarks;
drop policy if exists "Authenticated users can bookmark" on public.bookmarks;
drop policy if exists "Users can remove bookmarks"       on public.bookmarks;
create policy "Users can read their bookmarks"   on public.bookmarks for select using (auth.uid()=user_id);
create policy "Authenticated users can bookmark" on public.bookmarks for insert with check (auth.uid()=user_id);
create policy "Users can remove bookmarks"       on public.bookmarks for delete using (auth.uid()=user_id);


-- ── 9. MESSAGES (Direct Messages) ────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid references auth.users(id) on delete cascade,
  receiver_id uuid references auth.users(id) on delete cascade,
  content     text not null,
  read        boolean default false,
  created_at  timestamptz default now()
);
alter table public.messages enable row level security;

drop policy if exists "Users can read their messages"         on public.messages;
drop policy if exists "Authenticated users can send messages" on public.messages;
drop policy if exists "Recipients can mark messages read"     on public.messages;
create policy "Users can read their messages"
  on public.messages for select
  using (auth.uid()=sender_id or auth.uid()=receiver_id);
create policy "Authenticated users can send messages"
  on public.messages for insert
  with check (auth.uid()=sender_id);
create policy "Recipients can mark messages read"
  on public.messages for update
  using (auth.uid()=receiver_id);


-- ── 10. REALTIME ──────────────────────────────────────────────
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.messages;


-- ── 11. STORAGE BUCKETS ───────────────────────────────────────
insert into storage.buckets (id, name, public) values ('images','images',true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('videos','videos',true) on conflict (id) do nothing;

drop policy if exists "Auth users upload images" on storage.objects;
drop policy if exists "Anyone reads images"      on storage.objects;
drop policy if exists "Auth users upload videos" on storage.objects;
drop policy if exists "Anyone reads videos"      on storage.objects;
create policy "Auth users upload images" on storage.objects for insert with check (bucket_id='images' and auth.role()='authenticated');
create policy "Anyone reads images"      on storage.objects for select using (bucket_id='images');
create policy "Auth users upload videos" on storage.objects for insert with check (bucket_id='videos' and auth.role()='authenticated');
create policy "Anyone reads videos"      on storage.objects for select using (bucket_id='videos');
