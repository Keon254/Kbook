// ========================================
// KUDASAI STABLE ENGINE (FINAL CLEAN)
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

async function loadFeed() {
  const { data } = await db.from("posts").select("*");

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
const like = safe(async (id) => {
  if (!cooldown("like", 2000)) return;

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
});

// ================= TASK =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>Earn</h2>
      <button class="btn" onclick="earn()">+K10</button>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

const earn = safe(async () => {
  if (!cooldown("earn", 15000)) return;

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount: 10,
    type: "task",
    status: "completed"
  }]);

  state.balance += 10;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  goTasks();
});

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="post">
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
