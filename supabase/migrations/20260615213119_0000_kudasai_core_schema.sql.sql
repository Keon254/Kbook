-- ═══════════════════════════════════════════════════════════════
-- KUDASAI — Complete Database Schema (Production Ready)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. PROFILES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      text NOT NULL,
  bio           text DEFAULT '',
  avatar_url    text,
  banner_url    text,
  balance       numeric DEFAULT 0,
  verified      boolean DEFAULT false,
  status_message text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their profile" ON public.profiles;
CREATE POLICY "Anyone can read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- ── 2. POSTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content       text,
  image_url     text,
  video_url     text,
  audio_url     text,
  likes_count   integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  reposts_count integer DEFAULT 0,
  poll_options  jsonb,
  poll_ends_at  timestamptz,
  thread_id     uuid,
  thread_order  integer DEFAULT 0,
  reactions     jsonb DEFAULT '{}',
  community_id  uuid,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read posts" ON public.posts;
DROP POLICY IF EXISTS "Auth users create posts" ON public.posts;
DROP POLICY IF EXISTS "Users delete own posts" ON public.posts;
CREATE POLICY "Anyone can read posts" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Auth users create posts" ON public.posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- ── 3. LIKES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read likes" ON public.likes;
DROP POLICY IF EXISTS "Auth users like" ON public.likes;
DROP POLICY IF EXISTS "Users unlike" ON public.likes;
CREATE POLICY "Anyone read likes" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Auth users like" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unlike" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- ── 4. COMMENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read comments" ON public.comments;
DROP POLICY IF EXISTS "Auth users comment" ON public.comments;
DROP POLICY IF EXISTS "Users delete comments" ON public.comments;
CREATE POLICY "Anyone read comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Auth users comment" ON public.comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users delete comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- ── 5. NOTIFICATIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type         text NOT NULL,
  post_id      uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their notifs" ON public.notifications;
DROP POLICY IF EXISTS "Auth create notifs" ON public.notifications;
DROP POLICY IF EXISTS "Users update notifs" ON public.notifications;
CREATE POLICY "Users read their notifs" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Auth create notifs" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users update notifs" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ── 6. FOLLOWS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (follower_id, following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read follows" ON public.follows;
DROP POLICY IF EXISTS "Auth users follow" ON public.follows;
DROP POLICY IF EXISTS "Users unfollow" ON public.follows;
CREATE POLICY "Anyone read follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Auth users follow" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users unfollow" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- ── 7. REPOSTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reposts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read reposts" ON public.reposts;
DROP POLICY IF EXISTS "Auth users repost" ON public.reposts;
DROP POLICY IF EXISTS "Users un repost" ON public.reposts;
CREATE POLICY "Anyone read reposts" ON public.reposts FOR SELECT USING (true);
CREATE POLICY "Auth users repost" ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users un repost" ON public.reposts FOR DELETE USING (auth.uid() = user_id);

-- ── 8. BOOKMARKS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Auth users bookmark" ON public.bookmarks;
DROP POLICY IF EXISTS "Users remove bookmarks" ON public.bookmarks;
CREATE POLICY "Users read bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Auth users bookmark" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove bookmarks" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- ── 9. MESSAGES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  read        boolean DEFAULT false,
  reply_to_id uuid,
  reactions   jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read messages" ON public.messages;
DROP POLICY IF EXISTS "Auth send messages" ON public.messages;
DROP POLICY IF EXISTS "Users delete messages" ON public.messages;
CREATE POLICY "Users read messages" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Auth send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users delete messages" ON public.messages FOR DELETE USING (auth.uid() = sender_id);

-- ── 10. STORIES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url  text NOT NULL,
  caption    text,
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone view stories" ON public.stories;
DROP POLICY IF EXISTS "Users create stories" ON public.stories;
DROP POLICY IF EXISTS "Users delete stories" ON public.stories;
CREATE POLICY "Anyone view stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "Users create stories" ON public.stories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete stories" ON public.stories FOR DELETE USING (auth.uid() = user_id);

-- ── 11. COMMUNITIES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text DEFAULT '',
  icon         text DEFAULT '🏘',
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  member_count integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read communities" ON public.communities;
DROP POLICY IF EXISTS "Auth create communities" ON public.communities;
CREATE POLICY "Anyone read communities" ON public.communities FOR SELECT USING (true);
CREATE POLICY "Auth create communities" ON public.communities FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 12. COMMUNITY MEMBERS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text DEFAULT 'member',
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (community_id, user_id)
);
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read members" ON public.community_members;
DROP POLICY IF EXISTS "Auth join communities" ON public.community_members;
DROP POLICY IF EXISTS "Users leave communities" ON public.community_members;
CREATE POLICY "Anyone read members" ON public.community_members FOR SELECT USING (true);
CREATE POLICY "Auth join communities" ON public.community_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users leave communities" ON public.community_members FOR DELETE USING (auth.uid() = user_id);

-- ── 13. JOBS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  company     text NOT NULL,
  location    text DEFAULT 'Remote',
  type        text DEFAULT 'Full-time',
  description text NOT NULL,
  apply_url   text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read jobs" ON public.jobs;
DROP POLICY IF EXISTS "Auth post jobs" ON public.jobs;
CREATE POLICY "Anyone read jobs" ON public.jobs FOR SELECT USING (true);
CREATE POLICY "Auth post jobs" ON public.jobs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 14. POLL VOTES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poll_votes (
  post_id      uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read poll votes" ON public.poll_votes;
DROP POLICY IF EXISTS "Auth users vote" ON public.poll_votes;
CREATE POLICY "Anyone read poll votes" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Auth users vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS posts_user_idx ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS posts_created_idx ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_likes_idx ON public.posts(likes_count DESC);

CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON public.messages(receiver_id);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows(following_id);

CREATE INDEX IF NOT EXISTS likes_post_idx ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS likes_user_idx ON public.likes(user_id);

CREATE INDEX IF NOT EXISTS notifs_user_idx ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS communities_created_idx ON public.communities(created_at DESC);
CREATE INDEX IF NOT EXISTS community_members_user_idx ON public.community_members(user_id);
CREATE INDEX IF NOT EXISTS jobs_created_idx ON public.jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS stories_created_idx ON public.stories(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- REALTIME PUBLICATIONS
-- ═══════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.communities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;