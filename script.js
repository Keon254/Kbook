// ========================================
// KUDASAI STAGE 13 — REALTIME + COMMENTS + HARDENED CORE
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

// ================= STATE =================
const state = {
  user: null,
  profile: null,
  posts: [],
  comments: {},
  balance: 0,
  lastAction: {},
  realtimeSub: null
};

// ================= SAFE =================
const $ = id => document.getElementById(id);

function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (err) {
      console.error(err);
      alert(err.message || "Error");
    }
  };
}

function cooldown(key, time) {
  const now = Date.now();
  if (state.lastAction[key] && now - state.lastAction[key] < time) {
    return false;
  }
  state.lastAction[key] = now;
  return true;
}

// ================= AUTH =================
const login = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) return alert("Fill fields");

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { error } = await db.auth.signUp({ email, password });
  if (error) throw error;

  alert("Signup success");
});

// ================= BOOT =================
async function bootstrap() {
  await loadProfile();
  showApp();
  await loadFeed();
  setupRealtime();
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  state.profile = data;
  state.balance = data?.balance || 0;

  if ($("userTag")) {
    $("userTag").textContent = data?.username || "user";
  }
}

// ================= POSTS =================
const createPost = safe(async () => {
  if (!cooldown("post", 2000)) return;

  const text = $("postInput").value.trim();
  if (!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id,
    likes: 0
  }]);

  $("postInput").value = "";
});

// ================= LOAD FEED =================
async function loadFeed() {
  const { data } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  state.posts = (data || []).map(p => ({
    ...p,
    score: (p.likes || 0) * 2 + new Date(p.created_at).getTime() / 100000
  }))
  .sort((a, b) => b.score - a.score);

  renderFeed();
}

// ================= RENDER =================
function renderFeed() {
  const feed = $("feed");
  if (!feed) return;

  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${escapeHTML(p.content)}</p>

      <div class="actions">
        <button onclick="like('${p.id}')">❤️ ${p.likes || 0}</button>
        <button onclick="openComments('${p.id}')">💬</button>
      </div>

      <div id="comments-${p.id}" class="comments"></div>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
const like = safe(async (id) => {
  if (!cooldown("like", 1500)) return;

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  await db.rpc("increment_likes", { post_id_input: id });

  loadFeed();
});

// ================= COMMENTS =================
const openComments = safe(async (postId) => {
  const container = document.getElementById(`comments-${postId}`);

  const { data } = await db
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  container.innerHTML = `
    <div class="comment-box">
      ${(data || []).map(c => `<p><b>${c.user_id}</b>: ${c.content}</p>`).join("")}
      <input id="c-${postId}" placeholder="Write comment...">
      <button onclick="addComment('${postId}')">Send</button>
    </div>
  `;
});

const addComment = safe(async (postId) => {
  const input = $(`c-${postId}`);
  const text = input.value.trim();
  if (!text) return;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);

  openComments(postId);
});

// ================= REALTIME =================
function setupRealtime() {
  if (state.realtimeSub) return;

  state.realtimeSub = db
    .channel("posts-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
      loadFeed();
    })
    .subscribe();
}

// ================= SECURITY =================
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[s]));
}

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
