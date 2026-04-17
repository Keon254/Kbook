// ========================================
// KUDASAI STAGE 1 — CORE ENGINE (FULL)
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

// ===== STATE =====
const state = {
  user: null,
  profile: null,
  posts: [],
  isAdmin: false
};

// ===== SAFE =====
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

// ===== AUTH =====
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

  const { error } = await db.auth.signUp({ email, password });
  if (error) throw error;

  alert("Signup successful");
});

// ===== BOOT =====
async function bootstrap() {
  await loadProfile();
  showApp();
  await loadFeed();

  $("userTag").innerText = state.profile?.username || "";
}

// ===== PROFILE =====
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
      username
    }]);

    state.profile = { username };
  } else {
    state.profile = data;
    state.isAdmin = data.role === "admin";
  }
}

// ===== VIRAL RANK =====
function rankPosts(posts) {
  return posts.sort((a,b) => {
    const scoreA = (a.likes || 0) + timeScore(a.created_at);
    const scoreB = (b.likes || 0) + timeScore(b.created_at);
    return scoreB - scoreA;
  });
}

function timeScore(date) {
  const hours = (Date.now() - new Date(date)) / 3600000;
  return Math.max(0, 24 - hours);
}

// ===== LOAD FEED =====
async function loadFeed() {
  const { data, error } = await db
    .from("posts")
    .select(`*, profiles(username)`);

  if (error) throw error;

  state.posts = rankPosts(data || []);
  renderFeed();
}

// ===== RENDER =====
function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.profiles?.username || "user"}</b>
      <p>${escapeHTML(p.content)}</p>
      <small>${new Date(p.created_at).toLocaleString()}</small>

      <div class="actions">
        <button class="likeBtn" data-id="${p.id}">
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

// ===== CREATE POST =====
const createPost = safe(async () => {
  const content = $("postInput").value.trim();
  if (!content) return alert("Write something");

  await db.from("posts").insert([{
    content,
    user_id: state.user.id,
    likes: 0,
    created_at: new Date()
  }]);

  $("postInput").value = "";
  loadFeed();
});

// ===== LIKE =====
const like = safe(async (id) => {
  const { data: existing } = await db
    .from("likes")
    .select("*")
    .eq("post_id", id)
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (existing) return alert("Already liked");

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  const post = state.posts.find(p => p.id === id);
  await db.from("posts")
    .update({ likes: (post.likes || 0) + 1 })
    .eq("id", id);

  loadFeed();
});

// ===== NAV =====
function goHome(){ loadFeed(); }
function goTasks(){ alert("Next stage"); }
function goProfile(){ alert("Next stage"); }
function goAdmin(){ alert("Admin stage"); }

// ===== UI =====
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ===== SECURITY =====
function escapeHTML(str){
  return str.replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#39;"
  }[m]));
}

// ===== INIT =====
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
