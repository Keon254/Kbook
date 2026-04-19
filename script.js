// ========================================
// KUDASAI STAGE 9 — REALTIME ENGINE
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "YOUR_ANON_KEY"
);

const state = {
  user: null,
  profile: null,
  posts: [],
  comments: [],
  likesMap: {},
  follows: [],
  balance: 0,
  lastAction: {},
  view: "foryou"
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
function safe(fn){
  return async (...a)=>{
    try{ await fn(...a); }
    catch(e){ console.error(e); alert(e.message); }
  }
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
  await db.auth.signUp({
    email: $("email").value,
    password: $("password").value
  });

  alert("Signup done");
});

// ================= BOOT =================
async function bootstrap(){
  await loadProfile();
  showApp();
  await loadFeed();
  startRealtime(); // 🔥 STAGE 9
}

// ================= PROFILE =================
async function loadProfile(){
  const { data } = await db.from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  state.profile = data;
  $("userTag").textContent = "@" + data.username;
}

// ================= CREATE POST =================
const createPost = safe(async ()=>{
  const text = $("postInput").value.trim();
  if(!text) return;

  await db.from("posts").insert([{
    content: text,
    user_id: state.user.id
  }]);

  $("postInput").value = "";
});

// ================= LOAD FEED =================
async function loadFeed(){
  const { data: posts } = await db.from("posts").select("*");
  const { data: profiles } = await db.from("profiles").select("*");
  const { data: comments } = await db.from("comments").select("*");

  state.comments = comments || [];

  const userMap = {};
  profiles.forEach(p=> userMap[p.user_id] = p);

  state.posts = posts.map(p=>({
    ...p,
    username: userMap[p.user_id]?.username || "user"
  }));

  renderFeed();
}

// ================= RENDER =================
function renderFeed(){
  const feed = $("feed");
  feed.innerHTML = "";

  state.posts.forEach(p=>{
    const postComments = state.comments.filter(c=>c.post_id === p.id);

    const div = document.createElement("div");
    div.className = "post";

    div.innerHTML = `
      <div class="username">@${p.username}</div>
      <p>${p.content}</p>

      <div class="actions">
        <button onclick="openComment('${p.id}')">💬 ${postComments.length}</button>
      </div>

      <div class="comment-box" id="c-${p.id}"></div>
    `;

    feed.appendChild(div);
  });
}

// ================= COMMENT =================
function openComment(postId){
  const box = $("c-"+postId);

  const list = state.comments
    .filter(c=>c.post_id===postId)
    .map(c=>`<div class="comment">💬 ${c.content}</div>`)
    .join("");

  box.innerHTML = `
    ${list}
    <input id="input-${postId}" placeholder="Comment...">
    <button onclick="sendComment('${postId}')">Send</button>
  `;
}

const sendComment = safe(async (postId)=>{
  const text = $("input-"+postId).value;

  await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);
});

// ================= REALTIME =================
function startRealtime(){
  db.channel("realtime")
    .on("postgres_changes", { event: "*", schema: "public" }, payload=>{
      loadFeed(); // 🔥 live update
    })
    .subscribe();
}

// ================= NAV =================
function goHome(){ loadFeed(); }
function goFollowing(){ alert("Following feed already wired earlier"); }
function goTasks(){ alert("Money system active"); }
function goProfile(){ alert("Profile exists"); }

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
