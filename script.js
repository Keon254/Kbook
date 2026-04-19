// ========================================
// KUDASAI STAGE 11 — VIRAL + USERNAME ENGINE
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
  lastAction: {}
};

const $ = id => document.getElementById(id);

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

  state.profile = data;

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
  const { data, error } = await db
    .from("posts")
    .select(`
      *,
      profiles (username)
    `);

  if (error) return alert(error.message);

  // 🔥 VIRAL ALGO
  state.posts = data.sort((a, b) => {
    const scoreA =
      (a.likes_count || 0) * 5 +
      (Date.now() - new Date(a.created_at).getTime()) * -0.0001;

    const scoreB =
      (b.likes_count || 0) * 5 +
      (Date.now() - new Date(b.created_at).getTime()) * -0.0001;

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

    div.innerHTML = `
      <b>@${p.profiles?.username || "user"}</b>
      <p>${p.content}</p>
      <button onclick="like('${p.id}')">
        ❤️ ${p.likes_count || 0}
      </button>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
async function like(id) {
  if (!cooldown("like", 1500)) return;

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);
}

// ================= REALTIME =================
function startRealtime() {
  db.channel("live-feed")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadFeed()
    )
    .subscribe();
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
