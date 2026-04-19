// ========================================
// KUDASAI STAGE 12 — FULL ENGINE
// COMMENTS + WALLET + VIRAL + UI SAFE
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
  comments: {},
  balance: 0,
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
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
  await loadFeed();
  startRealtime();
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  state.profile = data || {};
  state.balance = data?.balance || 0;

  $("userTag").textContent = data?.username || "User";
}

// ================= CREATE POST =================
async function createPost() {
  if (!cooldown("post", 2000)) return;

  const content = $("postInput").value.trim();
  if (!content) return;

  await db.from("posts").insert([{
    content,
    user_id: state.user.id
  }]);

  $("postInput").value = "";
}

// ================= LOAD FEED =================
async function loadFeed() {
  const { data } = await db.from("posts").select(`
    *,
    profiles(username),
    comments(*)
  `);

  if (!data) return;

  state.posts = data.sort((a, b) => {
    const scoreA = (a.likes_count || 0) * 5 - (Date.now() - new Date(a.created_at)) * 0.0001;
    const scoreB = (b.likes_count || 0) * 5 - (Date.now() - new Date(b.created_at)) * 0.0001;
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

    const commentsHTML = (p.comments || [])
      .slice(0, 3)
      .map(c => `<div class="comment">${c.content}</div>`)
      .join("");

    div.innerHTML = `
      <b>@${p.profiles?.username || "user"}</b>
      <p>${p.content}</p>

      <button onclick="like('${p.id}')">
        ❤️ ${p.likes_count || 0}
      </button>

      <div class="comments">${commentsHTML}</div>

      <input placeholder="Write comment..." id="c-${p.id}">
      <button onclick="addComment('${p.id}')">Send</button>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
async function like(id) {
  if (!cooldown("like", 1500)) return;

  const { error } = await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  if (error && error.code !== "23505") {
    alert(error.message);
  }
}

// ================= COMMENTS =================
async function addComment(postId) {
  const input = $(`c-${postId}`);
  const content = input.value.trim();

  if (!content) return;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content
  }]);

  input.value = "";
}

// ================= WALLET =================
async function earn(amount = 10) {
  if (!cooldown("earn", 10000)) return;

  // transaction first (ANTI-CHEAT)
  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount,
    type: "earn"
  }]);

  // then update balance
  state.balance += amount;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  alert(`+K${amount}`);
}

// ================= TASK PAGE =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="panel">
      <h2>Earn</h2>
      <button onclick="earn(10)">Task (+K10)</button>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="panel">
      <h2>${state.profile.username || "User"}</h2>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

// ================= REALTIME =================
function startRealtime() {
  db.channel("live")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, loadFeed)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, loadFeed)
    .subscribe();
}

// ================= NAV =================
function goHome() { loadFeed(); }

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
