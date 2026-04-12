// ========================================
// KUDASAI GOD MODE ENGINE (STABLE + EXPANDED)
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

// ================= UI HELPERS =================
const get = (id) => document.getElementById(id);
const getFeed = () => get("feed");

// ================= AUTH =================
async function login() {
  const email = get("email").value.trim();
  const password = get("password").value.trim();

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
}

async function signup() {
  const email = get("email").value.trim();
  const password = get("password").value.trim();

  if (!email || !password) return alert("Fill all fields");

  const { error } = await db.auth.signUp({
    email,
    password
  });

  if (error) return alert(error.message);

  alert("Signup successful. Now login.");
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .single();

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
}

function goProfile() {
  const feed = getFeed();

  feed.innerHTML = `
    <div class="panel">
      <h2>Profile</h2>

      <input id="usernameInput" value="${state.profile?.username || ""}" placeholder="Username">
      <input id="bioInput" value="${state.profile?.bio || ""}" placeholder="Bio">

      <button onclick="updateProfile()">Save</button>

      <hr>

      <p><b>Username:</b> ${state.profile?.username || "N/A"}</p>
      <p><b>Bio:</b> ${state.profile?.bio || "None"}</p>
      <p><b>Role:</b> ${state.profile?.role || "user"}</p>
      <p><b>Earnings:</b> K${state.earnings}</p>
    </div>
  `;
}

async function updateProfile() {
  const username = get("usernameInput").value;
  const bio = get("bioInput").value;

  await db
    .from("profiles")
    .update({ username, bio })
    .eq("user_id", state.user.id);

  state.profile.username = username;
  state.profile.bio = bio;

  alert("Profile updated ✔");
}

// ================= FEED =================
async function loadFeed() {
  const { data, error } = await db.from("posts").select("*");

  if (error) return alert(error.message);

  state.posts = data || [];

  // 🧠 Viral ranking
  state.posts.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  renderFeed();
}

function renderFeed() {
  const feed = getFeed();
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${p.content}</p>

      <div class="actions">
        <button onclick="like('${p.id}')">❤️</button>
        <button onclick="comment('${p.id}')">💬</button>
      </div>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
async function like(id) {
  if (!state.user) return alert("Login first");

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
}

// ================= COMMENT =================
async function comment(id) {
  const text = prompt("Comment:");
  if (!text) return;

  await db.from("comments").insert([{
    post_id: id,
    user_id: state.user.id,
    content: text
  }]);
}

// ================= EARN =================
function goEarn() {
  const feed = getFeed();

  feed.innerHTML = `
    <div class="panel">
      <h2>Earn</h2>
      <button onclick="watchAd()">Watch Ad (+K50)</button>
      <button onclick="survey()">Survey (+K100)</button>
      <p>Total: K${state.earnings}</p>
    </div>
  `;
}

// ================= ANTI-CHEAT =================
let lastEarn = 0;

function watchAd() {
  if (Date.now() - lastEarn < 10000) {
    return alert("Too fast");
  }

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

  feed.innerHTML = `
    <div class="panel">
      <h2>Admin Dashboard</h2>

      <button onclick="adminUsers()">👥 Users</button>
      <button onclick="adminTransactions()">💰 Transactions</button>
      <button onclick="adminGiveMoney()">➕ Give Money</button>
    </div>
  `;
}

// USERS
async function adminUsers() {
  const feed = getFeed();

  const { data } = await db.from("profiles").select("*");

  feed.innerHTML = "<h2>Users</h2>";

  data.forEach(u => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>${u.username} (${u.role})</p>
      <button onclick="banUser('${u.user_id}')">Ban</button>
      <button onclick="makeAdmin('${u.user_id}')">Admin</button>
    `;

    feed.appendChild(div);
  });
}

async function banUser(userId) {
  await db.from("profiles").update({ role: "banned" }).eq("user_id", userId);
  alert("User banned");
}

async function makeAdmin(userId) {
  await db.from("profiles").update({ role: "admin" }).eq("user_id", userId);
  alert("User is now admin");
}

// TRANSACTIONS
async function adminTransactions() {
  const feed = getFeed();

  const { data } = await db
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });

  feed.innerHTML = "<h2>Transactions</h2>";

  data.forEach(t => {
    const div = document.createElement("div");

    div.innerHTML = `
      <p>${t.type} | K${t.amount}</p>
      <small>${new Date(t.created_at).toLocaleString()}</small>
    `;

    feed.appendChild(div);
  });
}

// GIVE MONEY
function adminGiveMoney() {
  const feed = getFeed();

  feed.innerHTML = `
    <div class="panel">
      <h2>Give Money</h2>
      <input id="targetUser" placeholder="User ID">
      <input id="amount" placeholder="Amount">
      <button onclick="sendMoney()">Send</button>
    </div>
  `;
}

async function sendMoney() {
  const userId = get("targetUser").value;
  const amount = parseInt(get("amount").value);

  if (!userId || !amount) return alert("Invalid input");

  await db.from("transactions").insert([{
    user_id: userId,
    amount,
    type: "admin_grant"
  }]);

  alert("Money sent ✔");
}

// ================= NAV =================
function goHome() {
  loadFeed();
}

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  get("app").style.display = "block";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  get("loginEmailBtn").onclick = login;
  get("signupBtn").onclick = signup;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await loadProfile();
    showApp();
    loadFeed();
  }
});
