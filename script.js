// ========================================
// KUDASAI v11 — STABLE CORE ENGINE
// Error-safe + production-safe structure
// ========================================

const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ========================
// GLOBAL STATE (SAFE)
// ========================
const state = {
  user: null,
  posts: [],
  likes: {},
  loading: false
};

// ========================
// UI CACHE (SAFE ACCESS)
// ========================
const UI = {
  email: () => document.getElementById("email"),
  password: () => document.getElementById("password"),
  feed: () => document.getElementById("feed"),
  postInput: () => document.getElementById("postInput"),
  balance: () => document.getElementById("balance"),
  app: () => document.getElementById("app")
};

// ========================
// SAFE NOTIFY
// ========================
function notify(msg) {
  console.log("[APP]", msg);
  alert(msg);
}

// ========================
// SAFE USER CHECK
// ========================
function requireUser() {
  if (!state.user) {
    notify("User not logged in");
    return false;
  }
  return true;
}

// ========================
// AUTH
// ========================
async function login() {
  try {
    const email = UI.email().value.trim();
    const password = UI.password().value.trim();

    if (!email || !password) {
      return notify("Fill in email + password");
    }

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) return notify(error.message);

    if (!data?.user) {
      return notify("Login failed: no user returned");
    }

    state.user = data.user;

    showApp();
    await bootApp();

  } catch (err) {
    notify("Login crash: " + err.message);
  }
}

async function signup() {
  try {
    const email = UI.email().value.trim();
    const password = UI.password().value.trim();

    const { error } = await db.auth.signUp({
      email,
      password
    });

    if (error) return notify(error.message);

    notify("Signup success. Now login.");
  } catch (err) {
    notify("Signup crash: " + err.message);
  }
}

// ========================
// APP BOOT
// ========================
async function bootApp() {
  try {
    await loadPosts();
  } catch (err) {
    notify("Boot error: " + err.message);
  }
}

// ========================
// POST SYSTEM (FIXED CORE)
// ========================
async function createPost() {
  try {
    if (!requireUser()) return;

    const text = UI.postInput().value.trim();

    if (!text) return notify("Post cannot be empty");

    const { error } = await db.from("posts").insert([
      {
        content: text,
        user_id: state.user.id
      }
    ]);

    if (error) return notify("Post error: " + error.message);

    UI.postInput().value = "";

    await loadPosts();

    notify("Post created ✔");

  } catch (err) {
    notify("CreatePost crash: " + err.message);
  }
}

// ========================
// LOAD POSTS (SAFE RENDER)
// ========================
async function loadPosts() {
  try {
    const { data, error } = await db
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return notify("Load error: " + error.message);

    state.posts = data || [];

    renderPosts();

  } catch (err) {
    notify("LoadPosts crash: " + err.message);
  }
}

// ========================
// RENDER ENGINE (SAFE DOM)
// ========================
function renderPosts() {
  const feed = UI.feed();
  if (!feed) return;

  feed.innerHTML = "";

  if (!state.posts.length) {
    feed.innerHTML = "<p>No posts yet</p>";
    return;
  }

  state.posts.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <p>${escapeHTML(post.content || "")}</p>
      <small>${post.user_id || "unknown"}</small>
    `;

    feed.appendChild(div);
  });
}

// ========================
// SECURITY
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
  const app = UI.app();
  if (app) app.style.display = "block";

  const auth = document.querySelector(".auth");
  if (auth) auth.style.display = "none";
}

function showAuth() {
  const app = UI.app();
  if (app) app.style.display = "none";

  const auth = document.querySelector(".auth");
  if (auth) auth.style.display = "flex";
}

// ========================
// INIT (SAFE START)
// ========================
async function init() {
  try {
    const { data } = await db.auth.getSession();

    if (data?.session?.user) {
      state.user = data.session.user;
      showApp();
      await loadPosts();
    } else {
      showAuth();
    }

  } catch (err) {
    notify("Init error: " + err.message);
  }
}

// ========================
// EVENTS
// ========================
document.addEventListener("DOMContentLoaded", () => {
  const signupBtn = document.getElementById("signupBtn");
  const loginBtn = document.getElementById("loginEmailBtn");
  const postBtn = document.getElementById("postBtn");

  if (signupBtn) signupBtn.onclick = signup;
  if (loginBtn) loginBtn.onclick = login;
  if (postBtn) postBtn.onclick = createPost;

  init();
});
