// ═══════════════════════════════════════════
// KUDASAI — FULL APP ENGINE v3.0
// ═══════════════════════════════════════════

const { createClient } = supabase;
const _SUPA_URL = window.https://zoipwzvfkbzszpiectzb.supabase.co || '';
const _SUPA_KEY = window.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4 || '';
const _CREDS_OK = Boolean(_SUPA_URL && _SUPA_KEY);

console.log('[KUDASAI] SUPABASE_URL set:', !!_SUPA_URL);
console.log('[KUDASAI] SUPABASE_ANON_KEY set:', !!_SUPA_KEY);
console.log('[KUDASAI] Connected:', _CREDS_OK);

let db;
if (_CREDS_OK) {
  db = createClient(_SUPA_URL, _SUPA_KEY);
} else {
  const _noop = Promise.resolve({ data: null, error: { message: 'Supabase not configured.' } });
  const _proxy = new Proxy(function(){ return _proxy; }, {
    get(_, p) {
      if (p === 'then')    return _noop.then.bind(_noop);
      if (p === 'catch')   return _noop.catch.bind(_noop);
      if (p === 'finally') return _noop.finally.bind(_noop);
      return _proxy;
    },
    apply() { return _proxy; }
  });
  db = {
    auth: {
      getSession:         () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange:  () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured.' } }),
      signUp:             () => Promise.resolve({ data: null, error: { message: 'Supabase not configured.' } }),
      signInWithOAuth:    () => Promise.resolve({ data: null, error: { message: 'Supabase not configured.' } }),
      signOut:            () => Promise.resolve({ error: null }),
    },
    from:          () => _proxy,
    channel:       () => ({ on: () => ({ subscribe() {} }) }),
    removeChannel: () => {},
  };
}

// ── State ────────────────────────────────────
const state = {
  user: null, profile: null,
  posts: [], page: 0, loading: false,
  tab: 'forYou'
};

const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

// ── Boot ─────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Wire up buttons
  $('loginBtn')   ?.addEventListener('click', login);
  $('signupBtn')  ?.addEventListener('click', signup);
  $('postBtn')    ?.addEventListener('click', submitPost);
  $('postInput')  ?.addEventListener('input',  saveDraft);

  // Keyboard shortcut: Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') { closePalette(); closePostModal(); closeEditModal(); closeLightbox(); }
  });

  // Restore draft
  const draft = localStorage.getItem('kd_draft');
  if (draft && $('postInput')) $('postInput').value = draft;

  // Check existing session
  try {
    const { data } = await db.auth.getSession();
    if (data?.session?.user) {
      state.user = data.session.user;
      hideSplash();
      await bootstrap();
      return;
    }
  } catch (_) {}

  // Auth state changes
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.user = session.user;
      await bootstrap();
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      showLanding();
    }
  });

  hideSplash();
  showLanding();
});

function hideSplash() {
  const s = $('splashScreen');
  if (!s) return;
  s.style.transition = 'opacity 0.4s';
  s.style.opacity = '0';
  setTimeout(() => { s.style.display = 'none'; }, 400);
}

function show(id, val = '')  { const el = $(id); if (el) el.style.display = val; }
function hide(id)            { const el = $(id); if (el) el.style.display = 'none'; }
function setText(id, txt)    { const el = $(id); if (el) el.textContent = txt; }

function showLanding() {
  show('landingPage'); hide('authScreen'); hide('app');
  const content = document.querySelector('.landing-content');
  if (content) { content.style.animation = 'none'; content.style.opacity = '1'; content.style.transform = 'none'; }
}

function enterApp() {
  hide('landingPage');
  const auth = $('authScreen');
  if (auth) { auth.style.display = ''; auth.style.flexDirection = 'column'; auth.style.alignItems = 'center'; auth.style.justifyContent = 'center'; }
}

async function bootstrap() {
  hide('landingPage'); hide('authScreen');
  show('app', 'grid'); show('feedTabs'); show('composer');
  await loadProfile();
  await loadFeed();
  setupInfiniteScroll();
  startRealtime();
}

// ── Auth ──────────────────────────────────────
async function loginWithGoogle() {
  const { error } = await db.auth.signInWithOAuth({ provider: 'google' });
  if (error) alert(error.message);
}

async function login() {
  const { data, error } = await db.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value
  });
  if (error) { alert(error.message); return; }
  state.user = data.user;
  await bootstrap();
}

async function signup() {
  const email = $('email').value.trim();
  const { data, error } = await db.auth.signUp({ email, password: $('password').value });
  if (error) { alert(error.message); return; }
  if (data?.user) {
    await db.from('profiles').insert([{ user_id: data.user.id, username: email.split('@')[0], balance: 0 }]);
    alert('Account created! Check your email to confirm.');
  }
}

// ── Profile ───────────────────────────────────
async function loadProfile() {
  const { data } = await db.from('profiles').select('*').eq('user_id', state.user.id).maybeSingle();
  state.profile = data;
  setText('userTag',    '@' + (data?.username || 'user'));
  setText('balanceText','K'  + (data?.balance  || 0));
}

// ── Feed ──────────────────────────────────────
const PAGE_SIZE = 10;

async function loadFeed(append = false) {
  if (state.loading) return;
  state.loading = true;

  if (!append) {
    state.page = 0;
    $('feed').innerHTML = '<div style="text-align:center;padding:48px;color:#555;font-size:14px">Loading…</div>';
  }

  const from = state.page * PAGE_SIZE;
  const { data, error } = await db
    .from('posts')
    .select('*, profiles(username, avatar_url)')
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  state.loading = false;

  if (error) {
    if (!append) $('feed').innerHTML = `<div style="text-align:center;padding:60px;color:#f55">Could not load feed: ${esc(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    if (!append) $('feed').innerHTML = '<div style="text-align:center;padding:60px;color:#555;font-size:15px">No posts yet — be the first to post! 🚀</div>';
    return;
  }

  if (!append) $('feed').innerHTML = '';
  data.forEach(p => $('feed').insertAdjacentHTML('beforeend', renderPost(p)));
  state.posts = append ? [...state.posts, ...data] : data;
  state.page++;
}

function renderPost(p) {
  const uname  = p.profiles?.username || 'user';
  const avatar = p.profiles?.avatar_url
    ? `<img src="${esc(p.profiles.avatar_url)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0">`
    : `<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:17px;flex-shrink:0">${uname[0].toUpperCase()}</div>`;

  const time   = new Date(p.created_at).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const media  = p.image_url
    ? `<img src="${esc(p.image_url)}" style="width:100%;border-radius:14px;margin-top:10px;max-height:420px;object-fit:cover;cursor:pointer" onclick="openLightbox('${esc(p.image_url)}')">`
    : p.video_url
    ? `<video src="${esc(p.video_url)}" controls style="width:100%;border-radius:14px;margin-top:10px"></video>`
    : '';

  return `<div class="post-card" id="post-${p.id}" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div style="cursor:pointer;flex-shrink:0" onclick="viewProfile('${esc(p.user_id)}')">${avatar}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700;cursor:pointer;color:var(--accent)" onclick="viewProfile('${esc(p.user_id)}')">@${esc(uname)}</span>
          <span style="color:#444;font-size:12px">${esc(time)}</span>
        </div>
        <div style="margin-top:6px;line-height:1.6;word-break:break-word;font-size:15px">${esc(p.content || '')}</div>
        ${media}
        <div style="display:flex;gap:24px;margin-top:12px">
          <button onclick="toggleLike('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#e05'" onmouseout="this.style.color='#666'">❤️ <span id="likes-${p.id}">${p.likes_count || 0}</span></button>
          <button onclick="openPost('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#00d4ff'" onmouseout="this.style.color='#666'">💬 ${p.comments_count || 0}</button>
          <button onclick="repost('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#0f0'" onmouseout="this.style.color='#666'">🔁 ${p.reposts_count || 0}</button>
          <button onclick="bookmark('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#fa0'" onmouseout="this.style.color='#666'">🔖</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Infinite Scroll ───────────────────────────
function setupInfiniteScroll() {
  const sentinel = $('feedSentinel');
  if (!sentinel) return;
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !state.loading) loadFeed(true);
  }, { rootMargin: '300px' }).observe(sentinel);
}

// ── Post Submission ───────────────────────────
let _drafTimer;
function saveDraft() {
  clearTimeout(_drafTimer);
  _drafTimer = setTimeout(() => {
    localStorage.setItem('kd_draft', $('postInput').value);
    $('draftIndicator').style.opacity = '1';
    setTimeout(() => $('draftIndicator').style.opacity = '0', 1500);
  }, 800);
}

async function submitPost() {
  const content = $('postInput').value.trim();
  if (!content) return;
  if (!state.user) { alert('Please log in first.'); return; }
  const btn = $('postBtn');
  btn.disabled = true; btn.textContent = 'Posting…';
  const { error } = await db.from('posts').insert([{ user_id: state.user.id, content }]);
  btn.disabled = false; btn.textContent = 'Post';
  if (error) { alert(error.message); return; }
  $('postInput').value = '';
  localStorage.removeItem('kd_draft');
  await loadFeed();
}

// ── Social Actions ────────────────────────────
async function toggleLike(postId) {
  if (!state.user) { alert('Log in to like posts.'); return; }
  const { data } = await db.from('likes').select('id').eq('post_id', postId).eq('user_id', state.user.id).maybeSingle();
  const el = $('likes-' + postId);
  if (data) {
    await db.from('likes').delete().eq('id', data.id);
    if (el) el.textContent = Math.max(0, parseInt(el.textContent) - 1);
  } else {
    await db.from('likes').insert([{ post_id: postId, user_id: state.user.id }]);
    if (el) el.textContent = parseInt(el.textContent) + 1;
  }
}

async function repost(postId) {
  if (!state.user) { alert('Log in to repost.'); return; }
  await db.from('reposts').insert([{ post_id: postId, user_id: state.user.id }]);
}

async function bookmark(postId) {
  if (!state.user) { alert('Log in to bookmark.'); return; }
  await db.from('bookmarks').insert([{ post_id: postId, user_id: state.user.id }]);
}

// ── Realtime ──────────────────────────────────
function startRealtime() {
  if (!_CREDS_OK) return;
  db.channel('public:posts').on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts' },
    payload => {
      if (payload.new?.user_id !== state.user?.id) {
        $('feed').insertAdjacentHTML('afterbegin', renderPost(payload.new));
      }
    }
  ).subscribe();
}

// ── Navigation ────────────────────────────────
function setActiveNav(id) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active-nav'));
  document.querySelectorAll('.mob-nav-item').forEach(n => n.classList.remove('active-mob-nav'));
  const d = $('nav-' + id);   if (d) d.classList.add('active-nav');
  const m = $('mnav-' + id);  if (m) m.classList.add('active-mob-nav');
}

function showSection(html, navId) {
  setActiveNav(navId);
  $('feed').innerHTML = html;
  $('feedTabs').style.display  = 'none';
  $('composer').style.display  = 'none';
  $('storiesBar').style.display = 'none';
}

function goHome() {
  setActiveNav('home');
  $('feedTabs').style.display   = '';
  $('composer').style.display   = '';
  loadFeed();
}

// ── Page card helper ──────────────────────────
const pageWrap = (content) =>
  `<div style="max-width:640px;margin:0 auto;padding:8px 0">${content}</div>`;

const sectionHeader = (title) =>
  `<div style="padding:16px 20px 8px;font-weight:800;font-size:17px;color:var(--accent);letter-spacing:0.02em">${title}</div>`;

// ── Explore ───────────────────────────────────
function goExplore() {
  showSection(pageWrap(`
    ${sectionHeader('🔭 Explore')}
    <div style="padding:0 16px 16px">
      <input id="exploreSearch" class="search" placeholder="Search posts or @users…" style="width:100%;box-sizing:border-box"
        oninput="runExploreSearch(this.value)">
    </div>
    <div id="exploreResults"></div>
  `), 'explore');
  loadTrending();
}

async function loadTrending() {
  const el = $('exploreResults');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;text-align:center;color:#555;font-size:13px">Loading trending…</div>';
  const { data } = await db.from('posts')
    .select('*, profiles(username, avatar_url)')
    .order('likes_count', { ascending: false })
    .limit(20);
  if (!data || data.length === 0) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#555">Nothing trending yet.</div>'; return; }
  el.innerHTML = sectionHeader('🔥 Trending Posts');
  data.forEach(p => el.insertAdjacentHTML('beforeend', renderPost(p)));
}

let _exploreTimer;
function runExploreSearch(val) {
  clearTimeout(_exploreTimer);
  const el = $('exploreResults');
  if (!el) return;
  if (!val.trim()) { loadTrending(); return; }
  _exploreTimer = setTimeout(async () => {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:#555">Searching…</div>';
    const [{ data: posts }, { data: users }] = await Promise.all([
      db.from('posts').select('*, profiles(username,avatar_url)').ilike('content', `%${val}%`).limit(10),
      db.from('profiles').select('*').ilike('username', `%${val}%`).limit(5)
    ]);
    el.innerHTML = '';
    if (users?.length) {
      el.insertAdjacentHTML('beforeend', sectionHeader('👤 Users'));
      users.forEach(u => {
        el.insertAdjacentHTML('beforeend', `
          <div onclick="viewProfile('${esc(u.user_id)}')" style="display:flex;align-items:center;gap:12px;padding:12px 20px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff">${(u.username||'U')[0].toUpperCase()}</div>
            <div><div style="font-weight:700">@${esc(u.username||'user')}</div><div style="font-size:12px;color:#555">${esc(u.bio||'')}</div></div>
          </div>`);
      });
    }
    if (posts?.length) {
      el.insertAdjacentHTML('beforeend', sectionHeader('📝 Posts'));
      posts.forEach(p => el.insertAdjacentHTML('beforeend', renderPost(p)));
    }
    if (!users?.length && !posts?.length) {
      el.innerHTML = `<div style="padding:60px;text-align:center;color:#555">No results for "<strong>${esc(val)}</strong>"</div>`;
    }
  }, 350);
}

// ── Profile ───────────────────────────────────
function goProfile() { viewProfile(state.user?.id, true); }

async function viewProfile(userId, isSelf = false) {
  if (!userId) return;
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading profile…</div>', 'profile');
  const [{ data: prof }, { data: posts }, { data: followers }, { data: following }] = await Promise.all([
    db.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    db.from('posts').select('*, profiles(username,avatar_url)').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    db.from('follows').select('id').eq('following_id', userId),
    db.from('follows').select('id').eq('follower_id', userId)
  ]);

  const uname     = prof?.username || 'user';
  const avatarLet = uname[0].toUpperCase();
  const avatarEl  = prof?.avatar_url
    ? `<img src="${esc(prof.avatar_url)}" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid var(--accent)">`
    : `<div style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;color:#fff;border:3px solid var(--accent)">${avatarLet}</div>`;

  const isOwnProfile = userId === state.user?.id;
  const isFollowing  = !isOwnProfile && followers?.some(f => f.id); // simplified
  const actionBtn    = isOwnProfile
    ? `<button onclick="openEditModal()" style="padding:8px 22px;border-radius:20px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#ccc;cursor:pointer;font-size:13px;font-weight:600">Edit Profile</button>`
    : `<button onclick="followUser('${esc(userId)}')" id="followBtn-${esc(userId)}" style="padding:8px 22px;border-radius:20px;border:none;background:var(--accent);color:#000;cursor:pointer;font-size:13px;font-weight:700">Follow</button>`;

  const html = pageWrap(`
    <div style="padding:20px">
      <div style="display:flex;align-items:flex-start;gap:16px">
        ${avatarEl}
        <div style="flex:1">
          <div style="font-size:20px;font-weight:800">@${esc(uname)}</div>
          ${prof?.bio ? `<div style="color:#888;font-size:14px;margin-top:4px">${esc(prof.bio)}</div>` : ''}
          <div style="display:flex;gap:20px;margin-top:12px">
            <div style="text-align:center"><div style="font-weight:800;font-size:16px">${posts?.length || 0}</div><div style="font-size:11px;color:#555">Posts</div></div>
            <div style="text-align:center"><div style="font-weight:800;font-size:16px">${followers?.length || 0}</div><div style="font-size:11px;color:#555">Followers</div></div>
            <div style="text-align:center"><div style="font-weight:800;font-size:16px">${following?.length || 0}</div><div style="font-size:11px;color:#555">Following</div></div>
          </div>
          <div style="margin-top:12px">${actionBtn}</div>
        </div>
      </div>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.06)">
      ${sectionHeader('Posts')}
      <div id="profilePosts"></div>
    </div>
  `);

  showSection(html, 'profile');
  const pp = $('profilePosts');
  if (pp) {
    if (!posts?.length) { pp.innerHTML = '<div style="padding:40px;text-align:center;color:#555">No posts yet.</div>'; }
    else posts.forEach(p => pp.insertAdjacentHTML('beforeend', renderPost(p)));
  }
}

function openEditModal() {
  if ($('editModal')) {
    $('editModal').style.display = 'flex';
    if ($('editUsername')) $('editUsername').value = state.profile?.username || '';
    if ($('editBio'))      $('editBio').value      = state.profile?.bio || '';
  }
}

async function followUser(userId) {
  if (!state.user) { alert('Log in to follow users.'); return; }
  const { error } = await db.from('follows').insert([{ follower_id: state.user.id, following_id: userId }]);
  const btn = $('followBtn-' + userId);
  if (!error && btn) { btn.textContent = 'Following'; btn.style.background = 'transparent'; btn.style.border = '1px solid rgba(255,255,255,0.2)'; btn.style.color = '#ccc'; }
}

// ── Notifications ─────────────────────────────
async function goNotifications() {
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading…</div>', 'notifs');
  const { data } = await db.from('notifications')
    .select('*, profiles(username,avatar_url)')
    .eq('user_id', state.user?.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!data || data.length === 0) {
    showSection(pageWrap(sectionHeader('🔔 Notifications') + '<div style="padding:60px;text-align:center;color:#555">No notifications yet.</div>'), 'notifs');
    return;
  }

  const icons = { like: '❤️', comment: '💬', follow: '👤', repost: '🔁', mention: '📢' };
  const rows = data.map(n => {
    const icon  = icons[n.type] || '🔔';
    const uname = n.profiles?.username || 'someone';
    const time  = new Date(n.created_at).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const msgs  = { like: 'liked your post', comment: 'commented on your post', follow: 'started following you', repost: 'reposted your post', mention: 'mentioned you' };
    return `<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.05);${n.read?'opacity:0.5':''}">
      <span style="font-size:20px">${icon}</span>
      <div style="flex:1"><span style="font-weight:700">@${esc(uname)}</span> ${msgs[n.type]||'interacted with you'}<div style="font-size:11px;color:#555;margin-top:2px">${time}</div></div>
    </div>`;
  }).join('');

  showSection(pageWrap(sectionHeader('🔔 Notifications') + rows), 'notifs');
  // Mark read
  await db.from('notifications').update({ read: true }).eq('user_id', state.user?.id).eq('read', false);
  hide('notifBadge'); hide('mnotifBadge');
}

// ── Bookmarks ─────────────────────────────────
async function goBookmarks() {
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading bookmarks…</div>', 'bookmarks');
  const { data } = await db.from('bookmarks')
    .select('*, posts(*, profiles(username,avatar_url))')
    .eq('user_id', state.user?.id)
    .order('created_at', { ascending: false });

  if (!data || data.length === 0) {
    showSection(pageWrap(sectionHeader('🔖 Bookmarks') + '<div style="padding:60px;text-align:center;color:#555">No bookmarks yet.<br><span style="font-size:13px">Tap 🔖 on any post to save it.</span></div>'), 'bookmarks');
    return;
  }
  const feed = document.createElement('div');
  feed.innerHTML = sectionHeader('🔖 Bookmarks');
  data.forEach(b => { if (b.posts) feed.insertAdjacentHTML('beforeend', renderPost(b.posts)); });
  showSection(pageWrap(feed.innerHTML), 'bookmarks');
}

// ── Messages ──────────────────────────────────
let _activeDM = null;

async function goMessages() {
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading messages…</div>', 'messages');
  if (!state.user) return;

  // Get unique conversations
  const { data } = await db.from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(username,avatar_url), receiver:profiles!messages_receiver_id_fkey(username,avatar_url)')
    .or(`sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`)
    .order('created_at', { ascending: false })
    .limit(50);

  const seen = new Set();
  const convos = [];
  (data || []).forEach(m => {
    const other = m.sender_id === state.user.id ? { id: m.receiver_id, ...m.receiver } : { id: m.sender_id, ...m.sender };
    if (!seen.has(other.id)) { seen.add(other.id); convos.push({ other, last: m }); }
  });

  const rows = convos.length
    ? convos.map(c => {
        const av = c.other.avatar_url
          ? `<img src="${esc(c.other.avatar_url)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
          : `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:18px">${(c.other.username||'U')[0].toUpperCase()}</div>`;
        return `<div onclick="openDM('${esc(c.other.id)}','${esc(c.other.username||'user')}')" style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
          ${av}
          <div style="flex:1;min-width:0">
            <div style="font-weight:700">@${esc(c.other.username||'user')}</div>
            <div style="font-size:12px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last.content||'')}</div>
          </div>
        </div>`;
      }).join('')
    : '<div style="padding:60px;text-align:center;color:#555">No messages yet.</div>';

  showSection(pageWrap(`
    ${sectionHeader('💬 Messages')}
    <div style="padding:0 16px 12px">
      <input class="search" placeholder="New message — @username…" style="width:100%;box-sizing:border-box" id="dmSearchInput" oninput="dmUserSearch(this.value)">
    </div>
    <div id="dmUserResults"></div>
    ${rows}
  `), 'messages');
}

async function dmUserSearch(val) {
  const el = $('dmUserResults');
  if (!el || !val.trim()) { el && (el.innerHTML = ''); return; }
  const { data } = await db.from('profiles').select('*').ilike('username', `%${val}%`).neq('user_id', state.user?.id).limit(5);
  el.innerHTML = (data||[]).map(u => `
    <div onclick="openDM('${esc(u.user_id)}','${esc(u.username||'user')}')" style="display:flex;align-items:center;gap:10px;padding:10px 20px;cursor:pointer;background:rgba(0,212,255,0.05);border-bottom:1px solid rgba(255,255,255,0.04)">
      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px">${(u.username||'U')[0].toUpperCase()}</div>
      @${esc(u.username||'user')}
    </div>`).join('');
}

async function openDM(toId, toName) {
  _activeDM = toId;
  showSection(`
    <div style="display:flex;flex-direction:column;height:calc(100vh - 140px)">
      <div style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:10px">
        <button onclick="goMessages()" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px">←</button>
        <span style="font-weight:700">@${esc(toName)}</span>
      </div>
      <div id="dmThread" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px">
        <div style="text-align:center;color:#555;font-size:13px">Loading…</div>
      </div>
      <div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px">
        <input id="dmInput" class="comment-input" placeholder="Message…" style="flex:1" onkeydown="if(event.key==='Enter')sendDM()">
        <button onclick="sendDM()" style="padding:8px 18px;border-radius:20px;border:none;background:var(--accent);color:#000;font-weight:700;cursor:pointer">Send</button>
      </div>
    </div>`, 'messages');
  loadDMThread(toId);
}

async function loadDMThread(toId) {
  const el = $('dmThread');
  if (!el) return;
  const { data } = await db.from('messages')
    .select('*')
    .or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${toId}),and(sender_id.eq.${toId},receiver_id.eq.${state.user.id})`)
    .order('created_at', { ascending: true });
  if (!data?.length) { el.innerHTML = '<div style="text-align:center;color:#555;font-size:13px">No messages yet. Say hello!</div>'; return; }
  el.innerHTML = data.map(m => {
    const mine = m.sender_id === state.user.id;
    return `<div style="display:flex;justify-content:${mine?'flex-end':'flex-start'}">
      <div style="max-width:72%;padding:10px 14px;border-radius:18px;background:${mine?'var(--accent)':'rgba(255,255,255,0.08)'};color:${mine?'#000':'#fff'};font-size:14px">${esc(m.content||'')}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendDM() {
  const inp = $('dmInput');
  if (!inp || !inp.value.trim() || !_activeDM) return;
  const content = inp.value.trim();
  inp.value = '';
  await db.from('messages').insert([{ sender_id: state.user.id, receiver_id: _activeDM, content }]);
  loadDMThread(_activeDM);
}

// ── Communities ───────────────────────────────
async function goCommunities() {
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading communities…</div>', 'communities');
  const { data } = await db.from('communities').select('*').order('created_at', { ascending: false }).limit(30);

  const cards = (data||[]).map(c => `
    <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:14px;cursor:pointer" onclick="openCommunity('${esc(c.id)}','${esc(c.name||'Community')}')">
      <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#00d4ff22,#a855f722);border:1px solid rgba(0,212,255,0.2);display:flex;align-items:center;justify-content:center;font-size:22px">${c.icon||'🏘'}</div>
      <div style="flex:1">
        <div style="font-weight:700">${esc(c.name||'Community')}</div>
        <div style="font-size:12px;color:#555;margin-top:2px">${esc(c.description||'')}</div>
        <div style="font-size:11px;color:#444;margin-top:4px">${c.member_count||0} members</div>
      </div>
      <button onclick="event.stopPropagation();joinCommunity('${esc(c.id)}')" style="padding:6px 16px;border-radius:16px;border:1px solid rgba(0,212,255,0.4);background:transparent;color:var(--accent);cursor:pointer;font-size:12px;font-weight:600">Join</button>
    </div>`).join('') || '<div style="padding:60px;text-align:center;color:#555">No communities yet.</div>';

  showSection(pageWrap(`
    ${sectionHeader('🏘 Communities')}
    ${cards}
  `), 'communities');
}

async function joinCommunity(communityId) {
  if (!state.user) { alert('Log in to join communities.'); return; }
  await db.from('community_members').insert([{ community_id: communityId, user_id: state.user.id }]);
}

function openCommunity(id, name) { goCommunities(); }

// ── Jobs ──────────────────────────────────────
async function goJobs() {
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading jobs…</div>', 'jobs');
  const { data } = await db.from('jobs').select('*, profiles(username)').order('created_at', { ascending: false }).limit(30);

  const cards = (data||[]).map(j => `
    <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-weight:700;font-size:15px">${esc(j.title||'Untitled')}</div>
      <div style="font-size:13px;color:var(--accent);margin-top:2px">${esc(j.company||j.profiles?.username||'')}</div>
      <div style="font-size:13px;color:#666;margin-top:4px">${esc(j.location||'Remote')} · ${esc(j.type||'Full-time')}</div>
      <div style="font-size:13px;color:#888;margin-top:6px;line-height:1.5">${esc((j.description||'').slice(0,140))}${(j.description||'').length>140?'…':''}</div>
    </div>`).join('') || '<div style="padding:60px;text-align:center;color:#555">No job listings yet.</div>';

  showSection(pageWrap(`
    ${sectionHeader('💼 Jobs')}
    ${cards}
  `), 'jobs');
}

// ── Surveys ───────────────────────────────────
async function goSurveys() {
  showSection('<div style="padding:48px;text-align:center;color:#555">Loading surveys…</div>', 'surveys');
  // Load posts that have polls
  const { data } = await db.from('posts')
    .select('*, profiles(username,avatar_url)')
    .not('poll_options', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  const cards = (data||[]).map(p => {
    const opts = (p.poll_options || []);
    const total = opts.reduce((s, o) => s + (o.votes||0), 0);
    const optsHtml = opts.map((o, i) => {
      const pct = total ? Math.round((o.votes||0)/total*100) : 0;
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${esc(o.text||'')}</span><span style="color:var(--accent)">${pct}%</span></div>
        <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .5s"></div></div>
      </div>`;
    }).join('');
    return `<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="font-weight:600;margin-bottom:10px">${esc(p.content||'')}</div>
      ${optsHtml}
      <div style="font-size:11px;color:#555;margin-top:6px">${total} votes · by @${esc(p.profiles?.username||'user')}</div>
    </div>`;
  }).join('') || '<div style="padding:60px;text-align:center;color:#555">No active polls yet.</div>';

  showSection(pageWrap(`
    ${sectionHeader('📊 Polls & Surveys')}
    ${cards}
  `), 'surveys');
}

// ── Settings ──────────────────────────────────
function goSettings() {
  const themeLabel = document.body.classList.contains('light-mode') ? '🌙 Switch to Dark Mode' : '☀️ Switch to Light Mode';
  showSection(pageWrap(`
    ${sectionHeader('⚙️ Settings')}

    <div style="padding:4px 0">
      <div style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="font-weight:700;margin-bottom:2px">Account</div>
        <div style="font-size:13px;color:#666">${esc(state.user?.email||'')}</div>
      </div>

      <div style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="font-weight:700;margin-bottom:2px">Username</div>
        <div style="font-size:13px;color:#666">@${esc(state.profile?.username||'user')}</div>
      </div>

      <div onclick="toggleTheme()" style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
        <div style="font-weight:600">${themeLabel}</div>
        <span style="color:#888">→</span>
      </div>

      <div onclick="openEditModal()" style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
        <div style="font-weight:600">✏️ Edit Profile</div>
        <span style="color:#888">→</span>
      </div>

      <div onclick="confirmSignOut()" style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
        <div style="font-weight:600;color:#f55">🚪 Sign Out</div>
        <span style="color:#888">→</span>
      </div>

      <div style="padding:24px 20px;color:#555;font-size:12px">KUDASAI v3.0 · The Social Platform of the Future</div>
    </div>
  `), 'settings');
}

async function confirmSignOut() {
  if (!confirm('Sign out of KUDASAI?')) return;
  await db.auth.signOut();
  state.user = null; state.profile = null;
  showLanding();
}

// ── KAI ───────────────────────────────────────
function goKudasaiAI() {
  showSection(pageWrap(`
    <div style="text-align:center;padding:60px 40px 30px">
      <div style="font-size:56px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:900;margin-bottom:12px">✦ KAI</div>
      <div style="font-size:18px;font-weight:700;color:#ccc">KUDASAI Intelligence Engine</div>
      <div style="font-size:14px;color:#555;margin-top:8px">AI-powered discovery &amp; recommendations</div>
    </div>
    <div style="padding:0 20px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${[['🔥','Trending for you','See what\'s hot in your network'],['👤','Who to follow','Discover creators matching your interests'],['🎵','Trending audio','Top sounds this week'],['🌐','Global feed','Explore posts worldwide']].map(([i,t,d])=>`
        <div style="padding:16px;border-radius:16px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)">
          <div style="font-size:24px;margin-bottom:8px">${i}</div>
          <div style="font-weight:700;font-size:14px">${t}</div>
          <div style="font-size:12px;color:#555;margin-top:4px">${d}</div>
        </div>`).join('')}
    </div>
    <div style="padding:24px 20px;text-align:center;color:#444;font-size:12px">Full AI features coming in the next update</div>
  `), 'kai');
}

// ── Tab switching ─────────────────────────────
function switchTab(tab) {
  state.tab = tab;
  $('tabForYou')   ?.classList.toggle('tab-active', tab === 'forYou');
  $('tabFollowing')?.classList.toggle('tab-active', tab === 'following');
  loadFeed();
}

// ── Post modal with comments ──────────────────
async function openPost(postId) {
  const box = $('postModalBox');
  if (!box) return;
  box.innerHTML = '<div style="padding:32px;text-align:center;color:#aaa">Loading…</div>';
  $('postModal').style.display = 'flex';

  const [{ data: post }, { data: comments }] = await Promise.all([
    db.from('posts').select('*, profiles(username,avatar_url)').eq('id', postId).maybeSingle(),
    db.from('comments').select('*, profiles(username,avatar_url)').eq('post_id', postId).order('created_at', { ascending: true })
  ]);

  if (!post) { box.innerHTML = '<div style="padding:32px;text-align:center;color:#f55">Post not found.</div>'; return; }

  const commentRows = (comments||[]).map(c => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:13px;flex-shrink:0">${(c.profiles?.username||'U')[0].toUpperCase()}</div>
      <div><span style="font-weight:700;font-size:13px">@${esc(c.profiles?.username||'user')}</span><div style="font-size:14px;margin-top:2px">${esc(c.content||'')}</div></div>
    </div>`).join('');

  box.innerHTML = `
    <div class="modal-header"><span>Post</span><button class="modal-close" onclick="closePostModal()">✕</button></div>
    <div class="modal-body" style="padding:0">
      ${renderPost(post)}
      <div style="padding:16px 20px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="font-weight:700;margin-bottom:10px;font-size:14px">Comments (${comments?.length||0})</div>
        ${commentRows || '<div style="color:#555;font-size:13px">No comments yet — be first!</div>'}
        <div style="display:flex;gap:8px;margin-top:14px">
          <input id="commentInput" class="comment-input" placeholder="Add a comment…" style="flex:1" onkeydown="if(event.key==='Enter')submitComment('${esc(postId)}')">
          <button onclick="submitComment('${esc(postId)}')" class="comment-btn">Reply</button>
        </div>
      </div>
    </div>`;
}

async function submitComment(postId) {
  const inp = $('commentInput');
  if (!inp || !inp.value.trim()) return;
  if (!state.user) { alert('Log in to comment.'); return; }
  const content = inp.value.trim();
  inp.value = '';
  await db.from('comments').insert([{ post_id: postId, user_id: state.user.id, content }]);
  openPost(postId);
}

function closePostModal(e)  { if (!e || e.target.id === 'postModal')  $('postModal').style.display  = 'none'; }
function closeEditModal(e)  { if (!e || e.target.id === 'editModal')  $('editModal').style.display  = 'none'; }

// ── Save profile ──────────────────────────────
async function saveProfile() {
  const username = $('editUsername')?.value.trim();
  const bio      = $('editBio')?.value.trim();
  if (!username) { alert('Username cannot be empty.'); return; }
  if (!state.user) return;
  const btn = document.querySelector('#editModal .comment-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const { error } = await db.from('profiles').update({ username, bio }).eq('user_id', state.user.id);
  if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  if (error) { alert(error.message); return; }
  state.profile = { ...state.profile, username, bio };
  setText('userTag', '@' + username);
  closeEditModal();
}

// ── Search ────────────────────────────────────
let _searchTimer;
function handleSearch(val) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    if (!val.trim()) { loadFeed(); return; }
    $('feedTabs').style.display = 'none';
    $('feed').innerHTML = '<div style="text-align:center;padding:40px;color:#555">Searching…</div>';
    const { data } = await db.from('posts').select('*, profiles(username,avatar_url)').ilike('content', `%${val}%`).order('created_at', { ascending: false }).limit(20);
    if (!data || data.length === 0) {
      $('feed').innerHTML = `<div style="text-align:center;padding:60px;color:#555">No results for "<strong>${esc(val)}</strong>"</div>`;
      return;
    }
    $('feed').innerHTML = '';
    data.forEach(p => $('feed').insertAdjacentHTML('beforeend', renderPost(p)));
  }, 400);
}

// ── Theme ─────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  $('themeToggle').textContent = document.body.classList.contains('light-mode') ? '🌙 Dark Mode' : '☀️ Light Mode';
}

// ── Command Palette ───────────────────────────
const _cmds = [
  { label: '🏠 Home',          fn: goHome },
  { label: '🔭 Explore',       fn: goExplore },
  { label: '👤 Profile',       fn: goProfile },
  { label: '🔔 Notifications', fn: goNotifications },
  { label: '🔖 Bookmarks',     fn: goBookmarks },
  { label: '💬 Messages',      fn: goMessages },
  { label: '✦  KAI',          fn: goKudasaiAI },
  { label: '🏘 Communities',   fn: goCommunities },
  { label: '📋 Surveys',       fn: goSurveys },
  { label: '⚙️ Settings',      fn: goSettings },
  { label: '☀️ Toggle Theme',  fn: toggleTheme },
];
let _filteredCmds = _cmds;

function openPalette() {
  $('cmdPalette').style.display = 'flex';
  $('cmdInput').value = '';
  filterPalette('');
  setTimeout(() => $('cmdInput').focus(), 50);
}
function closePalette(e) { if (!e || e.target.id === 'cmdPalette') $('cmdPalette').style.display = 'none'; }
function filterPalette(q) {
  _filteredCmds = _cmds.filter(c => c.label.toLowerCase().includes(q.toLowerCase()));
  $('cmdResults').innerHTML = _filteredCmds.map((c, i) =>
    `<div onclick="runCmd(${i})" style="padding:10px 16px;cursor:pointer;border-radius:8px;transition:background .15s" onmouseover="this.style.background='rgba(0,212,255,0.08)'" onmouseout="this.style.background=''">${c.label}</div>`
  ).join('');
}
function handlePaletteKey(e) {
  if (e.key === 'Escape') closePalette();
  if (e.key === 'Enter' && _filteredCmds.length > 0) { runCmd(0); }
}
function runCmd(i) { _filteredCmds[i]?.fn(); closePalette(); }

// ── Composer Extras ───────────────────────────
function togglePollBuilder()   { const el=$('pollBuilder');   el.style.display = el.style.display === 'none' ? '' : 'none'; }
function toggleThreadBuilder() { const el=$('threadBuilder'); el.style.display = el.style.display === 'none' ? '' : 'none'; }
function toggleEmoji()         { const el=$('emojiPicker');   el.style.display = el.style.display === 'none' ? 'block' : 'none'; }

function addPollOption() {
  const list = $('pollOptionsList');
  if (list.children.length >= 6) return;
  const n = list.children.length;
  const inp = document.createElement('input');
  inp.className = 'poll-option-input'; inp.placeholder = `Option ${n + 1}`; inp.maxLength = 80;
  list.appendChild(inp);
}

function addThreadSegment() {
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  div.innerHTML = `<textarea class="comment-input" rows="2" placeholder="Continue the thread…" style="flex:1;resize:none"></textarea>`;
  $('threadSegmentsList').appendChild(div);
}

// ── Lightbox ──────────────────────────────────
function openLightbox(src) {
  $('lightboxImg').src = src;
  $('lightboxImg').style.display = '';
  $('lightboxVid').style.display = 'none';
  $('lightbox').style.display = 'flex';
}
function closeLightbox() { $('lightbox').style.display = 'none'; }
function galleryPrev()   {}
function galleryNext()   {}

// ── Stories ───────────────────────────────────
function addStory()                { $('storyImgInput').click(); }
async function uploadStory(input)  { alert('Story upload coming soon!'); }
function closeStoryViewer()        { $('storyViewer').style.display = 'none'; }
function prevStory()               {}
function nextStory()               {}

// ── Follow Modal ──────────────────────────────
function closeFollowModal(e) { if (!e || e.target.id === 'followModal') $('followModal').style.display = 'none'; }
function filterFollowList(q) {}

// ── Mobile ────────────────────────────────────
function mobileNewPost() {
  $('mainCol')?.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => $('postInput')?.focus(), 300);
}
