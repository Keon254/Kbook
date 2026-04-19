// ========================================
// KUDASAI STAGE 13 — REALTIME + ANTI-BUG CORE
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
  loading: false,
  listeners: [],
  cache: {},
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= SAFE WRAPPER =================
function safe(fn) {
  return async (...args) => {
    if (state.loading) return;
    state.loading = true;

    try {
      await fn(...args);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error");
    }

    state.loading = false;
  };
}

// ================= COOLDOWN SYSTEM =================
function cooldown(key, time) {
  const now = Date.now();
  if (state.lastAction[key] && now - state.lastAction[key] < time) {
    return false;
  }
  state.lastAction[key] = now;
  return true;
}

// ================= AUTH =================
async function login() {
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) return alert(error.message);

  state.user = data.user;
  await bootstrap();
}

async function signup() {
  const { error } = await db.auth.signUp({
    email: $("email").value,
    password: $("password").value
  });

  if (error) return alert(error.message);
  alert("Account created");
}

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
  $("userTag").textContent = data?.username || "user";
}

// ================= CREATE POST =================
const createPost = safe(async () => {
  if (!cooldown("post", 2000)) return;

  const content = $("postInput").value.trim();
  if (!content) return;

  // optimistic UI
  const tempPost = {
    id: "temp_" + Date.now(),
    content,
    user_id: state.user.id,
    likes: 0
  };

  state.posts.unshift(tempPost);
  renderFeed();

  $("postInput").value = "";

  const { error } = await db.from("posts").insert([{
    content,
    user_id: state.user.id
  }]);

  if (error) {
    alert("Post failed");
    state.posts = state.posts.filter(p => p.id !== tempPost.id);
    renderFeed();
  }
});

// ================= LOAD FEED =================
async function loadFeed() {
  if (state.cache.feed) {
    state.posts = state.cache.feed;
    renderFeed();
  }

  const { data } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  state.posts = data || [];
  state.cache.feed = state.posts;

  renderFeed();
}

// ================= RENDER =================
function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${p.content}</p>
      <button class="btn likeBtn" data-id="${p.id}">
        ❤️ ${p.likes || 0}
      </button>
    `;

    fragment.appendChild(div);
  });

  feed.appendChild(fragment);

  document.querySelectorAll(".likeBtn").forEach(btn => {
    btn.onclick = () => like(btn.dataset.id);
  });
}

// ================= LIKE =================
const like = safe(async (id) => {
  if (!cooldown("like", 1000)) return;

  const post = state.posts.find(p => p.id === id);
  if (post) {
    post.likes = (post.likes || 0) + 1;
    renderFeed();
  }

  const { error } = await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  if (error) {
    alert("Like failed");
    loadFeed();
  }
});

// ================= REALTIME =================
function setupRealtime() {
  // clear old listeners
  state.listeners.forEach(l => l.unsubscribe());
  state.listeners = [];

  const channel = db
    .channel("posts-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      payload => {
        loadFeed(); // safe refresh
      }
    )
    .subscribe();

  state.listeners.push(channel);
}

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>${state.profile?.username}</h2>
      <p>Balance: K${state.profile?.balance || 0}</p>
    </div>
  `;
}

// ================= NAV =================
function goHome() {
  loadFeed();
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
