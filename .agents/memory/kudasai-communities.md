---
name: KUDASAI Communities + Creator Ecosystem + KAI AI OS
description: Communities, voice notes, reputation, streaks, creator mode, pin posts, Creator Studio, KAI AI engine — DB migration approach and integration points
---

## DB migration approach
`executeSql` in code_execution runs against Replit's LOCAL PostgreSQL, NOT Supabase. Always write migration SQL to `supabase-migration.sql` and instruct user to run in Supabase Dashboard → SQL Editor.

## New DB tables/columns (in supabase-migration.sql)
- `communities`: id, name, slug, description, category, banner_url, avatar_url, rules, created_by, member_count, created_at
- `community_members`: community_id, user_id, role, joined_at (PK: community_id+user_id)
- `posts.community_id` (uuid, nullable FK → communities), `posts.is_pinned` (bool)
- `profiles.reputation` (int), `profiles.level` (int), `profiles.streak_days` (int), `profiles.last_streak_date` (date), `profiles.is_creator` (bool), `profiles.pinned_post_id` (uuid)

## Key functions (all appended to script.js)
### Communities
- `goCommunities()` — discovery page with category filter chips
- `goComm(commId)` — community detail with feed, rules, join/post
- `toggleCommJoin(commId, btn)` — join/leave, updates state.joinedCommSet
- `openCreateCommModal()` / `saveNewCommunity()` — create flow
- `openCommComposer(commId)` — sets state.pendingCommId, submitPost picks it up

### Voice Notes
- `toggleVoiceRecord(otherId)` / `startVoiceRecord()` / `stopVoiceRecord()` / `_uploadVoice()` — uploads to storage bucket 'images', content stored as `[voice]URL`
- `renderDMContent()` patched to render `[voice]URL` as `<audio>` player

### Reputation + Level
- `getLevelInfo(rep)` / `renderLevelBadge(rep)` — level badge from XP
- `awardXP(amount)` — awards reputation to current user
- `triggerConfetti()` — canvas confetti on level-up

### Streak
- `checkDailyStreak()` — called in start(), compares last_streak_date vs today

### Creator Mode + Pin
- `becomeCreator()` — sets is_creator flag
- `pinPost(postId)` / `unpinPost()` — pinned_post_id on profile

### Creator Studio Dashboard
- `creatorDashboard()` — full analytics: score, stats, activity chart, top posts, best time, hashtags, KAI tip

### KUDASAI AI OS (KAI object)
- `KAI.init()` — loads medium-term memory from localStorage
- `KAI.remember(key, value, tier)` / `KAI.recall(key, tier)` — 3-tier memory system
- `KAI.getTrends()` — 5-min cached trend detection from real DB data
- `KAI.getRecommendations()` — posts, users, communities based on activity
- `KAI.search(query)` — multi-entity search (posts, users, communities)
- `KAI.getCreatorInsights(userId)` — real analytics from DB
- `KAI.generateHashtags(topic)` — topic + trending tags
- `KAI.generateDraft(topic)` — 7 post draft starters
- `KAI.generateBio(profile)` — 3 bio suggestions
- `KAI.moderateText(text)` — spam/toxicity detection, returns {safe, score, flags}
- `KAI.handleQuery(query)` — NLP intent dispatcher, 10+ intents

### KAI UI
- `goKudasaiAI()` — 4-tab AI page: Chat | Trends | Discover | Insights
- `sendKaiMessage(preset?)` — send message, show typing, render response
- `renderKaiBubble(role, content, data, type)` — rich bubble renderer (posts, users, comms, drafts, hashtags, insights, help)
- `renderKaiTrends()` / `renderKaiDiscover()` / `renderKaiInsights()` — tab content
- `useDraft(text)` / `copyHashtag(tag)` / `copyBio(text)` — action helpers

## Integration points patched
- `postCard`: hot-badge (likes≥10), community tag (comm-tag), pin button for own posts
- `openDM`: voice button (🎙) added to dm-input-row
- `start()`: calls checkDailyStreak() and loadJoinedCommSet()
- `submitPost`: attaches state.pendingCommId as community_id on insert
- `goProfile()`: creator badge, level badge, streak bar, Studio/Go Creator button
- `loadProfileTab("posts")`: shows pinned post first
- `goExplore()`: injects exploreComms div + calls loadExploreComms()
- `index.html nav`: KAI nav item (nav-kai), Communities nav item, mobile KAI tab, floating KAI FAB button

**Why:** Supabase is the only real DB; never use executeSql for Supabase schema changes.
