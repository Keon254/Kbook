// ========================================
// KUDASAI v7 — CLEAN UI + AUTH FIXED
// ========================================

// ====== CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== STATE ======
const state = {
  user: null,
  wallet: { balance: 0 }
};

// ====== ELEMENTS ======
const UI = {
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  signup: document.getElementById("signupBtn"),
  loginEmail: document.getElementById("loginEmailBtn"),
  logout: document.getElementById("logoutBtn"),
  app: document.getElementById("app"),
  postBtn: document.getElementById("postBtn"),
  postInput: document.getElementById("postInput"),
  feed: document.getElementById("feed"),
  balance: document.getElementById("balance")
};

// ====== UTIL ======
function notify(msg) {
  alert(msg);
  console.log(msg);
}

// ====== UI CONTROL ======
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

  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  console.log("SIGNUP:", data, error);

  if (error) {
    notify(error.message);
    return;
  }

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

  console.log("LOGIN:", data, error);

  if (error) {
    notify(error.message);
    return;
  }

  state.user = data.user;

  showApp();           // ✅ hides auth completely
  await loadWallet();  // load money
  await loadPosts();   // load feed
}

async function logout() {
  await db.auth.signOut();
  location.reload();
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

  renderBalance();
}

function renderBalance() {
  UI.balance.innerText = "K" + state.wallet.balance;
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
  loadPosts();
}

async function loadPosts() {
  const { data } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  UI.feed.innerHTML = "";

  data.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <p>${escapeHTML(post.content)}</p>
    `;

    UI.feed.appendChild(div);
  });
}

// ====== SECURITY ======
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[tag]));
}

// ====== NAVIGATION ======
function goHome() {
  loadPosts();
}

function goTasks() {
  UI.feed.innerHTML = "<h3>Tasks coming soon 💰</h3>";
}

// ====== INIT ======
async function init() {
  const { data } = await db.auth.getSession();

  console.log("SESSION:", data);

  if (data.session) {
    state.user = data.session.user;

    showApp();
    await loadWallet();
    await loadPosts();
  } else {
    showAuth();
  }
}

// ====== EVENTS ======
UI.signup.onclick = signup;
UI.loginEmail.onclick = loginEmail;
UI.logout.onclick = logout;
UI.postBtn.onclick = createPost;

// ====== START ======
init();
