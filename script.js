// ========================================
// KUDASAI STAGE 4 PART 2 — SECURE ENGINE
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

const state = {
  user: null,
  profile: null,
  posts: [],
  balance: 0,
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= ANTI CHEAT =================
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
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) return alert(error.message);

  state.user = data.user;
  await bootstrap();
}

async function signup() {
  await db.auth.signUp({
    email: $("email").value,
    password: $("password").value
  });

  alert("Account created");
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

  state.profile = data;
  state.balance = data?.balance || 0;

  $("userTag").textContent = data?.username;
}

// ================= POSTS =================
async function createPost() {
  if (!cooldown("post", 3000)) return;

  await db.from("posts").insert([{
    content: $("postInput").value,
    user_id: state.user.id
  }]);

  $("postInput").value = "";
  loadFeed();
}

async function loadFeed() {
  const { data } = await db.from("posts").select("*");

  state.posts = data.sort((a,b)=>{
    return (b.likes||0) + new Date(b.created_at) - ((a.likes||0)+ new Date(a.created_at));
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
      <b>${p.user_id}</b>
      <p>${p.content}</p>
      <button class="btn" onclick="like('${p.id}')">❤️ ${p.likes||0}</button>
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

// ================= SECURE EARN =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>Earn System</h2>
      <button class="btn" onclick="earn()">Complete Task (+K10)</button>
      <p class="highlight">Balance: K${state.balance}</p>
    </div>
  `;
}

async function earn() {
  if (!cooldown("earn", 15000)) return;

  const amount = 10;

  // 🔥 record transaction FIRST
  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount,
    type: "task"
  }]);

  // then update balance
  state.balance += amount;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  goTasks();
}

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>${state.profile?.username}</h2>
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
