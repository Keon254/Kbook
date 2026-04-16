// ========================================
// KUDASAI v3 — FIXED CORE ENGINE
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
  isAdmin: false,
  lastEarnTime: 0
};

// ================= SAFE =================
const $ = (id) => document.getElementById(id);

function safe(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error");
    }
  };
}

// ================= AUTH =================
const login = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) {
    return alert("Enter email and password");
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) throw error;

  state.user = data.user;

  await bootstrap();
});

const signup = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) {
    return alert("Fill all fields");
  }

  const { error } = await db.auth.signUp({ email, password });

  if (error) throw error;

  alert("Signup successful. If login fails, disable email confirmation in Supabase.");
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
    const username = "user" + Math.floor(Math.random() * 9999);

    await db.from("profiles").insert([{
      user_id: state.user.id,
      username,
      role: "user",
      balance: 0
    }]);

    state.profile = { username, role: "user", balance: 0 };
    state.balance = 0;
  } else {
    state.profile = data;
    state.balance = data.balance || 0;
    state.isAdmin = data.role === "admin";
  }
}

// ================= FEED =================
async function loadFeed() {
  const { data, error } = await db.from("posts").select("*");

  if (error) return alert(error.message);

  state.posts = (data || []).sort(
    (a, b) => (b.likes || 0) - (a.likes || 0)
  );

  renderFeed();
}

function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${p.content}</p>
      <button class="likeBtn" data-id="${p.id}">❤️</button>
    `;

    feed.appendChild(div);
  });

  document.querySelectorAll(".likeBtn").forEach(btn => {
    btn.onclick = () => like(btn.dataset.id);
  });
}

// ================= LIKE =================
const like = safe(async (id) => {
  if (!state.user) return alert("Login first");

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
});

// ================= TASK SYSTEM =================
function goTasks() {
  const feed = $("feed");

  feed.innerHTML = `
    <div class="panel">
      <h2>Earn K Currency</h2>

      <button id="taskAd">Watch Ad (+K50)</button>
      <button id="taskSurvey">Survey (+K100)</button>

      <p>Your Balance: <b>K${state.balance}</b></p>
    </div>
  `;

  $("taskAd").onclick = watchAd;
  $("taskSurvey").onclick = doSurvey;
}

// 🛡️ ANTI-CHEAT
function canEarn() {
  const now = Date.now();
  if (now - state.lastEarnTime < 10000) {
    alert("Wait 10 seconds");
    return false;
  }
  state.lastEarnTime = now;
  return true;
}

// 💰 TASKS
const watchAd = safe(async () => {
  if (!canEarn()) return;

  await updateBalance(50);
  alert("+K50");
  goTasks();
});

const doSurvey = safe(async () => {
  if (!canEarn()) return;

  await updateBalance(100);
  alert("+K100");
  goTasks();
});

// ================= WALLET =================
async function updateBalance(amount) {
  state.balance += amount;

  await db
    .from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);
}

// ================= PROFILE =================
function goProfile() {
  const feed = $("feed");

  feed.innerHTML = `
    <div class="panel">
      <h2>${state.profile?.username || "User"}</h2>
      <p>Balance: K${state.balance}</p>
      <p>Role: ${state.profile?.role || "user"}</p>
    </div>
  `;
}

// ================= ADMIN =================
function goAdmin() {
  if (!state.isAdmin) return alert("Not admin");

  $("feed").innerHTML = `
    <div class="panel">
      <h2>Admin</h2>
      <button id="resetMoney">Reset Balances</button>
    </div>
  `;

  $("resetMoney").onclick = resetEconomy;
}

const resetEconomy = safe(async () => {
  await db.from("profiles").update({ balance: 0 });
  alert("All balances reset");
});

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
  $("loginBtn").onclick = login;     // ✅ FIXED
  $("signupBtn").onclick = signup;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
