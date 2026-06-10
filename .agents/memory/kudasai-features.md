---
name: KUDASAI feature additions
description: Large set of features added to KUDASAI; key design decisions worth preserving
---

## Features added (appended to script.js end)
- **NetworkEngine** — online/offline detection, connection quality (Navigator.connection + ping), offline banner, retry queue, auto-reconnect to Supabase on reconnection
- **Settings** — `Settings.load/save/apply/init/get` backed by `localStorage('kudasai_settings')`. Classes applied to `document.body`: `data-saver`, `reduce-motion`, `perf-mode`
- **goSettings()** — full settings page replacing feed content; uses `Settings.load()` for toggle/select defaults
- **profileCompletion(profile)** — checks username/bio/avatar/banner/status; returns `{pct, missing[]}`
- **Profile hover cards** — `showHoverCard(event, userId)` + `removeHoverCard()`; triggered on `.username` `onmouseenter` in `postCard()`; 550ms delay to avoid flickering
- **Feed engagement scoring** — `scorePost(p)` + `applyFeedAlgorithm(posts)` — called in `loadFeedPage()` when `feedPage===0 && tab==='forYou'`; respects `Settings.get('feedAlgo')` (smart/recent/trending)
- **Followers set** — `loadFollowersSet()` populates `state._followersSet` (Set of follower IDs); called in `start()`
- **Mutual badge** — `state._followersSet.has(p.user_id)` check in `postCard()` adds `.mutual-badge`
- **DM search** — `_dmConvoAll` stores all convos; `filterDMConvos(q)` + `renderDMConvoList(convos)` provide search; `<div id="dmConvoList">` is the render target
- **Story reactions + reply** — `injectStoryExtras(story)` injects `.story-extras` div with reaction bar + reply input into `.story-viewer-box`; called at end of `renderStoryFrame()`
- **Achievements** — `loadAchievements(userId)` queries DB for stats, `renderAchievements(list)` returns HTML; injected into `#profileAchievements` div in `goProfile()`
- **Active Creators sidebar** — `loadSidebarTrendingCreators()` queries recent posts, groups by user, shows top 3 active; rendered into `#trendingCreators`

## Key integration points
- `start()` calls `NetworkEngine.init(); Settings.init(); loadFollowersSet();`
- `loadSidebar()` calls `loadSidebarTrendingCreators()`
- Palette now includes Settings command
- Settings nav item `id="nav-settings"` added to sidebar
- Network quality dot `id="netQuality"` added to topbar
- `<div id="trendingCreators">` panel added to rightbar in index.html

## Invariants
- `Settings.save(key, val)` must always call `this.apply(cfg)` so body classes stay in sync
- `showHoverCard` must guard against `state.view === 'messages'` / `'dm_thread'` to avoid cards appearing inside DM thread
- Story reply uses `messages` table (not a separate table) to send a DM to story owner
