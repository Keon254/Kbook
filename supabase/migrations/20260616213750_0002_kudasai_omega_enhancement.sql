-- ═════════════════════════════════════════════════════════════════════
-- KUDASAI OMEGA — Enhance profiles and add new systems
-- ═════════════════════════════════════════════════════════════════════

-- ── 1. ENHANCE PROFILES ─────────────────────────────────────────────
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS xp integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reputation integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_status text DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── 2. ENHANCE POSTS ────────────────────────────────────────────────
ALTER TABLE public.posts 
  ADD COLUMN IF NOT EXISTS post_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS saves_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS world_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── 3. CREATE WORLDS (evolved communities) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.worlds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  description     text DEFAULT '',
  icon            text DEFAULT '🌐',
  banner_url      text,
  category        text DEFAULT 'general',
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  member_count    integer DEFAULT 0,
  post_count      integer DEFAULT 0,
  is_featured     boolean DEFAULT false,
  is_private      boolean DEFAULT false,
  rules           text[],
  settings        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "worlds_select" ON public.worlds FOR SELECT USING (true);
CREATE POLICY "worlds_insert" ON public.worlds FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "worlds_update" ON public.worlds FOR UPDATE USING (auth.uid() = created_by);

-- ── 4. WORLD MEMBERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text DEFAULT 'member',
  joined_at       timestamptz DEFAULT now(),
  UNIQUE (world_id, user_id)
);
ALTER TABLE public.world_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wm_select" ON public.world_members FOR SELECT USING (true);
CREATE POLICY "wm_insert" ON public.world_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wm_delete" ON public.world_members FOR DELETE USING (auth.uid() = user_id);

-- ── 5. FRIENDS (extended connections) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.friends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text DEFAULT 'pending',
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, friend_id)
);
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friends_sel" ON public.friends FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "friends_ins" ON public.friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "friends_upd" ON public.friends FOR UPDATE USING (auth.uid() = friend_id);

-- ── 6. ACHIEVEMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  title           text NOT NULL,
  description     text,
  icon            text DEFAULT '🏆',
  xp_reward       integer DEFAULT 0,
  category        text DEFAULT 'general',
  requirement     jsonb DEFAULT '{}',
  rarity          text DEFAULT 'common',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ach_select" ON public.achievements FOR SELECT USING (true);

-- ── 7. USER ACHIEVEMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id  uuid REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at       timestamptz DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ua_select" ON public.user_achievements FOR SELECT USING (true);
CREATE POLICY "ua_insert" ON public.user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 8. QUESTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  icon            text DEFAULT '📋',
  xp_reward       integer DEFAULT 0,
  quest_type      text DEFAULT 'daily',
  requirement     jsonb DEFAULT '{}',
  world_id        uuid REFERENCES public.worlds(id) ON DELETE SET NULL,
  is_active       boolean DEFAULT true,
  starts_at       timestamptz DEFAULT now(),
  ends_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quests_select" ON public.quests FOR SELECT USING (true);

-- ── 9. USER QUESTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_quests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id        uuid REFERENCES public.quests(id) ON DELETE CASCADE,
  progress        integer DEFAULT 0,
  completed       boolean DEFAULT false,
  claimed         boolean DEFAULT false,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  UNIQUE (user_id, quest_id)
);
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uq_select" ON public.user_quests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "uq_insert" ON public.user_quests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uq_update" ON public.user_quests FOR UPDATE USING (auth.uid() = user_id);

-- ── 10. EVENTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  image_url       text,
  event_type      text DEFAULT 'general',
  world_id        uuid REFERENCES public.worlds(id) ON DELETE SET NULL,
  host_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  location        text,
  is_virtual      boolean DEFAULT true,
  join_url        text,
  capacity        integer,
  registered_count integer DEFAULT 0,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  visibility      text DEFAULT 'public',
  settings        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select" ON public.events FOR SELECT USING (true);
CREATE POLICY "events_insert" ON public.events FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 11. EVENT REGISTRATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid REFERENCES public.events(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at   timestamptz DEFAULT now(),
  attended        boolean DEFAULT false,
  UNIQUE (event_id, user_id)
);
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "er_select" ON public.event_registrations FOR SELECT USING (true);
CREATE POLICY "er_insert" ON public.event_registrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "er_delete" ON public.event_registrations FOR DELETE USING (auth.uid() = user_id);

-- ── 12. KNOWLEDGE ARTICLES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  slug            text UNIQUE NOT NULL,
  content         text NOT NULL,
  summary         text,
  cover_image     text,
  author_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  world_id        uuid REFERENCES public.worlds(id) ON DELETE SET NULL,
  category        text DEFAULT 'article',
  tags            text[] DEFAULT '{}',
  views_count     integer DEFAULT 0,
  saves_count     integer DEFAULT 0,
  likes_count     integer DEFAULT 0,
  is_published    boolean DEFAULT true,
  published_at    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ka_select" ON public.knowledge_articles FOR SELECT USING (is_published = true);
CREATE POLICY "ka_insert" ON public.knowledge_articles FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "ka_update" ON public.knowledge_articles FOR UPDATE USING (auth.uid() = author_id);

-- ── 13. CREATOR PROFILES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  creator_level   integer DEFAULT 1,
  creator_tier    text DEFAULT 'bronze',
  total_followers integer DEFAULT 0,
  total_views     integer DEFAULT 0,
  total_engagement integer DEFAULT 0,
  revenue_total   numeric DEFAULT 0,
  is_verified     boolean DEFAULT false,
  specialties     text[] DEFAULT '{}',
  social_links    jsonb DEFAULT '{}',
  insights        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_select" ON public.creator_profiles FOR SELECT USING (true);
CREATE POLICY "cp_insert" ON public.creator_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cp_update" ON public.creator_profiles FOR UPDATE USING (auth.uid() = user_id);

-- ── 14. CREATOR ANALYTICS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  date            date NOT NULL,
  followers_gained integer DEFAULT 0,
  followers_lost   integer DEFAULT 0,
  views            integer DEFAULT 0,
  likes            integer DEFAULT 0,
  comments         integer DEFAULT 0,
  shares           integer DEFAULT 0,
  saves            integer DEFAULT 0,
  revenue          numeric DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (creator_id, date)
);
ALTER TABLE public.creator_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ca_select" ON public.creator_analytics FOR SELECT USING (true);

-- ── 15. USER MEMORY ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_memory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type     text NOT NULL,
  key             text NOT NULL,
  value           jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, memory_type, key)
);
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "um_select" ON public.user_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "um_insert" ON public.user_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "um_update" ON public.user_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "um_delete" ON public.user_memory FOR DELETE USING (auth.uid() = user_id);

-- ── 16. USER PREFERENCES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme           text DEFAULT 'dark',
  language        text DEFAULT 'en',
  notifications   jsonb DEFAULT '{"push":true,"email":true,"world":true}',
  privacy         jsonb DEFAULT '{"profile":"public","activity":"friends","messages":"everyone"}',
  display         jsonb DEFAULT '{"compact_mode":false,"show_xp":true,"animations":true}',
  accessibility   jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "up_select" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "up_insert" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "up_update" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- ── 17. SEARCH HISTORY ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  query           text NOT NULL,
  search_type     text DEFAULT 'all',
  results_count   integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sh_select" ON public.search_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sh_insert" ON public.search_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sh_delete" ON public.search_history FOR DELETE USING (auth.uid() = user_id);

-- ── 18. SAVED POSTS (Collections) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id         uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  collection_name text DEFAULT 'default',
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, post_id)
);
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_select" ON public.saved_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sp_insert" ON public.saved_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sp_delete" ON public.saved_posts FOR DELETE USING (auth.uid() = user_id);

-- ── 19. CONVERSATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text DEFAULT 'direct',
  world_id        uuid REFERENCES public.worlds(id) ON DELETE CASCADE,
  name            text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ── 20. CONVERSATION MEMBERS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  joined_at       timestamptz DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
ALTER TABLE public.conversation_members ENABLE ROW LEVEL Security;
CREATE POLICY "cm_select" ON public.conversation_members FOR SELECT USING (true);
CREATE POLICY "cm_insert" ON public.conversation_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update conversations policy after members table exists
CREATE POLICY "conv_select" ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = id AND user_id = auth.uid())
);
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 21. ENHANCED MESSAGES TABLE ───────────────────────────────────
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS read_by uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── 22. REPORTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_type   text NOT NULL,
  reported_id     uuid,
  reason          text NOT NULL,
  description     text,
  status          text DEFAULT 'pending',
  reviewed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    timestamptz,
  action_taken   text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_select" ON public.reports FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ═════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS profiles_xp_idx ON public.profiles(xp DESC);
CREATE INDEX IF NOT EXISTS profiles_level_idx ON public.profiles(level DESC);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);

CREATE INDEX IF NOT EXISTS posts_world_idx ON public.posts(world_id);
CREATE INDEX IF NOT EXISTS posts_created_idx ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS posts_likes_idx ON public.posts(likes_count DESC);

CREATE INDEX IF NOT EXISTS worlds_slug_idx ON public.worlds(slug);
CREATE INDEX IF NOT EXISTS worlds_category_idx ON public.worlds(category);
CREATE INDEX IF NOT EXISTS worlds_members_idx ON public.worlds(member_count DESC);

CREATE INDEX IF NOT EXISTS events_starts_idx ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS events_type_idx ON public.events(event_type);

CREATE INDEX IF NOT EXISTS knowledge_slug_idx ON public.knowledge_articles(slug);
CREATE INDEX IF NOT EXISTS knowledge_views_idx ON public.knowledge_articles(views_count DESC);

CREATE INDEX IF NOT EXISTS messages_convo_idx ON public.messages(conversation_id);

CREATE INDEX IF NOT EXISTS ach_name_idx ON public.achievements(name);
CREATE INDEX IF NOT EXISTS uq_user_idx ON public.user_quests(user_id);

-- ═════════════════════════════════════════════════════════════════════
-- INSERT DEFAULT DATA
-- ═════════════════════════════════════════════════════════════════════

-- Default achievements
INSERT INTO public.achievements (name, title, description, icon, xp_reward, category, rarity) VALUES
  ('first_post', 'First Post', 'Created your first post', '✍️', 50, 'social', 'common'),
  ('first_friend', 'First Connection', 'Made your first friend', '🤝', 50, 'social', 'common'),
  ('first_world', 'World Traveler', 'Joined your first World', '🌐', 100, 'explorer', 'common'),
  ('first_event', 'Event Attendee', 'Attended your first event', '📅', 75, 'social', 'common'),
  ('creator_rank_1', 'Rising Creator', 'Reached 100 followers', '⭐', 200, 'creator', 'rare'),
  ('creator_rank_2', 'Established Creator', 'Reached 500 followers', '🌟', 500, 'creator', 'epic'),
  ('creator_rank_3', 'Star Creator', 'Reached 1000 followers', '💫', 1000, 'creator', 'legendary'),
  ('explorer_10', 'Curious Mind', 'Visited 10 different Worlds', '🔭', 150, 'explorer', 'rare'),
  ('knowledge_seeker', 'Knowledge Seeker', 'Read 10 knowledge articles', '📚', 100, 'explorer', 'common'),
  ('community_builder', 'Community Builder', 'Created your own World', '🏗️', 300, 'builder', 'rare')
ON CONFLICT (name) DO NOTHING;

-- Default worlds
INSERT INTO public.worlds (name, slug, description, icon, category, is_featured) VALUES
  ('Anime World', 'anime', 'Discuss anime, manga, and Japanese culture. Connect with fellow otaku.', '🎌', 'anime', true),
  ('Gaming World', 'gaming', 'Everything gaming - from indie gems to AAA titles. Find your squad.', '🎮', 'gaming', true),
  ('Technology World', 'tech', 'Tech news, programming, AI, and the future of technology.', '💻', 'tech', true),
  ('Music World', 'music', 'Share music, discover artists, discuss genres from around the world.', '🎵', 'music', true),
  ('Knowledge World', 'knowledge', 'Articles, tutorials, research, and intellectual discussions.', '📖', 'knowledge', true),
  ('Art World', 'art', 'Showcase your art, get feedback, and discover amazing creators.', '🎨', 'art', true),
  ('Business World', 'business', 'Entrepreneurship, startups, career growth, and professional networking.', '💼', 'business', true),
  ('Sci-Fi & Fantasy', 'scifi', 'Movies, books, and discussions about the fantastic and futuristic.', '🚀', 'scifi', true)
ON CONFLICT (slug) DO NOTHING;

-- Default quests (daily, weekly)
INSERT INTO public.quests (title, description, icon, xp_reward, quest_type, requirement) VALUES
  ('Daily Poster', 'Make a post today', '✍️', 20, 'daily', '{"type":"post","count":1}'),
  ('Daily Engager', 'Like or comment on 5 posts', '💬', 30, 'daily', '{"type":"interact","count":5}'),
  ('Daily Explorer', 'Visit 3 different Worlds', '🔍', 15, 'daily', '{"type":"world_visit","count":3}'),
  ('Weekly Creator', 'Create 7 posts this week', '📝', 100, 'weekly', '{"type":"post","count":7}'),
  ('Weekly Social', 'Make 3 new connections', '🤝', 150, 'weekly', '{"type":"follow","count":3}'),
  ('Weekly Knowledge', 'Read 5 knowledge articles', '📚', 75, 'weekly', '{"type":"read","count":5}')
ON CONFLICT DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════
-- REALTIME PUBLICATIONS
-- ═════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.worlds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;