// ========================================
// KUDASAI STAGE 17 — PATCHED STABLE ENGINE
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
  lastAction: {}
};

const $ = id => document.getElementById(id);

// ================= SAFE WRAPPER =================
function safe(fn){
  return async (...args)=>{
    try { await fn(...args); }
    catch(e){
      console.error(e);
      alert(e.message || "Error occurred");
    }
  };
}

// ================= COOLDOWN =================
function cooldown(key,time){
  const now = Date.now();
  if(state.lastAction[key] && now - state.lastAction[key] < time) return false;
  state.lastAction[key] = now;
  return true;
}

// ================= AUTH =================
const login = safe(async ()=>{
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });
  if(error) throw error;

  state.user = data.user;
  await bootstrap();
});

const signup = safe(async ()=>{
  const email = $("email").value;
  const password = $("password").value;

  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  if(error) throw error;

  // ✅ AUTO PROFILE CREATE FIX
  await db.from("profiles").insert([{
    user_id: data.user.id,
    username: email.split("@")[0],
    balance: 0
  }]);

  alert("Signup success");
});

// ================= BOOT =================
async function bootstrap(){
  await loadProfile();
  showApp();
  await loadFeed();
  startRealtime();
}

// ================= PROFILE =================
async function loadProfile(){
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if(!data){
    // fallback fix
    await db.from("profiles").insert([{
      user_id: state.user.id,
      username: "user",
      balance: 0
    }]);
  }

  state.profile = data || { username:"user", balance:0 };
  $("userTag").textContent = state.profile.username;
}

// ================= FEED =================
async function loadFeed(){
  const { data: posts } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: profiles } = await db
    .from("profiles")
    .select("*");

  state.profilesMap = {};
  profiles.forEach(p => state.profilesMap[p.user_id] = p);

  state.posts = posts || [];
  renderFeed();
}

// ================= CREATE POST =================
const createPost = safe(async ()=>{
  if(!cooldown("post",2000)) return;

  const text = $("postInput").value.trim();
  if(!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id,
    likes: 0
  }]);

  $("postInput").value = "";
});

// ================= LIKE =================
const like = safe(async (id)=>{
  if(!cooldown("like",800)) return;

  const { data: existing } = await db
    .from("likes")
    .select("*")
    .eq("post_id", id)
    .eq("user_id", state.user.id);

  if(existing?.length) return;

  await db.from("likes").insert([{
    post_id: id,
    user_id: state.user.id
  }]);

  const post = state.posts.find(p => p.id === id);
  if(!post) return;

  await db.from("posts")
    .update({ likes: (post.likes || 0) + 1 })
    .eq("id", id);

  loadFeed(); // 🔥 FIX: instant UI refresh
});

// ================= RENDER =================
function renderFeed(){
  const twitter = $("feed");
  const tiktok = $("tiktokFeed");
  const ig = $("igFeed");

  twitter.innerHTML = "";
  tiktok.innerHTML = "";
  ig.innerHTML = "";

  state.posts.forEach(p => {

    const user = state.profilesMap[p.user_id] || {};

    const html = `
      <div class="post">
        <div class="post-header">
          <div class="avatar"></div>
          <div>
            <div class="username">${user.username || "user"}</div>
            <div class="time">${new Date(p.created_at).toLocaleString()}</div>
          </div>
        </div>

        <div class="post-content">${p.content}</div>

        <div class="actions">
          <button onclick="like('${p.id}')">❤️ ${p.likes || 0}</button>
        </div>
      </div>
    `;

    // Twitter (main)
    twitter.innerHTML += html;

    // Smart distribution
    if(p.content.toLowerCase().includes("video")){
      tiktok.innerHTML += html;
    }

    if(p.content.toLowerCase().includes("image")){
      ig.innerHTML += html;
    }
  });
}

// ================= REALTIME (FIXED) =================
function startRealtime(){
  db.channel("posts-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadFeed()
    )
    .subscribe();
}

// ================= UI =================
function showApp(){
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async ()=>{
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;

  const { data } = await db.auth.getSession();

  if(data?.session?.user){
    state.user = data.session.user;
    await bootstrap();
  }
});
