// ========================================
// KUDASAI FULL LOCKDOWN CLIENT v2 (STABLE)
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

// ================= STATE =================
const state = {
  user: null,
  profile: null,
  posts: [],
  earnings: 0,
  isAdmin: false
};

// ================= SAFE DOM =================
const $ = (id) => document.getElementById(id);

const el = {
  email: () => $("email"),
  password: () => $("password"),
  feed: () => $("feed")
};

// ================= SAFE EXEC =================
async function safe(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    alert(err.message || "Something broke");
  }
}

// ================= GUARDS =================
function requireUser() {
  if (!state.user) throw new Error("Login required");
}

function requireAdmin() {
  if (!state.isAdmin) throw new Error("Admin only");
}

// ================= AUTH =================
async function login() {
  safe(async () => {
    const email = el.email()?.value?.trim();
    const password = el.password()?.value?.trim();

    if (!email || !password) throw new Error("Missing fields");

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    state.user = data.user;

    await bootstrap();
  });
}

async function signup() {
  safe(async () => {
    const email = el.email()?.value?.trim();
    const password = el.password()?.value?.trim();

    const { error } = await db.auth.signUp({ email, password });

    if (error) throw error;

    alert("Check email to confirm account");
  });
}

// ================= BOOTSTRAP =================
async function bootstrap() {
  await loadProfile();
  showApp();
  await loadFeed();
}

// ================= PROFILE =================
async function loadProfile() {
  requireUser();

  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (!data) {
    const username = "user" + Math.floor(Math.random() * 9999);

    await db.from("profiles").insert([{
      user_id: state.user.id,
      username,
      role: "user",
      bio: ""
    }]);

    state.profile = { username, role: "user", bio: "" };
  } else {
    state.profile = data;
    state.isAdmin = data.role === "admin";
  }
}

// ================= FEED =================
async function loadFeed() {
  safe(async () => {
    const { data, error } = await db.from("posts").select("*");

    if (error) throw error;

    state.posts = (data || []).sort(
      (a, b) => (b.likes || 0) - (a.likes || 0)
    );

    renderFeed();
  });
}

function renderFeed() {
  const feed = el.feed();
  if (!feed) return;

  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${p.content}</p>
      <button data-id="${p.id}" class="likeBtn">❤️</button>
    `;

    feed.appendChild(div);
  });

  document.querySelectorAll(".likeBtn").forEach(btn => {
    btn.onclick = () => like(btn.dataset.id);
  });
}

// ================= LIKE =================
async function like(postId) {
  safe(async () => {
    requireUser();

    await db.from("likes").insert([{
      post_id: postId,
      user_id: state.user.id
    }]);

    loadFeed();
  });
}

// ================= PROFILE UI =================
function goProfile() {
  const feed = el.feed();

  feed.innerHTML = `
    <div class="panel">
      <h2>Profile</h2>
      <p>${state.profile?.username || ""}</p>
      <p>${state.profile?.bio || ""}</p>
      <p>Role: ${state.profile?.role || "user"}</p>
    </div>
  `;
}

// ================= EARN =================
function goEarn() {
  const feed = el.feed();

  feed.innerHTML = `
    <div class="panel">
      <h2>Earn System</h2>
      <button id="earnBtn">Test Earn</button>
      <p>K${state.earnings}</p>
    </div>
  `;

  $("earnBtn").onclick = fakeEarn;
}

function fakeEarn() {
  state.earnings += 10;
  alert("Temporary (not secure yet)");
}

// ================= ADMIN =================
function goAdmin() {
  try {
    requireAdmin();

    el.feed().innerHTML = `
      <div class="panel">
        <h2>Admin Panel</h2>
        <button id="usersBtn">Users</button>
      </div>
    `;

    $("usersBtn").onclick = adminUsers;

  } catch (err) {
    alert(err.message);
  }
}

async function adminUsers() {
  safe(async () => {
    requireAdmin();

    const { data } = await db.from("profiles").select("*");

    const feed = el.feed();
    feed.innerHTML = "<h2>Users</h2>";

    (data || []).forEach(u => {
      const div = document.createElement("div");
      div.innerHTML = `<p>${u.username} (${u.role})</p>`;
      feed.appendChild(div);
    });
  });
}

// ================= NAV =================
function goHome() {
  loadFeed();
}

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  $("loginEmailBtn").onclick = login;
  $("signupBtn").onclick = signup;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
