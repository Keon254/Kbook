// ========================================
// KBOOK v5 — SOCIAL + EARNING CORE
// ========================================

// ====== CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== STATE ======
const state = {
  user: null,
  realtime: null,
  loading: false,
  wallet: {
    balance: 0,
    lastTaskTime: 0
  }
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

const safe = async (fn) => {
  try {
    state.loading = true;
    return await fn();
  } catch (err) {
    console.error(err);
    notify("Something went wrong");
  } finally {
    state.loading = false;
  }
};

// ====== LOCAL USER (GUEST MODE) ======
function getLocalUser() {
  let user = localStorage.getItem("kudasai_user");

  if (!user) {
    user = {
      id: "guest_" + Math.random().toString(36).substr(2, 9),
      balance: 0,
      lastTaskTime: 0
    };
    localStorage.setItem("kudasai_user", JSON.stringify(user));
  }

  return JSON.parse(localStorage.getItem("kudasai_user"));
}

function secureLoadWallet() {
  let data = JSON.parse(localStorage.getItem("kudasai_user"));

  if (!data) return getLocalUser();

  // Anti-cheat (basic)
  if (data.balance > 100000) {
    data.balance = 0;
  }

  return data;
}

// ====== UI CONTROL ======
function renderAuth() {
  UI.app.style.display = "none";
  UI.logout.style.display = "none";
  UI.signup.style.display = "inline-block";
  UI.loginEmail.style.display = "inline-block";
  UI.loginGoogle.style.display = "inline-block";
}

function renderApp() {
  UI.app.style.display = "block";
  UI.logout.style.display = "inline-block";
  UI.signup.style.display = "none";
  UI.loginEmail.style.display = "none";
  UI.loginGoogle.style.display = "none";
}

// ====== BALANCE ======
function renderBalance() {
  if (UI.balance) {
    UI.balance.innerText = "K" + (state.wallet.balance || 0);
  }
}

// ====== AUTH ======
async function signup() {
  const email = UI.email.value.trim();
  const password = UI.password.value.trim();

  if (!email || !password) return notify("Enter email & password");

  await safe(async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    notify("Check your email");
  });
}

async function loginEmail() {
  const email = UI.email.value.trim();
  const password = UI.password.value.trim();

  if (!email || !password) return notify("Enter email & password");

  await safe(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  });
}

async function loginGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin }
  });
}

async function logout() {
  await supabase.auth.signOut();
  location.reload();
}

// ====== POSTS ======
async function createPost() {
  const text = UI.postInput.value.trim();
  if (!text || !state.user) return;

  await safe(async () => {
    const { error } = await supabase.from("posts").insert([{
      content: text,
      user_id: state.user.id
    }]);

    if (error) throw error;

    UI.postInput.value = "";
  });
}

async function deletePost(id) {
  await safe(async () => {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) throw error;
  });
}

// ====== LOAD POSTS ======
async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return console.error(error);

  renderPosts(data);
}

// ====== RENDER POSTS ======
function renderPosts(posts) {
  UI.feed.innerHTML = "";

  const fragment = document.createDocumentFragment();

  posts.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";

    const isOwner = state.user?.id === post.user_id;

    div.innerHTML = `
      <h4>${post.user_id}</h4>
      <p>${escapeHTML(post.content)}</p>
      <small>${new Date(post.created_at).toLocaleString()}</small>
      ${isOwner ? `<button data-id="${post.id}" class="deleteBtn">Delete</button>` : ""}
    `;

    fragment.appendChild(div);
  });

  UI.feed.appendChild(fragment);

  document.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.onclick = () => deletePost(btn.dataset.id);
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

// ====== REALTIME ======
function subscribeRealtime() {
  if (state.realtime) return;

  state.realtime = supabase
    .channel("posts-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      debounce(loadPosts, 500)
    )
    .subscribe();
}

// ====== TASK SYSTEM ======
const TASKS = [
  { id: 1, title: "Watch Ad", reward: 20, cooldown: 60 },
  { id: 2, title: "Quick Survey", reward: 100, cooldown: 300 },
  { id: 3, title: "Install App", reward: 300, cooldown: 600 }
];

function renderTasks() {
  UI.feed.innerHTML = "";

  TASKS.forEach(task => {
    const btn = document.createElement("button");
    btn.innerText = `${task.title} (K${task.reward})`;

    btn.onclick = () => completeTask(task);

    UI.feed.appendChild(btn);
  });
}

function completeTask(task) {
  const now = Date.now();

  if (now - state.wallet.lastTaskTime < task.cooldown * 1000) {
    return notify("Wait before next task");
  }

  state.wallet.balance += task.reward;
  state.wallet.lastTaskTime = now;

  localStorage.setItem("kudasai_user", JSON.stringify(state.wallet));

  renderBalance();
  notify(`Earned K${task.reward}`);
}

// ====== NAVIGATION ======
function goHome() {
  loadPosts();
}

function goTasks() {
  renderTasks();
}

// ====== PERFORMANCE ======
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// ====== INIT ======
async function init() {
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    state.user = data.session.user;
    state.wallet = secureLoadWallet();

    renderApp();
    await loadPosts();
    subscribeRealtime();
    renderBalance();
  } else {
    state.user = getLocalUser();
    state.wallet = state.user;

    renderApp(); // allow guest
    renderBalance();
  }
}

// ====== AUTH LISTENER ======
supabase.auth.onAuthStateChange((_, session) => {
  if (session) {
    state.user = session.user;
    renderApp();
    loadPosts();
    subscribeRealtime();
  } else {
    state.user = null;
    renderAuth();
  }
});

// ====== EVENTS ======
UI.signup.onclick = signup;
UI.loginEmail.onclick = loginEmail;
UI.loginGoogle.onclick = loginGoogle;
UI.logout.onclick = logout;
UI.postBtn.onclick = createPost;

// ====== START ======
init();
