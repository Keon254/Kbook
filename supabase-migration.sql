-- ═══════════════════════════════════════════════════════
-- KUDASAI COMMUNITIES + CREATOR ECOSYSTEM MIGRATION
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── Communities table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS communities (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  slug          text UNIQUE,
  description   text,
  category      text DEFAULT 'General',
  banner_url    text,
  avatar_url    text,
  rules         text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count  integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- ── Community members table ─────────────────────────────
CREATE TABLE IF NOT EXISTS community_members (
  community_id  uuid REFERENCES communities(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text DEFAULT 'member',
  joined_at     timestamptz DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

-- ── Extend posts table ──────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned    boolean DEFAULT false;

-- ── Extend profiles table ───────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reputation     integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level          integer DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_days    integer DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_streak_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_creator     boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pinned_post_id uuid;

-- ── RLS Policies ────────────────────────────────────────
ALTER TABLE communities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Allow all reads
CREATE POLICY IF NOT EXISTS "Public read communities"
  ON communities FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Auth users insert communities"
  ON communities FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY IF NOT EXISTS "Owner update community"
  ON communities FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY IF NOT EXISTS "Public read members"
  ON community_members FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "User manages own membership"
  ON community_members FOR ALL USING (auth.uid() = user_id);

-- ── Function: auto-update member_count ──────────────────
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comm_member_count ON community_members;
CREATE TRIGGER trg_comm_member_count
  AFTER INSERT OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION update_community_member_count();

-- ── Seed default communities ────────────────────────────
INSERT INTO communities (name, slug, description, category)
VALUES
  ('Anime',           'anime',      'All things anime, manga and light novels', 'Entertainment'),
  ('Gaming',          'gaming',     'Games, reviews, streams and memes',        'Entertainment'),
  ('Art & Design',    'art',        'Share your artwork and get inspired',       'Creative'),
  ('Technology',      'tech',       'Tech news, tools and dev culture',          'Technology'),
  ('KUDASAI Updates', 'kudasai',    'Official platform news and announcements',  'Official')
ON CONFLICT (slug) DO NOTHING;
