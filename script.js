// ========================================
// KUDASAI STAGE 14 — SOCIAL + VIRAL + MONEY
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
  profilesMap: {},
  balance: 0,
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) { alert(e.message); console.error(e); }
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
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async () => {
  const { error } = await db.auth.signUp({
    email: $("email").value,
    password: $("password").value
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

  state.profile = data;
  state.balance = data?.balance || 0;

  $("userTag").textContent = data?.username || "user";
}

// ================= LOAD FEED =================
async function loadFeed() {
  const { data: posts } = await db.from("posts").select("*");
  const { data: profiles } = await db.from("profiles").select("*");

  // map users
  state.profilesMap = {};
  profiles.forEach(p => {
    state.profilesMap[p.user_id] = p;
  });

  state.posts = posts.map(p => {
    const age = (Date.now() - new Date(p.created_at)) / 1000;

    return {
      ...p,
      score: (p.likes || 0) * 3 + (100000 / (age + 1))
    };
  }).sort((a,b)=>b.score-a.score);

  renderFeed();
}

// ================= CREATE POST =================
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
  loadFeed();
});

// ================= RENDER =================
function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const user = state.profilesMap[p.user_id] || {};

    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <div class="post-head">
        <div class="avatar"></div>
        <b>${user.username || "user"}</b>
      </div>

      <p>${p.content}</p>

      <div class="actions">
        <button onclick="like('${p.id}')">❤️ ${p.likes || 0}</button>
        <button onclick="comment('${p.id}')">💬</button>
      </div>
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

// ================= COMMENT =================
const comment = safe(async (id) => {
  const text = prompt("Comment:");
  if (!text) return;

  await db.from("comments").insert([{
    post_id: id,
    user_id: state.user.id,
    content: text
  }]);
});

// ================= TASK SYSTEM =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="panel">
      <h2>Earn</h2>
      <button onclick="earn()">Complete Task (+K10)</button>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

const earn = safe(async () => {
  if (!cooldown("earn", 10000)) return;

  const amount = 10;

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount,
    type: "task"
  }]);

  state.balance += amount;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  goTasks();
});

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="panel">
      <div class="avatar big"></div>
      <h2>${state.profile.username}</h2>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

// ================= NAV =================
function goHome(){ loadFeed(); }

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async ()=>{
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
