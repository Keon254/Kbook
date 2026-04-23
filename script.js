// ========================================
// KUDASAI FINAL ENGINE v2 (NO DOWNGRADE)
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
    catch (e) {
      console.error(e);
      alert(e.message || "Error occurred");
    }
  };
}

// ================= COOLDOWN =================
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

  if (!email || !password) return alert("Fill all fields");

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) return alert("Fill all fields");

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

  state.profile = data || {
    username: "user",
    balance: 0,
    role: "user"
  };

  state.balance = state.profile.balance || 0;

  $("userTag").textContent = state.profile.username;
}

// 🔥 USERNAME UPDATE (FULL FIX)
const changeUsername = safe(async () => {
  const name = prompt("New username:");
  if (!name) return;

  await db.from("profiles")
    .update({ username: name })
    .eq("user_id", state.user.id);

  state.profile.username = name;
  $("userTag").textContent = name;

  await loadFeed(); // refresh everywhere
});

// ================= LOAD FEED =================
async function loadFeed() {
  $("feed").innerHTML = "<p>Loading...</p>";

  const { data: posts } = await db.from("posts").select("*");
  const { data: profiles } = await db.from("profiles").select("*");

  state.profilesMap = {};
  (profiles || []).forEach(p => state.profilesMap[p.user_id] = p);

  state.posts = (posts || []).map(p => {
    const age = (Date.now() - new Date(p.created_at)) / 1000;

    return {
      ...p,
      score: (p.likes || 0) * 3 + (100000 / (age + 1))
    };
  }).sort((a, b) => b.score - a.score);

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

// ================= LIKE (ANTI-RACE + INSTANT UI) =================
const like = safe(async (id) => {
  if (!cooldown("like", 1000)) return;

  const btn = document.querySelector(`[data-like="${id}"]`);
  if (btn) btn.disabled = true;

  const { data: existing } = await db.from("likes")
    .select("*")
    .eq("post_id", id)
    .eq("user_id", state.user.id);

  if (existing.length) return;

  // 🔥 instant UI update
  const post = state.posts.find(p => p.id === id);
  post.likes = (post.likes || 0) + 1;
  renderFeed();

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  await db.from("posts")
    .update({ likes: post.likes })
    .eq("id", id);
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
      <div class="post-header">
        <div class="avatar"></div>
        <div>
          <div class="username">${user.username || "user"}</div>
          <div class="time">${new Date(p.created_at).toLocaleString()}</div>
        </div>
      </div>

      <p>${p.content}</p>

      <div class="actions">
        <button data-like="${p.id}" onclick="like('${p.id}')">
          ❤️ ${p.likes || 0}
        </button>
        <button onclick="openComments('${p.id}')">💬</button>
      </div>
    `;

    feed.appendChild(div);
  });
}

// ================= COMMENTS =================
const openComments = safe(async (postId) => {
  const { data } = await db.from("comments")
    .select("*")
    .eq("post_id", postId);

  $("feed").innerHTML = `
    <div class="panel">
      <h2>Comments</h2>

      <div class="comment-list">
        ${(data || []).map(c => {
          const user = state.profilesMap[c.user_id] || {};
          return `
            <div class="comment">
              <div class="avatar small"></div>
              <div>
                <b>${user.username || "user"}</b>
                <p>${c.content}</p>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <input id="commentInput" placeholder="Write comment...">
      <button onclick="addComment('${postId}')">Send</button>
    </div>
  `;
});

const addComment = safe(async (postId) => {
  const text = $("commentInput").value.trim();
  if (!text) return;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);

  openComments(postId);
});

// ================= TASKS =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="panel">
      <h2>💰 Earn Hub</h2>

      <div class="task-card">
        <p>Watch Ad (+10)</p>
        <button onclick="earn(10)">Start</button>
      </div>

      <div class="task-card">
        <p>Survey (+20)</p>
        <button onclick="earn(20)">Start</button>
      </div>

      <h3>Balance: K${state.balance}</h3>
    </div>
  `;
}

const earn = safe(async (amount) => {
  if (!cooldown("earn", 8000)) return;

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

      <button onclick="changeUsername()">Edit Username</button>

      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

// ================= EXPLORE =================
function goExplore() {
  const trending = [...state.posts].slice(0, 5);

  $("feed").innerHTML = `
    <div class="panel">
      <h2>🔥 Trending</h2>
      ${trending.map(p => `<p>${p.content}</p>`).join("")}
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
