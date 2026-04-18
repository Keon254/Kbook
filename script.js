// ========================================
// KUDASAI STAGE 4.5 — STABLE ENGINE
// (UPGRADED, NOT DOWNGRADED)
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

// ================= HELPERS =================
const $ = id => document.getElementById(id);

function safeAsync(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(err);
      alert(err.message || "Something broke");
    }
  };
}

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
const login = safeAsync(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) return alert("Fill all fields");

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safeAsync(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { error } = await db.auth.signUp({ email, password });
  if (error) throw error;

  alert("Signup successful");
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

  // 🔥 FIX: ensure profile always exists
  if (!data) {
    const username = "user" + Math.floor(Math.random() * 9999);

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
const createPost = safeAsync(async () => {
  if (!cooldown("post", 3000)) return;

  const text = $("postInput").value.trim();
  if (!text) return;

  const { error } = await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  if (error) throw error;

  $("postInput").value = "";
  await loadFeed();
});

async function loadFeed() {
  const { data, error } = await db.from("posts").select("*");

  if (error) return alert(error.message);

  // 🔥 FIXED VIRAL LOGIC
  state.posts = (data || []).sort((a, b) => {
    const scoreA = (a.likes || 0) + new Date(a.created_at).getTime() / 10000000;
    const scoreB = (b.likes || 0) + new Date(b.created_at).getTime() / 10000000;
    return scoreB - scoreA;
  });

  renderFeed();
}

function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <div class="post-header">
        <div class="avatar"></div>
        <div>
          <div class="username">${p.user_id}</div>
          <div class="time">${new Date(p.created_at).toLocaleString()}</div>
        </div>
      </div>

      <p>${p.content}</p>

      <div class="actions">
        <button class="btn likeBtn" data-id="${p.id}">
          ❤️ ${p.likes || 0}
        </button>
      </div>
    `;

    feed.appendChild(div);
  });

  document.querySelectorAll(".likeBtn").forEach(btn => {
    btn.onclick = () => like(btn.dataset.id);
  });
}

// ================= LIKE =================
const like = safeAsync(async (id) => {
  if (!cooldown("like", 2000)) return;

  const { error } = await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  if (error) throw error;

  await loadFeed();
});

// ================= EARN =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>Earn System</h2>
      <button class="btn" id="earnBtn">Complete Task (+K10)</button>
      <p><b>Balance:</b> K${state.balance}</p>
    </div>
  `;

  $("earnBtn").onclick = earn;
}

const earn = safeAsync(async () => {
  if (!cooldown("earn", 15000)) return;

  const amount = 10;

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount,
    type: "task",
    status: "completed"
  }]);

  const newBalance = state.balance + amount;

  await db.from("profiles")
    .update({ balance: newBalance })
    .eq("user_id", state.user.id);

  state.balance = newBalance;

  goTasks();
});

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="post profile">
      <div class="avatar"></div>
      <h2>${state.profile.username}</h2>
      <p>Balance: K${state.balance}</p>
      <p>Role: ${state.profile.role}</p>
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
