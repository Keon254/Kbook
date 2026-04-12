// ========================================
// KUDASAI GOD MODE ENGINE (STABLE PATCH v2)
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

// ================= STATE =================
const state = {
  user: null,
  posts: [],
  profile: null,
  earnings: 0,
  isAdmin: false
};

// ================= SAFE DOM =================
const $ = (id) => document.getElementById(id);

const getEmail = () => $("email");
const getPassword = () => $("password");
const getFeed = () => $("feed");

// ================= SAFETY WRAPPER =================
function safe(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      alert(e.message || "Unexpected error");
    }
  };
}

// ================= AUTH =================
const login = safe(async () => {
  const email = getEmail()?.value?.trim();
  const password = getPassword()?.value?.trim();

  if (!email || !password) return alert("Enter email and password");

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) return alert(error.message);

  state.user = data.user;

  await loadProfile();
  showApp();
  await loadFeed();
});

const signup = safe(async () => {
  const email = getEmail()?.value?.trim();
  const password = getPassword()?.value?.trim();

  if (!email || !password) return alert("Fill all fields");

  const { error } = await db.auth.signUp({ email, password });

  if (error) return alert(error.message);

  alert("Signup successful. Now login.");
});

// ================= PROFILE =================
const loadProfile = safe(async () => {
  if (!state.user) return;

  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (!data) {
    const username = "user" + Math.floor(Math.random() * 10000);

    await db.from("profiles").insert([{
      user_id: state.user.id,
      username,
      role: "user"
    }]);

    state.profile = { username, role: "user" };
  } else {
    state.profile = data;
    state.isAdmin = data.role === "admin";
  }
});

// ================= FEED =================
const loadFeed = safe(async () => {
  const { data, error } = await db.from("posts").select("*");

  if (error) return alert(error.message);

  state.posts = (data || []).sort(
    (a, b) => (b.likes || 0) - (a.likes || 0)
  );

  renderFeed();
});

function renderFeed() {
  const feed = getFeed();
  if (!feed) return;

  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id || "unknown"}</b>
      <p>${p.content || ""}</p>

      <div class="actions">
        <button onclick="like('${p.id}')">❤️</button>
        <button onclick="comment('${p.id}')">💬</button>
      </div>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
const like = safe(async (id) => {
  if (!state.user) return alert("Login first");

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
});

// ================= COMMENT =================
const comment = safe(async (id) => {
  const text = prompt("Comment:");
  if (!text) return;

  await db.from("comments").insert([{
    post_id: id,
    user_id: state.user.id,
    content: text
  }]);
});

// ================= PROFILE UI =================
function goProfile() {
  const feed = getFeed();
  if (!feed) return;

  feed.innerHTML = `
    <div class="panel">
      <h2>Profile</h2>

      <input id="usernameInput" value="${state.profile?.username || ""}" />
      <input id="bioInput" value="${state.profile?.bio || ""}" />

      <button onclick="updateProfile()">Save</button>

      <hr>

      <p>Username: ${state.profile?.username || "N/A"}</p>
      <p>Role: ${state.profile?.role || "user"}</p>
      <p>Earnings: K${state.earnings}</p>
    </div>
  `;
}

const updateProfile = safe(async () => {
  const username = $("usernameInput")?.value;
  const bio = $("bioInput")?.value;

  await db
    .from("profiles")
    .update({ username, bio })
    .eq("user_id", state.user.id);

  state.profile.username = username;
  state.profile.bio = bio;

  alert("Profile updated ✔");
});

// ================= EARN =================
function goEarn() {
  const feed = getFeed();
  if (!feed) return;

  feed.innerHTML = `
    <div class="panel">
      <h2>Earn</h2>
      <button onclick="watchAd()">Watch Ad (+K50)</button>
      <button onclick="survey()">Survey (+K100)</button>
      <p>Total: K${state.earnings}</p>
    </div>
  `;
}

let lastEarn = 0;

function watchAd() {
  if (Date.now() - lastEarn < 10000) return alert("Too fast");

  state.earnings += 50;
  lastEarn = Date.now();

  logTransaction(50, "ad");
  goEarn();
}

function survey() {
  state.earnings += 100;
  logTransaction(100, "survey");
  goEarn();
}

// ================= TRANSACTIONS =================
async function logTransaction(amount, type) {
  if (!state.user) return;

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount,
    type
  }]);
}

// ================= ADMIN =================
function goAdmin() {
  if (!state.isAdmin) return alert("Not admin");

  const feed = getFeed();
  if (!feed) return;

  feed.innerHTML = `
    <div class="panel">
      <h2>Admin Dashboard</h2>

      <button onclick="adminUsers()">Users</button>
      <button onclick="adminTransactions()">Transactions</button>
      <button onclick="adminGiveMoney()">Give Money</button>
    </div>
  `;
}

const adminUsers = safe(async () => {
  const feed = getFeed();

  const { data } = await db.from("profiles").select("*");

  feed.innerHTML = "<h2>Users</h2>";

  (data || []).forEach(u => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>${u.username} (${u.role})</p>
      <button onclick="banUser('${u.user_id}')">Ban</button>
      <button onclick="makeAdmin('${u.user_id}')">Admin</button>
    `;

    feed.appendChild(div);
  });
});

const banUser = safe(async (id) => {
  await db.from("profiles").update({ role: "banned" }).eq("user_id", id);
  alert("Banned");
});

const makeAdmin = safe(async (id) => {
  await db.from("profiles").update({ role: "admin" }).eq("user_id", id);
  alert("Admin granted");
});

const adminTransactions = safe(async () => {
  const feed = getFeed();

  const { data } = await db
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  feed.innerHTML = "<h2>Transactions</h2>";

  (data || []).forEach(t => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>${t.type} | K${t.amount}</p>
      <small>${t.created_at}</small>
    `;

    feed.appendChild(div);
  });
});

// ================= NAV =================
function goHome() {
  loadFeed();
}

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "block";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  $("loginEmailBtn").onclick = login;
  $("signupBtn").onclick = signup;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;

    await loadProfile();
    showApp();
    await loadFeed();
  }
});
