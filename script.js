// ========================================
// KUDASAI STAGE 5 — FULL ENGINE
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
  balance: 0,
  lastAction: {}
};

// ================= HELPERS =================
const $ = id => document.getElementById(id);

function cooldown(key, time) {
  const now = Date.now();
  if (state.lastAction[key] && now - state.lastAction[key] < time) {
    alert("Slow down");
    return false;
  }
  state.lastAction[key] = now;
  return true;
}

// ================= AUTH =================
async function login() {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) return alert(error.message);

  state.user = data.user;
  await bootstrap();
}

async function signup() {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { error } = await db.auth.signUp({ email, password });

  if (error) return alert(error.message);

  alert("Signup successful");
}

// ================= BOOT =================
async function bootstrap() {
  await loadProfile();
  showApp();
  loadFeed();
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  state.profile = data;
  state.balance = data?.balance || 0;

  $("userTag").textContent = data?.username || "User";
}

// ================= POSTS =================
async function createPost() {
  if (!cooldown("post", 3000)) return;

  const text = $("postInput").value.trim();
  if (!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  $("postInput").value = "";
  loadFeed();
}

async function loadFeed() {
  const { data } = await db.from("posts").select("*");

  state.posts = (data || []).sort((a,b)=>{
    return (b.likes || 0) - (a.likes || 0);
  });

  renderFeed();
}

function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <b>${p.user_id}</b>
      <p>${p.content}</p>
      <button class="btn" onclick="like('${p.id}')">❤️ ${p.likes || 0}</button>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
async function like(id) {
  if (!cooldown("like", 2000)) return;

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
}

// ================= EARN =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>Earn</h2>
      <button class="btn" onclick="earn()">Earn +10</button>

      <h3>Balance: K${state.balance}</h3>

      <button class="btn" onclick="requestWithdraw()">Withdraw</button>
    </div>
  `;
}

async function earn() {
  if (!cooldown("earn", 15000)) return;

  const amount = 10;

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount,
    type: "task",
    status: "completed"
  }]);

  const newBalance = state.balance + amount;

  await db.from("profiles")
    .update({ balance: newBalance })
    .eq("user_id", state.user.id);

  state.balance = newBalance;

  goTasks();
}

// ================= WITHDRAW =================
function requestWithdraw() {
  const amount = prompt("Enter amount");

  if (!amount || amount <= 0) return;
  if (amount > state.balance) return alert("Not enough balance");

  submitWithdraw(parseInt(amount));
}

async function submitWithdraw(amount) {
  await db.from("withdrawals").insert([{
    user_id: state.user.id,
    amount
  }]);

  alert("Requested");
}

// ================= PROFILE =================
function goProfile() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>${state.profile?.username}</h2>
      <p>Balance: K${state.balance}</p>
    </div>
  `;
}

// ================= ADMIN =================
async function goAdmin() {
  if (state.profile?.role !== "admin") return alert("Not admin");

  const { data } = await db.from("withdrawals").select("*");

  const feed = $("feed");
  feed.innerHTML = "<h2>Admin Panel</h2>";

  data.forEach(w => {
    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <p>${w.user_id}</p>
      <p>K${w.amount}</p>
      <button onclick="approveWithdraw('${w.id}', ${w.amount}, '${w.user_id}')">Approve</button>
    `;

    feed.appendChild(div);
  });
}

async function approveWithdraw(id, amount, userId) {
  const { data } = await db
    .from("profiles")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (!data || data.balance < amount) return alert("Invalid");

  await db.from("profiles")
    .update({ balance: data.balance - amount })
    .eq("user_id", userId);

  await db.from("withdrawals")
    .update({ status: "approved" })
    .eq("id", id);

  goAdmin();
}

// ================= NAV =================
function goHome() { loadFeed(); }

// ================= UI =================
function showApp() {
  $("auth").style.display = "none";
  $("app").style.display = "flex";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async () => {
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
