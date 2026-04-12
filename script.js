// ========================================
// KUDASAI v12 — ULTRA ENGINE MERGED
// ========================================

const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ========================
// STATE
// ========================
const state = {
  user: null,
  posts: [],
  likes: {},
  comments: {}
};

// ========================
// UI
// ========================
const UI = {
  email: () => document.getElementById("email"),
  password: () => document.getElementById("password"),
  feed: () => document.getElementById("feed"),
  postInput: () => document.getElementById("postInput"),
  app: () => document.getElementById("app")
};

// ========================
// AUTH (UNCHANGED CORE)
// ========================
async function login() {
  const { data, error } = await db.auth.signInWithPassword({
    email: UI.email().value,
    password: UI.password().value
  });

  if (error) return alert(error.message);

  state.user = data.user;
  showApp();
  await bootApp();
}

// ========================
// BOOT
// ========================
async function bootApp() {
  await loadPosts();
}

// ========================
// LOAD EVERYTHING (OPTIMIZED)
// ========================
async function loadPosts() {
  const { data } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  state.posts = data || [];

  // 🔥 Load likes in one query
  const { data: likes } = await db.from("likes").select("*");

  state.likes = {};
  likes.forEach(l => {
    if (!state.likes[l.post_id]) state.likes[l.post_id] = 0;
    state.likes[l.post_id]++;
  });

  renderPosts();
}

// ========================
// RENDER
// ========================
function renderPosts() {
  const feed = UI.feed();
  feed.innerHTML = "";

  state.posts.forEach(post => {
    const likeCount = state.likes[post.id] || 0;

    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <p>${escapeHTML(post.content)}</p>
      <div class="actions">
        <button onclick="likePost('${post.id}')">❤️ ${likeCount}</button>
        <button onclick="toggleComments('${post.id}')">💬</button>
      </div>
      <div id="comments-${post.id}"></div>
    `;

    feed.appendChild(div);
  });
}

// ========================
// LIKE SYSTEM
// ========================
async function likePost(postId) {
  if (!state.user) return alert("Login required");

  await db.from("likes").insert([{
    post_id: postId,
    user_id: state.user.id
  }]);

  if (!state.likes[postId]) state.likes[postId] = 0;
  state.likes[postId]++;

  renderPosts();
}

// ========================
// COMMENTS
// ========================
async function toggleComments(postId) {
  const box = document.getElementById(`comments-${postId}`);

  if (box.innerHTML) {
    box.innerHTML = "";
    return;
  }

  const { data } = await db
    .from("comments")
    .select("*")
    .eq("post_id", postId);

  box.innerHTML = `
    <input id="input-${postId}" placeholder="Comment...">
    <button onclick="addComment('${postId}')">Send</button>
  `;

  data.forEach(c => {
    const p = document.createElement("p");
    p.innerText = c.content;
    box.appendChild(p);
  });
}

async function addComment(postId) {
  const input = document.getElementById(`input-${postId}`);

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: input.value
  }]);

  toggleComments(postId);
}

// ========================
// POST
// ========================
async function createPost() {
  const text = UI.postInput().value;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  UI.postInput().value = "";
  loadPosts();
}

// ========================
// UTIL
// ========================
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[s]));
}

// ========================
// UI SWITCH
// ========================
function showApp() {
  UI.app().style.display = "block";
  document.querySelector(".auth").style.display = "none";
}

function showAuth() {
  UI.app().style.display = "none";
  document.querySelector(".auth").style.display = "flex";
}

// ========================
// INIT
// ========================
async function init() {
  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    showApp();
    await bootApp();
  } else {
    showAuth();
  }
}

// ========================
// EVENTS
// ========================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loginEmailBtn").onclick = login;
  document.getElementById("postBtn").onclick = createPost;
  init();
});
