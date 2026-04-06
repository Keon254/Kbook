// ========================================
// KBOOK v4 — CLEAN ARCHITECTURE
// ========================================

// ====== CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== STATE ======
const state = {
  user: null,
  realtime: null,
  loading: false
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
  feed: document.getElementById("feed")
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
    options: {
      redirectTo: location.origin
    }
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

// ====== LOAD POSTS (OPTIMIZED) ======
async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("id, content, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return console.error(error);

  renderPosts(data);
}

// ====== RENDER (FAST + SAFE) ======
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

  // attach delete handlers
  document.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.onclick = () => deletePost(btn.dataset.id);
  });
}

// ====== SECURITY (XSS PROTECTION) ======
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[tag]));
}

// ====== REALTIME (SMART) ======
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
    renderApp();
    await loadPosts();
    subscribeRealtime();
  } else {
    renderAuth();
  }
}

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
