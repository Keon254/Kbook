// ========================================
// KUDASAI v9 — ULTRA SOCIAL UPGRADE
// Likes + Comments + Profiles + Trending Feed
// ========================================

// ====== CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== STATE ======
const state = {
  user: null,
  wallet: { balance: 0 },
  likesMap: {},   // postId -> count
  userLikes: {}   // postId -> true/false
};

// ====== UI ======
const UI = {
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  signup: document.getElementById("signupBtn"),
  loginEmail: document.getElementById("loginEmailBtn"),

  app: document.getElementById("app"),
  postBtn: document.getElementById("postBtn"),
  postInput: document.getElementById("postInput"),
  feed: document.getElementById("feed"),
  balance: document.getElementById("balance")
};

// ====== HELPERS ======
function notify(msg) {
  alert(msg);
  console.log(msg);
}

function escapeHTML(str) {
  return str.replace(/[&<>"']/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[tag]));
}

// ====== AUTH UI ======
function showAuth() {
  document.querySelector(".auth").style.display = "flex";
  UI.app.style.display = "none";
}

function showApp() {
  document.querySelector(".auth").style.display = "none";
  UI.app.style.display = "block";
}

// ====== AUTH ======
async function signup() {
  const email = UI.email.value.trim();
  const password = UI.password.value.trim();

  if (!email || !password) return notify("Enter email & password");

  const { error } = await db.auth.signUp({ email, password });
  if (error) return notify(error.message);

  notify("Signup successful. Now login.");
}

async function loginEmail() {
  const email = UI.email.value.trim();
  const password = UI.password.value.trim();

  if (!email || !password) return notify("Enter email & password");

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) return notify(error.message);

  state.user = data.user;

  await ensureProfile();
  showApp();

  await loadWallet();
  await loadLikes();
  await loadPosts();
}

// ====== PROFILE SYSTEM ======
async function ensureProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .single();

  if (!data) {
    await db.from("profiles").insert([{
      id: state.user.id,
      username: "user_" + Math.floor(Math.random() * 9999)
    }]);
  }
}

// ====== WALLET ======
async function loadWallet() {
  const { data } = await db
    .from("wallets")
    .select("*")
    .eq("user_id", state.user.id)
    .single();

  if (!data) {
    await db.from("wallets").insert([{
      user_id: state.user.id,
      balance: 0
    }]);

    state.wallet.balance = 0;
  } else {
    state.wallet.balance = data.balance;
  }

  UI.balance.innerText = "K" + state.wallet.balance;
}

// ====== LIKES SYSTEM ======
async function loadLikes() {
  const { data } = await db.from("likes").select("*");

  state.likesMap = {};
  state.userLikes = {};

  data.forEach(like => {
    state.likesMap[like.post_id] =
      (state.likesMap[like.post_id] || 0) + 1;

    if (like.user_id === state.user.id) {
      state.userLikes[like.post_id] = true;
    }
  });
}

async function toggleLike(postId) {
  const alreadyLiked = state.userLikes[postId];

  if (alreadyLiked) {
    await db
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", state.user.id);

    state.userLikes[postId] = false;
    state.likesMap[postId]--;
  } else {
    await db.from("likes").insert([{
      post_id: postId,
      user_id: state.user.id
    }]);

    state.userLikes[postId] = true;
    state.likesMap[postId] = (state.likesMap[postId] || 0) + 1;
  }

  loadPosts();
}

// ====== COMMENTS ======
async function addComment(postId) {
  const text = prompt("Write comment:");
  if (!text) return;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);

  notify("Comment added");
}

async function getComments(postId) {
  const { data } = await db
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  return data || [];
}

// ====== POSTS ======
async function createPost() {
  const text = UI.postInput.value.trim();
  if (!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  UI.postInput.value = "";

  await refreshFeed();
}

async function loadPosts() {
  await refreshFeed();
}

async function refreshFeed() {
  const { data: posts } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  UI.feed.innerHTML = "";

  // 🔥 TRENDING SORT (likes priority)
  posts.sort((a, b) => {
    const likesA = state.likesMap[a.id] || 0;
    const likesB = state.likesMap[b.id] || 0;

    if (likesB === likesA) {
      return new Date(b.created_at) - new Date(a.created_at);
    }

    return likesB - likesA;
  });

  for (const post of posts) {
    const likes = state.likesMap[post.id] || 0;
    const liked = state.userLikes[post.id];

    const comments = await getComments(post.id);

    const div = document.createElement("div");
    div.className = "post glass";

    div.innerHTML = `
      <p>${escapeHTML(post.content)}</p>

      <div style="display:flex;gap:10px;margin-top:10px;">
        <button onclick="toggleLike('${post.id}')">
          ❤️ ${likes} ${liked ? "✓" : ""}
        </button>

        <button onclick="addComment('${post.id}')">
          💬 ${comments.length}
        </button>
      </div>
    `;

    UI.feed.appendChild(div);
  }
}

// ====== NAV ======
function goHome() {
  loadPosts();
}

function goTasks() {
  UI.feed.innerHTML = "<h3>Tasks coming soon 💰</h3>";
}

// ====== INIT ======
async function init() {
  const { data } = await db.auth.getSession();

  if (data.session) {
    state.user = data.session.user;

    await ensureProfile();
    showApp();

    await loadWallet();
    await loadLikes();
    await loadPosts();
  } else {
    showAuth();
  }
}

// ====== EVENTS ======
UI.signup.onclick = signup;
UI.loginEmail.onclick = loginEmail;
UI.postBtn.onclick = createPost;

// ====== START ======
init();
