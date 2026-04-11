// ========================================
// KUDASAI — AUTH FIXED + DEBUG VERSION
// ========================================

// ====== CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

// ✅ Correct v2 init
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
  console.log("INFO:", msg);
}

// ====== UI CONTROL ======
function showAuth() {
  UI.app.style.display = "none";
  UI.logout.style.display = "none";
}

function showApp() {
  UI.app.style.display = "block";
  UI.logout.style.display = "inline-block";
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
    notify(error.message); // 🔥 shows REAL issue
    return;
  }

  state.user = data.user;
  showApp();
  loadPosts();
  loadWallet();
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

  data.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `<p>${p.content}</p>`;
    UI.feed.appendChild(div);
  });
}

// ====== INIT ======
async function init() {
  const { data } = await db.auth.getSession();

  console.log("SESSION:", data);

  if (data.session) {
    state.user = data.session.user;
    showApp();
    loadPosts();
    loadWallet();
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
