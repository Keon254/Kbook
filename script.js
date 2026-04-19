// ========================================
// KUDASAI FINAL ENGINE — STAGE 7 (FULL)
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
  follows: [],
  likesMap: {},
  lastAction: {},
  view: "foryou"
};

// ================= SAFE =================
const $ = id => document.getElementById(id);

function safe(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) {
      console.error(e);
      alert(e.message || "Error");
    }
  };
}

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
const login = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  if (!email || !password) return alert("Fill fields");

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async () => {
  const email = $("email").value.trim();
  const password = $("password").value.trim();

  const { error } = await db.auth.signUp({ email, password });
  if (error) throw error;

  alert("Signup success");
});

// ================= BOOT =================
async function bootstrap() {
  await loadProfile();
  showApp();
  await loadFeed();
}

// ================= PROFILE =================
async function loadProfile() {
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
      balance: 0,
      role: "user"
    }]);

    state.profile = { username, balance: 0, role: "user" };
  } else {
    state.profile = data;
    state.balance = data.balance || 0;
  }

  $("userTag").textContent = "@" + state.profile.username;
}

// ================= CREATE POST (FIXED BUG) =================
const createPost = safe(async () => {
  if (!cooldown("post", 2000)) return;

  const text = $("postInput").value.trim();
  if (!text) return alert("Write something");

  const { error } = await db.from("posts").insert([{
    content: text,
    user_id: state.user.id,
    created_at: new Date().toISOString()
  }]);

  if (error) throw error;

  $("postInput").value = "";
  await loadFeed(); // 🔥 THIS FIXES "POST NOT SHOWING"
});

// ================= LOAD FEED =================
async function loadFeed() {
  const { data: posts } = await db.from("posts").select("*");
  const { data: profiles } = await db.from("profiles").select("*");
  const { data: likes } = await db.from("likes").select("*");
  const { data: follows } = await db.from("follows").select("*");

  state.follows = follows || [];

  // MAP USERS
  const userMap = {};
  (profiles || []).forEach(p => userMap[p.user_id] = p);

  // MAP LIKES
  state.likesMap = {};
  (likes || []).forEach(l => {
    const key = l.post_id + "_" + l.user_id;
    state.likesMap[key] = true;
  });

  // MERGE POSTS
  state.posts = (posts || []).map(p => {
    const likeCount = likes.filter(l => l.post_id === p.id).length;

    return {
      ...p,
      username: userMap[p.user_id]?.username || "user",
      likes: likeCount
    };
  });

  // 🧠 VIRAL ALGORITHM (A)
  state.posts.sort((a, b) => {
    const scoreA = (a.likes * 2) + new Date(a.created_at).getTime();
    const scoreB = (b.likes * 2) + new Date(b.created_at).getTime();
    return scoreB - scoreA;
  });

  // 👥 FOLLOW FILTER
  if (state.view === "following") {
    state.posts = state.posts.filter(p =>
      state.follows.some(f =>
        f.follower_id === state.user.id &&
        f.following_id === p.user_id
      )
    );
  }

  renderFeed();
}

// ================= RENDER =================
function renderFeed() {
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p => {
    const liked = state.likesMap[p.id + "_" + state.user.id];

    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <div class="username" onclick="openProfile('${p.user_id}')">@${p.username}</div>
      <p>${p.content}</p>

      <div class="actions">
        <button onclick="like('${p.id}')">
          ❤️ ${p.likes} ${liked ? "✓" : ""}
        </button>

        <button onclick="toggleFollow('${p.user_id}')">
          ${isFollowing(p.user_id) ? "Unfollow" : "Follow"}
        </button>
      </div>
    `;

    feed.appendChild(div);
  });
}

// ================= LIKE =================
const like = safe(async (id) => {
  if (!cooldown("like", 1000)) return;

  const key = id + "_" + state.user.id;
  if (state.likesMap[key]) return alert("Already liked");

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  loadFeed();
});

// ================= FOLLOW =================
function isFollowing(userId) {
  return state.follows.some(f =>
    f.follower_id === state.user.id &&
    f.following_id === userId
  );
}

const toggleFollow = safe(async (userId) => {
  if (isFollowing(userId)) {
    await db.from("follows")
      .delete()
      .eq("follower_id", state.user.id)
      .eq("following_id", userId);
  } else {
    await db.from("follows").insert([{
      follower_id: state.user.id,
      following_id: userId
    }]);
  }

  loadFeed();
});

// ================= PROFILE =================
async function openProfile(userId) {
  const { data: posts } = await db
    .from("posts")
    .select("*")
    .eq("user_id", userId);

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  $("feed").innerHTML = `
    <div class="post">
      <h2>@${profile.username}</h2>
      <p>${posts.length} posts</p>
    </div>
  `;

  posts.forEach(p => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `<p>${p.content}</p>`;
    $("feed").appendChild(div);
  });
}

// ================= TASKS (B MONEY) =================
function goTasks() {
  $("feed").innerHTML = `
    <div class="post">
      <h2>Earn</h2>
      <button onclick="earn()">Task (+K10)</button>
      <p>K${state.balance}</p>
    </div>
  `;
}

const earn = safe(async () => {
  if (!cooldown("earn", 15000)) return;

  await db.from("transactions").insert([{
    user_id: state.user.id,
    amount: 10
  }]);

  state.balance += 10;

  await db.from("profiles")
    .update({ balance: state.balance })
    .eq("user_id", state.user.id);

  goTasks();
});

// ================= NAV =================
function goHome() { state.view = "foryou"; loadFeed(); }
function goFollowing() { state.view = "following"; loadFeed(); }

// ================= UI =================
function showApp() {
  document.querySelector(".auth").style.display = "none";
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
