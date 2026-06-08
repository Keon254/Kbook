-- ============================================================
--  KUDASAI — Supabase Schema Setup (Full)
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  Safe to re-run (uses IF NOT EXISTS + DROP POLICY IF EXISTS).
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

-- Extra profile columns
alter table public.profiles add column if not exists bio            text    default '';
alter table public.profiles add column if not exists avatar_url    text;
alter table public.profiles add column if not exists banner_url    text;
alter table public.profiles add column if not exists verified      boolean default false;
alter table public.profiles add column if not exists status_message text;


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

-- Extra post columns (quote-repost)
alter table public.posts add column if not exists quoted_post_id  uuid;
alter table public.posts add column if not exists quoted_content  text;
alter table public.posts add column if not exists quoted_username text;

-- Extra post columns (polls)
alter table public.posts add column if not exists poll_options  text;
alter table public.posts add column if not exists poll_votes    text default '{}';
alter table public.posts add column if not exists poll_ends_at  timestamptz;

-- Extra post columns (threads)
alter table public.posts add column if not exists thread_id     uuid;
alter table public.posts add column if not exists thread_order  integer default 0;

-- Extra post columns (audio)
alter table public.posts add column if not exists audio_url     text;

-- Extra post columns (reactions)
alter table public.posts add column if not exists reactions     jsonb default '{}';

-- Index for thread fetching
create index if not exists posts_thread_idx on public.posts(thread_id);

-- ── POLL VOTES TABLE ─────────────────────────────────────────
create table if not exists public.poll_votes (
  post_id      uuid references public.posts(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  option_index integer not null,
  created_at   timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.poll_votes enable row level security;

drop policy if exists "Anyone can read poll votes"        on public.poll_votes;
drop policy if exists "Authenticated users can vote"      on public.poll_votes;
create policy "Anyone can read poll votes"   on public.poll_votes for select using (true);
create policy "Authenticated users can vote" on public.poll_votes for insert with check (auth.uid()=user_id);


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
drop table if exists public.follows cascade;
create table public.follows (
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
drop table if exists public.reposts cascade;
create table public.reposts (
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
drop table if exists public.bookmarks cascade;
create table public.bookmarks (
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
drop table if exists public.messages cascade;
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid references auth.users(id) on delete cascade,
  receiver_id uuid references auth.users(id) on delete cascade,
  content     text not null,
  read        boolean default false,
  reply_to_id uuid,  -- self-reference added below
  reactions   jsonb default '{}',
  created_at  timestamptz default now()
);

-- Self-referential FK for reply threads
alter table public.messages
  add constraint messages_reply_to_fk
  foreign key (reply_to_id) references public.messages(id) on delete set null
  not valid;  -- "not valid" skips locking existing rows

alter table public.messages enable row level security;

-- SELECT: both parties can read
drop policy if exists "Users can read their messages"         on public.messages;
create policy "Users can read their messages"
  on public.messages for select
  using (auth.uid()=sender_id or auth.uid()=receiver_id);

-- INSERT: only sender can create
drop policy if exists "Authenticated users can send messages" on public.messages;
create policy "Authenticated users can send messages"
  on public.messages for insert
  with check (auth.uid()=sender_id);

-- UPDATE: both parties can update (read receipts + reactions)
drop policy if exists "Recipients can mark messages read"    on public.messages;
drop policy if exists "Senders can update their messages"    on public.messages;
create policy "Parties can update messages"
  on public.messages for update
  using (auth.uid()=sender_id or auth.uid()=receiver_id);

-- ⚠ FIX: DELETE was missing — deleteDMMessage was silently failing
drop policy if exists "Senders can delete their messages"    on public.messages;
create policy "Senders can delete their messages"
  on public.messages for delete
  using (auth.uid()=sender_id);


-- ── 10. STORIES ───────────────────────────────────────────────
create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  image_url  text not null,
  caption    text,
  created_at timestamptz default now()
);
alter table public.stories enable row level security;

drop policy if exists "Anyone can view stories"  on public.stories;
drop policy if exists "Users can create stories" on public.stories;
drop policy if exists "Users can delete stories" on public.stories;
create policy "Anyone can view stories"  on public.stories for select using (true);
create policy "Users can create stories" on public.stories for insert with check (auth.uid()=user_id);
create policy "Users can delete stories" on public.stories for delete using (auth.uid()=user_id);


-- ── 11. STORY VIEWS ───────────────────────────────────────────
-- Tracks who has viewed each story (for viewers list + seen rings)
create table if not exists public.story_views (
  story_id   uuid references public.stories(id) on delete cascade,
  viewer_id  uuid references auth.users(id) on delete cascade,
  viewed_at  timestamptz default now(),
  primary key (story_id, viewer_id)
);
alter table public.story_views enable row level security;

drop policy if exists "Anyone can read story views"   on public.story_views;
drop policy if exists "Users can record story views"  on public.story_views;
create policy "Anyone can read story views"   on public.story_views for select using (true);
create policy "Users can record story views"  on public.story_views for insert
  with check (auth.uid()=viewer_id);


-- ── 12. MUTES ─────────────────────────────────────────────────
create table if not exists public.mutes (
  user_id  uuid references auth.users(id) on delete cascade,
  muted_id uuid references auth.users(id) on delete cascade,
  primary key (user_id, muted_id)
);
alter table public.mutes enable row level security;
drop policy if exists "Users manage their mutes" on public.mutes;
create policy "Users manage their mutes" on public.mutes for all using (auth.uid()=user_id);


-- ── 13. BLOCKS ────────────────────────────────────────────────
create table if not exists public.blocks (
  user_id    uuid references auth.users(id) on delete cascade,
  blocked_id uuid references auth.users(id) on delete cascade,
  primary key (user_id, blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists "Users manage their blocks" on public.blocks;
create policy "Users manage their blocks" on public.blocks for all using (auth.uid()=user_id);


-- ── 14. PERFORMANCE INDEXES ───────────────────────────────────
-- Posts
create index if not exists posts_user_idx        on public.posts(user_id);
create index if not exists posts_likes_idx        on public.posts(likes desc);
create index if not exists posts_created_idx      on public.posts(created_at desc);

-- Messages
create index if not exists messages_sender_idx    on public.messages(sender_id);
create index if not exists messages_receiver_idx  on public.messages(receiver_id);
create index if not exists messages_reply_idx     on public.messages(reply_to_id);
create index if not exists messages_convo_idx     on public.messages(sender_id, receiver_id, created_at desc);

-- Notifications
create index if not exists notifs_user_read_idx   on public.notifications(user_id, read);
create index if not exists notifs_created_idx     on public.notifications(created_at desc);

-- Follows (fast follower/following counts)
create index if not exists follows_follower_idx   on public.follows(follower_id);
create index if not exists follows_following_idx  on public.follows(following_id);

-- Stories
create index if not exists stories_user_idx       on public.stories(user_id);
create index if not exists stories_created_idx    on public.stories(created_at desc);

-- Story views
create index if not exists story_views_story_idx  on public.story_views(story_id);
create index if not exists story_views_viewer_idx on public.story_views(viewer_id);

-- Likes
create index if not exists likes_post_idx         on public.likes(post_id);
create index if not exists likes_user_idx         on public.likes(user_id);


-- ── 15. REALTIME PUBLICATIONS ────────────────────────────────
-- Core social tables
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.stories;

-- ⚠ FIX: follows/likes/profiles/comments were missing from realtime.
-- This enables live follower counts, live like counts, and live comment feeds.
alter publication supabase_realtime add table public.follows;
alter publication supabase_realtime add table public.likes;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.story_views;


-- ── 16. STORAGE BUCKETS ───────────────────────────────────────
insert into storage.buckets (id, name, public) values ('images','images',true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('videos','videos',true)
  on conflict (id) do nothing;

drop policy if exists "Auth users upload images" on storage.objects;
drop policy if exists "Anyone reads images"      on storage.objects;
drop policy if exists "Auth users upload videos" on storage.objects;
drop policy if exists "Anyone reads videos"      on storage.objects;
drop policy if exists "Users can delete images"  on storage.objects;

create policy "Auth users upload images" on storage.objects
  for insert with check (bucket_id='images' and auth.role()='authenticated');
create policy "Anyone reads images"      on storage.objects
  for select using (bucket_id='images');
create policy "Users can delete images"  on storage.objects
  for delete using (bucket_id='images' and auth.role()='authenticated');
create policy "Auth users upload videos" on storage.objects
  for insert with check (bucket_id='videos' and auth.role()='authenticated');
create policy "Anyone reads videos"      on storage.objects
  for select using (bucket_id='videos');
