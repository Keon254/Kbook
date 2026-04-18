// ========================================
// KUDASAI — STAGE 4 PART 1 (ANTI-CHEAT CORE)
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
  balance: 0,
  lastAction: {}
};

// ================= UTIL =================
const $ = id => document.getElementById(id);

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m]));
}

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
async function login() {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  state.user = data.user;
  await bootstrap();
}

async function signup() {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { error } = await db.auth.signUp({ email, password });
  if (error) return alert(error.message);

  alert("Signup success");
}

// ================= BOOT =================
async function bootstrap() {
  await loadProfile();
  showApp();
  loadFeed();
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
      balance: 0
    }]);

    state.profile = { username, balance: 0 };
  } else {
    state.profile = data;
    state.balance = data.balance || 0;
  }

  $("userTag").textContent = state.profile.username;
}

// ================= POSTS =================
async function createPost() {
  if (!cooldown("post", 3000)) return;

  const text = $("postInput").value.trim();
  if (!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  $("postInput").value = "";
  loadFeed();
}

async function loadFeed() {
  const { data } = await db.from("posts").select("*");

  state.posts = (data || []).sort((a,b)=>{
    const scoreA = (a.likes || 0) + new Date(a.created_at).getTime()/10000000;
    const scoreB = (b.likes || 0) + new Date(b.created_at).getTime()/10000000;
    return scoreB - scoreA;
  });

  renderFeed();
}

function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p=>{
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${escapeHTML(p.user_id)}</b>
      <p>${escapeHTML(p.content)}</p>
      <button onclick="like('${p.id}')">❤️ ${p.likes || 0}</button>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
async function like(id) {
  if (!cooldown("like", 2000)) return;

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
}

// ================= TASK =================
function goTasks() {
  const feed = $("feed");

  feed.innerHTML = `
    <div class="post">
      <h2>Earn</h2>
      <button onclick="earn()">Earn +10</button>
      <p>K${state.balance}</p>
    </div>
  `;
}

async function earn() {
  if (!cooldown("earn", 10000)) return;

  state.balance += 10;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  goTasks();
}

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>${state.profile.username}</h2>
      <p>K${state.balance}</p>
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
