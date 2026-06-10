---
name: KUDASAI Communities + Creator Ecosystem
description: Details on communities, voice notes, reputation, streaks, creator mode, pin posts — DB migration approach and integration points
---

## DB migration approach
`executeSql` in code_execution runs against Replit's LOCAL PostgreSQL, NOT Supabase. Always write migration SQL to `supabase-migration.sql` and instruct user to run in Supabase Dashboard → SQL Editor.

## New DB tables/columns (in supabase-migration.sql)
- `communities`: id, name, slug, description, category, banner_url, avatar_url, rules, created_by, member_count, created_at
- `community_members`: community_id, user_id, role, joined_at (PK: community_id+user_id)
- `posts.community_id` (uuid, nullable FK → communities)
- `posts.is_pinned` (bool default false)
- `profiles.reputation` (int), `profiles.level` (int), `profiles.streak_days` (int), `profiles.last_streak_date` (date), `profiles.is_creator` (bool), `profiles.pinned_post_id` (uuid)

## Key functions added (all in script.js append)
- `goCommunities()` — community discovery page with category filter chips
- `goComm(commId)` — community detail with feed, rules, join/post buttons
- `loadCommunityFeed(commId)` — posts filtered by community_id
- `toggleCommJoin(commId, btn)` — join/leave community, updates state.joinedCommSet
- `openCreateCommModal()` / `saveNewCommunity()` — create community flow
- `openCommComposer(commId)` — sets state.pendingCommId, submitPost picks it up
- `toggleVoiceRecord(otherId)` / `startVoiceRecord()` / `stopVoiceRecord()` / `_uploadVoice()` — voice notes in DMs; uploads to storage bucket 'images', content stored as `[voice]URL`
- `renderDMContent()` — patched to render `[voice]URL` as `<audio>` player
- `getLevelInfo(rep)` / `renderLevelBadge(rep)` — level badge from reputation XP
- `awardXP(amount)` — awards reputation to current user
- `triggerConfetti()` — canvas confetti animation on level-up/milestones
- `checkDailyStreak()` — called in start(), compares last_streak_date vs today
- `becomeCreator()` — sets is_creator flag on profile
- `pinPost(postId)` / `unpinPost()` — sets/clears pinned_post_id on profile

## Integration points patched
- `postCard`: hot-badge (likes≥10), community tag (comm-tag), pin button for own posts
- `openDM`: voice button (🎙) added to dm-input-row
- `start()`: calls checkDailyStreak() and loadJoinedCommSet() after loadFollowersSet()
- `submitPost`: attaches state.pendingCommId as community_id on insert
- `goProfile()`: shows creator badge, level badge, streak bar, Go Creator button, XP in balance line
- `loadProfileTab("posts")`: shows pinned post first (pinned-post-wrap + pinned-label)
- `goExplore()`: appends `<div id="exploreComms">` + calls loadExploreComms()
- `index.html nav`: Communities nav item (nav-communities → goCommunities)

**Why:** Supabase is the only real DB; never use executeSql for Supabase schema changes.
