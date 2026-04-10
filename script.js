// ========================================
// KBOOK v6 — FIXED + STABLE
// ========================================

// ====== CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

// ✅ FIXED INIT
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== STATE ======
const state = {
  user: null,
  realtime: null,
  isAdmin: false,
  wallet: { balance: 0, lastTaskTime: 0 }
};

// ====== ELEMENTS ======
const UI = {
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  signup: document.getElementById("signupBtn"),
  loginEmail: document.getElementById("loginEmailBtn"),
  loginGoogle: document.getElementById("loginBtn"),
  logout: document.getElementById("logoutBtn"),
  app: document.getElementById("app"),
  postBtn: document.getElementById("postBtn"),
  postInput: document.getElementById("postInput"),
  feed: document.getElementById("feed"),
  balance: document.getElementById("balance")
};

// ====== UTIL ======
const notify = (msg) => alert(msg);

// ====== AUTH ======
async function signup() {
  const email = UI.email.value.trim();
  const password = UI.password.value.trim();

  const { error } = await db.auth.signUp({ email, password });

  if (error) return notify(error.message);

  notify("Signup successful — now login");
}

async function loginEmail() {
  const email = UI.email.value.trim();
  const password = UI.password.value.trim();

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) return notify(error.message);
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

// ====== TASKS ======
const TASKS = [
  { title: "Watch Ad", reward: 20 },
  { title: "Survey", reward: 100 }
];

function renderTasks() {
  UI.feed.innerHTML = "";

  TASKS.forEach(t => {
    const btn = document.createElement("button");
    btn.innerText = `${t.title} (K${t.reward})`;

    btn.onclick = () => completeTask(t);

    UI.feed.appendChild(btn);
  });
}

async function completeTask(task) {
  const newBalance = state.wallet.balance + task.reward;

  await db
    .from("wallets")
    .update({ balance: newBalance })
    .eq("user_id", state.user.id);

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount: task.reward,
    type: "task"
  }]);

  state.wallet.balance = newBalance;
  renderBalance();

  notify("Earned K" + task.reward);
}

// ====== NAV ======
function goHome() {
  loadPosts();
}

function goTasks() {
  renderTasks();
}

// ====== INIT ======
async function init() {
  const { data } = await db.auth.getSession();

  if (data.session) {
    state.user = data.session.user;

    await loadWallet();
    await loadPosts();
  }
}

// ====== EVENTS ======
UI.signup.onclick = signup;
UI.loginEmail.onclick = loginEmail;
UI.logout.onclick = logout;
UI.postBtn.onclick = createPost;

init();
