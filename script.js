// ═══════════════════════════════════════════
// KUDASAI — FULL APP ENGINE v3.0
// ═══════════════════════════════════════════

const { createClient } = supabase;
const _SUPA_URL = window.SUPABASE_URL || '';
const _SUPA_KEY = window.SUPABASE_ANON_KEY || '';
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

const _soon = (label, icon='🔮') =>
  `<div style="text-align:center;padding:80px 40px"><div style="font-size:48px;margin-bottom:16px">${icon}</div><div style="font-size:20px;font-weight:700;color:#ccc">${label}</div><p style="color:#555;margin-top:8px;font-size:14px">Coming soon…</p></div>`;

function goExplore()      { showSection(_soon('Explore', '🔭'), 'explore'); }
function goProfile()      { showSection(_soon('Your Profile', '👤'), 'profile'); }
function goNotifications(){ showSection(_soon('Notifications', '🔔'), 'notifs'); }
function goBookmarks()    { showSection(_soon('Bookmarks', '🔖'), 'bookmarks'); }
function goMessages()     { showSection(_soon('Direct Messages', '💬'), 'messages'); }
function goJobs()         { showSection(_soon('Jobs', '💼'), 'jobs'); }
function goCommunities()  { showSection(_soon('Communities', '🏘'), 'communities'); }
function goSurveys()      { showSection(_soon('Surveys', '📋'), 'surveys'); }
function goSettings()     { showSection(_soon('Settings', '⚙️'), 'settings'); }
function goKudasaiAI()    {
  showSection(`<div style="text-align:center;padding:80px 40px">
    <div style="font-size:52px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:900">✦ KAI</div>
    <div style="font-size:18px;font-weight:600;margin-top:12px;color:#ccc">KUDASAI Intelligence Engine</div>
    <p style="color:#555;margin-top:8px;font-size:14px">AI-powered discovery &amp; recommendations — coming soon…</p>
  </div>`, 'kai');
}

function switchTab(tab) {
  state.tab = tab;
  $('tabForYou')   .classList.toggle('tab-active', tab === 'forYou');
  $('tabFollowing').classList.toggle('tab-active', tab === 'following');
  loadFeed();
}

function viewProfile(userId) {
  showSection(_soon('User Profile', '👤'), 'profile');
}

function openPost(postId) {
  $('postModalBox').innerHTML = `<div style="padding:24px;color:#aaa;text-align:center">Loading post…</div>`;
  $('postModal').style.display = 'flex';
  db.from('posts').select('*, profiles(username, avatar_url)').eq('id', postId).maybeSingle().then(({ data }) => {
    if (data) $('postModalBox').innerHTML = renderPost(data) + `<div style="padding:20px;color:#555;font-size:13px">Comments coming soon…</div>`;
  });
}
function closePostModal(e)  { if (!e || e.target.id === 'postModal')  $('postModal').style.display  = 'none'; }
function closeEditModal(e)  { if (!e || e.target.id === 'editModal')  $('editModal').style.display  = 'none'; }
async function saveProfile() { alert('Profile editing coming soon!'); closeEditModal(); }

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
