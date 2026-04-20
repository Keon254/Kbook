// ========================================
// KUDASAI STAGE 16 — GOD MODE
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
  profilesMap: {},
  balance: 0,
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) { console.error(e); alert(e.message); }
  };
}

function cooldown(key, time) {
  const now = Date.now();
  if (state.lastAction[key] && now - state.lastAction[key] < time) return false;
  state.lastAction[key] = now;
  return true;
}

// ================= AUTH =================
const login = safe(async () => {
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });
  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async () => {
  const { error } = await db.auth.signUp({
    email: $("email").value,
    password: $("password").value
  });
  if (error) throw error;

  alert("Signup success");
});

// ================= BOOT =================
async function bootstrap() {
  await loadProfile();
  showApp();
  await loadFeed();
  setupRealtime();
}

// ================= PROFILE =================
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  state.profile = data || { username: "user", balance: 0 };
  state.balance = state.profile.balance || 0;

  $("userTag").textContent = state.profile.username;
}

const changeUsername = safe(async () => {
  const name = prompt("New username:");
  if (!name) return;

  await db.from("profiles")
    .update({ username: name })
    .eq("user_id", state.user.id);

  state.profile.username = name;
  $("userTag").textContent = name;
});

// ================= FEED =================
async function loadFeed() {
  const { data: posts } = await db.from("posts").select("*");
  const { data: profiles } = await db.from("profiles").select("*");

  state.profilesMap = {};
  profiles.forEach(p => state.profilesMap[p.user_id] = p);

  state.posts = (posts || []).map(p => {
    const age = (Date.now() - new Date(p.created_at)) / 1000;
    return {
      ...p,
      score: (p.likes * 5) + (100000 / (age + 1))
    };
  }).sort((a,b)=>b.score-a.score);

  renderFeed();
}

function renderFeed() {
  $("feed").innerHTML = state.posts.map(p => {
    const user = state.profilesMap[p.user_id];

    return `
      <div class="post">
        <div class="post-head">
          <div class="avatar"></div>
          <div class="username">${user?.username || "user"}</div>
        </div>

        <p>${p.content}</p>

        <div class="actions">
          <button onclick="like('${p.id}')">❤️ ${p.likes || 0}</button>
          <button onclick="openComments('${p.id}')">💬</button>
        </div>
      </div>
    `;
  }).join("");
}

// ================= POSTS =================
const createPost = safe(async () => {
  if (!cooldown("post", 2000)) return;

  const text = $("postInput").value.trim();
  if (!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id,
    likes: 0
  }]);

  $("postInput").value = "";
  loadFeed();
});

// ================= LIKE =================
const like = safe(async (id) => {
  if (!cooldown("like", 1500)) return;

  const { data: existing } = await db.from("likes")
    .select("*")
    .eq("post_id", id)
    .eq("user_id", state.user.id);

  if (existing.length) return alert("Already liked");

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  const post = state.posts.find(p => p.id === id);

  await db.from("posts")
    .update({ likes: (post.likes || 0) + 1 })
    .eq("id", id);

  loadFeed();
});

// ================= COMMENTS =================
const openComments = safe(async (postId) => {
  const { data } = await db.from("comments").select("*").eq("post_id", postId);

  $("feed").innerHTML = `
    <h2>Comments</h2>

    ${(data || []).map(c => {
      const user = state.profilesMap[c.user_id];
      return `<p><b>${user?.username || "user"}:</b> ${c.content}</p>`;
    }).join("")}

    <input id="commentInput" placeholder="Write comment...">
    <button onclick="addComment('${postId}')">Send</button>
  `;
});

const addComment = safe(async (postId) => {
  const text = $("commentInput").value.trim();
  if (!text) return;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);

  openComments(postId);
});

// ================= JOBS (FIVERR STYLE) =================
function goJobs() {
  $("feed").innerHTML = `
    <h2>💼 Jobs</h2>
    <input id="jobTitle" placeholder="Job title">
    <input id="jobPrice" placeholder="Price">
    <button onclick="createJob()">Post Job</button>
  `;
}

const createJob = safe(async () => {
  await db.from("jobs").insert([{
    title: $("jobTitle").value,
    price: $("jobPrice").value,
    user_id: state.user.id
  }]);

  alert("Job posted");
});

// ================= TASKS =================
function goTasks() {
  $("feed").innerHTML = `
    <h2>💰 Earn</h2>
    <button onclick="earn(10)">Watch Ad</button>
    <button onclick="earn(20)">Survey</button>
    <p>Balance: K${state.balance}</p>
  `;
}

const earn = safe(async (amount) => {
  if (!cooldown("earn", 10000)) return;

  state.balance += amount;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  goTasks();
});

// ================= NAV =================
function goHome(){ loadFeed(); }
function goFollowing(){ alert("Coming soon"); }
function goProfile(){
  $("feed").innerHTML = `
    <h2>${state.profile.username}</h2>
    <button onclick="changeUsername()">Edit Username</button>
    <p>Balance: K${state.balance}</p>
  `;
}

// ================= REALTIME =================
function setupRealtime() {
  db.channel('posts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' },
      () => loadFeed()
    )
    .subscribe();
}

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async ()=> {
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;

  const { data } = await db.auth.getSession();
  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
