// ========================================
// KUDASAI STAGE 6 — REAL SOCIAL ENGINE
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
  likesMap: {},
  commentsMap: {},
  balance: 0,
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (err) {
      console.error(err);
      alert(err.message || "Error");
    }
  };
}

// ================= COOLDOWN =================
function cooldown(key, time) {
  const now = Date.now();
  if (state.lastAction[key] && now - state.lastAction[key] < time) {
    alert("Slow down");
    return false;
  }
  state.lastAction[key] = now;
  return true;
}

// ================= AUTH =================
const login = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async () => {
  const { error } = await db.auth.signUp({
    email: $("email").value.trim(),
    password: $("password").value.trim()
  });
  if (error) throw error;

  alert("Signup success");
});

// ================= BOOT =================
async function bootstrap() {
  await loadProfile();
  showApp();
  await loadFeed();
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (!data) {
    const username = "user" + Math.floor(Math.random()*9999);

    await db.from("profiles").insert([{
      user_id: state.user.id,
      username,
      balance: 0,
      role: "user"
    }]);

    state.profile = { username, balance: 0, role: "user" };
  } else {
    state.profile = data;
  }

  state.balance = state.profile.balance || 0;
  $("userTag").textContent = state.profile.username;
}

// ================= POSTS =================
const createPost = safe(async () => {
  if (!cooldown("post", 3000)) return;

  const text = $("postInput").value.trim();
  if (!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  $("postInput").value = "";
  loadFeed();
});

// ================= LOAD FEED =================
async function loadFeed() {
  const { data: posts } = await db.from("posts").select("*");

  const { data: profiles } = await db.from("profiles").select("*");

  const { data: likes } = await db.from("likes").select("*");

  const { data: comments } = await db.from("comments").select("*");

  // Map profiles
  const profileMap = {};
  profiles.forEach(p => profileMap[p.user_id] = p);

  // Count likes
  const likeCount = {};
  likes.forEach(l => {
    likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1;
  });

  // Prevent duplicate like
  state.likesMap = {};
  likes.forEach(l => {
    state.likesMap[`${l.post_id}_${l.user_id}`] = true;
  });

  // Comments map
  state.commentsMap = {};
  comments.forEach(c => {
    if (!state.commentsMap[c.post_id]) state.commentsMap[c.post_id] = [];
    state.commentsMap[c.post_id].push(c);
  });

  // Merge everything
  state.posts = posts.map(p => ({
    ...p,
    username: profileMap[p.user_id]?.username || "user",
    likes: likeCount[p.id] || 0
  }));

  // 🧠 VIRAL ALGO
  state.posts.sort((a, b) => {
    const scoreA = a.likes * 2 + (Date.now() - new Date(a.created_at)) * -0.000001;
    const scoreB = b.likes * 2 + (Date.now() - new Date(b.created_at)) * -0.000001;
    return scoreB - scoreA;
  });

  renderFeed();
}

// ================= RENDER =================
function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    const comments = state.commentsMap[p.id] || [];

    div.innerHTML = `
      <div class="post-header">
        <div class="avatar"></div>
        <div>
          <div class="username">@${p.username}</div>
          <div class="time">${new Date(p.created_at).toLocaleString()}</div>
        </div>
      </div>

      <p>${p.content}</p>

      <div class="actions">
        <button class="btn likeBtn" data-id="${p.id}">
          ❤️ ${p.likes}
        </button>
        <button class="btn commentBtn" data-id="${p.id}">
          💬 ${comments.length}
        </button>
      </div>

      <div class="comments">
        ${comments.map(c => `<p>💬 ${c.content}</p>`).join("")}
      </div>
    `;

    feed.appendChild(div);
  });

  document.querySelectorAll(".likeBtn").forEach(btn => {
    btn.onclick = () => like(btn.dataset.id);
  });

  document.querySelectorAll(".commentBtn").forEach(btn => {
    btn.onclick = () => addComment(btn.dataset.id);
  });
}

// ================= LIKE =================
const like = safe(async (postId) => {
  if (!cooldown("like", 1500)) return;

  const key = `${postId}_${state.user.id}`;
  if (state.likesMap[key]) return alert("Already liked");

  await db.from("likes").insert([{
    post_id: postId,
    user_id: state.user.id
  }]);

  loadFeed();
});

// ================= COMMENT =================
const addComment = safe(async (postId) => {
  const text = prompt("Comment:");
  if (!text) return;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);

  loadFeed();
});

// ================= NAV =================
function goHome() { loadFeed(); }

function goProfile() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>${state.profile.username}</h2>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
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
