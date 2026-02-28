// ========================================
// KBOOK v2 – PRODUCTION READY
// ========================================

// ===============================
// SUPABASE CONFIG
// ===============================
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"; // keep your real key

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ===============================
// DOM ELEMENTS (SAFE LOAD)
// ===============================
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const app = document.getElementById("app");
const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

let currentUser = null;
let realtimeChannel = null;

// ========================================
// UI STATE MANAGEMENT
// ========================================
function showApp() {
  app.style.display = "block";
  loginBtn.style.display = "none";
  logoutBtn.style.display = "inline-block";
}

function showLogin() {
  app.style.display = "none";
  loginBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
}

// ========================================
// GOOGLE LOGIN
// ========================================
loginBtn?.addEventListener("click", async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://keon254.github.io/Kbook"
    }
  });

  if (error) console.error("Login Error:", error.message);
});

// ========================================
// LOGOUT
// ========================================
logoutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

// ========================================
// SESSION CHECK ON PAGE LOAD
// ========================================
async function initializeAuth() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Session Error:", error.message);
    return;
  }

  if (data.session) {
    currentUser = data.session.user;
    showApp();
    loadPosts();
    subscribeToPosts();
  } else {
    showLogin();
  }
}

initializeAuth();

// ========================================
// AUTH STATE LISTENER
// ========================================
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    currentUser = session.user;
    showApp();
    loadPosts();
    subscribeToPosts();
  } else {
    currentUser = null;
    showLogin();
  }
});

// ========================================
// CREATE POST
// ========================================
postBtn?.addEventListener("click", async () => {
  const text = postInput.value.trim();
  if (!text || !currentUser) return;

  const { error } = await supabase.from("posts").insert([
    {
      content: text,
      user_id: currentUser.id
    }
  ]);

  if (error) {
    console.error("Post Error:", error.message);
    return;
  }

  postInput.value = "";
});

// ========================================
// LOAD POSTS
// ========================================
async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load Error:", error.message);
    return;
  }

  renderPosts(data);
}

// ========================================
// RENDER POSTS
// ========================================
function renderPosts(posts) {
  feed.innerHTML = "";

  posts.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <h4>${post.user_id}</h4>
      <p>${post.content}</p>
      <small>${new Date(post.created_at).toLocaleString()}</small>
    `;

    feed.appendChild(div);
  });
}

// ========================================
// REALTIME SUBSCRIPTION
// ========================================
function subscribeToPosts() {
  if (realtimeChannel) return;

  realtimeChannel = supabase
    .channel("posts-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => {
        loadPosts();
      }
    )
    .subscribe();
}
