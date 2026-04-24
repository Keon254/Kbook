// ========================================
// KUDASAI STAGE 18 — STABLE + VIRAL ENGINE
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
  lastAction: {},
  page: 0,
  loading: false
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
function safe(fn){
  return async (...args)=>{
    try { await fn(...args); }
    catch(e){
      console.error(e);
      alert(e.message || "Error");
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

  const { data, error } = await db.auth.signUp({ email, password });
  if(error) throw error;

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
  await loadFeed(true);
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
    await db.from("profiles").insert([{
      user_id: state.user.id,
      username: "user",
      balance: 0
    }]);
  }

  state.profile = data || { username:"user" };
  $("userTag").textContent = state.profile.username;
}

// ================= FEED =================
async function loadFeed(reset=false){
  if(state.loading) return;
  state.loading = true;

  if(reset){
    state.posts = [];
    state.page = 0;
  }

  const { data: posts } = await db
    .from("posts")
    .select("*")
    .range(state.page*10, state.page*10+9);

  const { data: profiles } = await db
    .from("profiles")
    .select("*");

  profiles.forEach(p => state.profilesMap[p.user_id] = p);

  state.posts = [...state.posts, ...(posts || [])];

  renderFeed();
  state.page++;
  state.loading = false;
}

// ================= ALGORITHM =================
function score(p){
  const age = (Date.now() - new Date(p.created_at)) / 1000;

  return (
    (p.likes || 0) * 6 +
    (p.shares || 0) * 8 +
    (100000 / (age + 1))
  );
}

// ================= RENDER =================
function renderFeed(){
  const feed = $("feed");

  const sorted = [...state.posts].sort((a,b)=>score(b)-score(a));

  feed.innerHTML = sorted.map(p=>{
    const user = state.profilesMap[p.user_id] || {};

    return `
      <div class="post">
        <div class="username">${user.username || "user"}</div>

        <div>${p.content}</div>

        ${p.image ? `<img src="${p.image}" />` : ""}

        ❤️ ${p.likes || 0}

        <button onclick="like('${p.id}')">Like</button>
        <button onclick="sharePost('${p.id}')">Share</button>
      </div>
    `;
  }).join("");
}

// ================= SCROLL =================
window.addEventListener("scroll", ()=>{
  if(window.innerHeight + window.scrollY >= document.body.offsetHeight - 200){
    loadFeed();
  }
});

// ================= CREATE POST =================
const createPost = safe(async ()=>{
  if(!cooldown("post",2000)) return;

  const text = $("postInput").value.trim();
  const file = $("imageInput")?.files?.[0];

  let imageUrl = null;

  if(file){
    const { data } = await db.storage
      .from("images")
      .upload(Date.now()+"_"+file.name, file);

    imageUrl = data.path;
  }

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id,
    image: imageUrl,
    likes: 0
  }]);

  $("postInput").value = "";
  loadFeed(true);
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

  const post = state.posts.find(p=>p.id===id);

  await db.from("posts")
    .update({ likes:(post.likes||0)+1 })
    .eq("id", id);

  loadFeed(true);
});

// ================= SHARE =================
const sharePost = safe(async (id)=>{
  const post = state.posts.find(p=>p.id===id);

  await db.from("posts")
    .update({ shares:(post.shares||0)+1 })
    .eq("id", id);

  alert("Shared 🚀");
});

// ================= REALTIME =================
function startRealtime(){
  db.channel("live-posts")
    .on("postgres_changes",
      { event:"*", schema:"public", table:"posts" },
      ()=>loadFeed(true)
    )
    .subscribe();
}

// ================= UI =================
function showApp(){
  document.querySelector(".auth").style.display="none";
  $("app").style.display="flex";
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
