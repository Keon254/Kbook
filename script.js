// ========================================
// KUDASAI GOD MODE ENGINE
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

const state = {
  user: null,
  posts: [],
  profile: null,
  earnings: 0,
  isAdmin: false
};

// ================= AUTH =================
async function login() {
  const { data, error } = await db.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });

  if (error) return alert(error.message);

  state.user = data.user;
  await loadProfile();
  showApp();
  loadFeed();
}

async function signup() {
  await db.auth.signUp({
    email: email.value,
    password: password.value
  });

  alert("Signup done");
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .single();

  if (!data) {
    await db.from("profiles").insert([{
      user_id: state.user.id,
      username: "user" + Math.floor(Math.random()*10000)
    }]);
  } else {
    state.profile = data;
    state.isAdmin = data.username === "admin";
  }
}

// ================= FEED =================
async function loadFeed() {
  const { data } = await db
    .from("posts")
    .select("*");

  // 🧠 VIRAL RANKING
  state.posts = data.sort((a,b) => {
    return (b.likes || 0) - (a.likes || 0);
  });

  renderFeed();
}

function renderFeed() {
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${p.content}</p>

      <div class="actions">
        <button onclick="like('${p.id}')">❤️</button>
        <button onclick="comment('${p.id}')">💬</button>
      </div>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
async function like(id) {
  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);
  loadFeed();
}

// ================= COMMENT =================
async function comment(id) {
  const text = prompt("Comment:");
  if (!text) return;

  await db.from("comments").insert([{
    post_id: id,
    user_id: state.user.id,
    content: text
  }]);
}

// ================= EARN =================
function goEarn() {
  feed.innerHTML = `
    <div class="panel">
      <h2>Earn</h2>
      <button onclick="watchAd()">Watch Ad (+K50)</button>
      <button onclick="survey()">Survey (+K100)</button>
      <p>Total: K${state.earnings}</p>
    </div>
  `;
}

// 🛡️ Anti-cheat (basic)
let lastEarn = 0;

function watchAd() {
  if (Date.now() - lastEarn < 10000) {
    return alert("Too fast");
  }

  state.earnings += 50;
  lastEarn = Date.now();
  goEarn();
}

function survey() {
  state.earnings += 100;
  goEarn();
}

// ================= PROFILE =================
function goProfile() {
  feed.innerHTML = `
    <div class="panel">
      <h2>${state.profile?.username}</h2>
      <p>Earnings: K${state.earnings}</p>
    </div>
  `;
}

// ================= ADMIN =================
function goAdmin() {
  if (!state.isAdmin) return alert("Not admin");

  feed.innerHTML = `
    <div class="panel">
      <h2>Admin Panel</h2>
      <button onclick="resetEconomy()">Reset Economy</button>
    </div>
  `;
}

function resetEconomy() {
  alert("Economy reset (simulate)");
}

// ================= NAV =================
function goHome() {
  loadFeed();
}

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  document.getElementById("app").style.display = "block";
}

// ================= INIT =================
document.getElementById("loginEmailBtn").onclick = login;
document.getElementById("signupBtn").onclick = signup;
