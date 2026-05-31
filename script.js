// ========================================
// KUDASAI ENGINE
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
  profilesMap: {},
  lastAction: {},
  view: "home"
};

const $ = id => document.getElementById(id);

// ================= SAFE =================
function safe(fn){
  return async (...args)=>{
    try{ return await fn(...args); }
    catch(e){
      console.error(e);
      const msg = e?.message || String(e);
      if(msg.includes("relation") || msg.includes("does not exist")){
        alert("Database table not found. Please run supabase_setup.sql in your Supabase SQL Editor first.");
      } else {
        alert(msg);
      }
    }
  };
}

// ================= COOLDOWN =================
function cooldown(k,t){
  const n = Date.now();
  if(state.lastAction[k] && n - state.lastAction[k] < t) return false;
  state.lastAction[k] = n;
  return true;
}

// ================= AUTH =================
const login = safe(async()=>{
  const email = $("email").value.trim();
  const pass  = $("password").value;
  if(!email || !pass){ alert("Please enter email and password."); return; }

  const {data,error} = await db.auth.signInWithPassword({ email, password:pass });
  if(error) throw error;
  state.user = data.user;
  start();
});

const signup = safe(async()=>{
  const email = $("email").value.trim();
  const pass  = $("password").value;
  if(!email || !pass){ alert("Please enter email and password."); return; }
  if(pass.length < 6){ alert("Password must be at least 6 characters."); return; }

  const {data,error} = await db.auth.signUp({ email, password:pass });
  if(error) throw error;

  // Insert profile
  await db.from("profiles").insert([{
    user_id: data.user.id,
    username: email.split("@")[0],
    balance: 0
  }]);

  alert("Account created! You can now log in.");
});

// ================= START =================
async function start(){
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "grid";

  await loadProfiles();
  await loadFeed();
  startRealtime();
  updateNotifBadge();
}

// ================= LOAD PROFILES =================
async function loadProfiles(){
  const {data,error} = await db.from("profiles").select("*");
  if(error){ console.warn("profiles table error:", error.message); return; }

  state.profilesMap = {};
  (data || []).forEach(p=>{ state.profilesMap[p.user_id] = p; });

  refreshUserHeader();
}

// Ensure a specific user_id's profile is in the map (fetch if missing)
async function ensureProfile(userId){
  if(state.profilesMap[userId]) return;
  const {data} = await db.from("profiles").select("*").eq("user_id",userId).maybeSingle();
  if(data) state.profilesMap[userId] = data;
}

function refreshUserHeader(){
  const me = state.profilesMap[state.user?.id];
  const tag = $("userTag");
  const bal = $("balanceText");
  if(tag) tag.textContent = "@" + (me?.username || "user");
  if(bal) bal.textContent  = "K" + (me?.balance  || 0);
}

// ================= LOAD FEED =================
async function loadFeed(){
  state.view = "home";
  const {data,error} = await db.from("posts").select("*").order("created_at",{ascending:false});
  if(error){ $("feed").innerHTML = `<p style="color:#555;padding:20px">Could not load posts: ${error.message}</p>`; return; }
  state.posts = data || [];
  render();
}

// ================= RENDER FEED =================
function render(){
  if(!state.posts.length){
    $("feed").innerHTML = `<p style="color:#555;padding:20px;text-align:center">No posts yet. Be the first!</p>`;
    return;
  }
  $("feed").innerHTML = state.posts.map(p=>{
    const user = state.profilesMap[p.user_id] || {};
    return `
      <div class="post" id="post-${p.id}">
        <div class="username">@${user.username || "user"}</div>
        <div class="content">${escHtml(p.content)}</div>
        ${p.image ? `<img src="${p.image}" loading="lazy">` : ""}
        ${p.video ? `<video controls src="${p.video}"></video>` : ""}
        <div class="actions">
          <button onclick="like('${p.id}')">❤️ ${p.likes ?? 0}</button>
          <button onclick="toggleComments('${p.id}')">💬 Comment</button>
        </div>
        <div class="comments-section" id="comments-${p.id}" style="display:none">
          <div class="comments-list" id="comments-list-${p.id}"></div>
          <div class="comment-input-row">
            <input class="comment-input" id="comment-input-${p.id}"
              placeholder="Write a comment…"
              onkeydown="if(event.key==='Enter') submitComment('${p.id}')">
            <button class="comment-btn" onclick="submitComment('${p.id}')">Send</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function escHtml(str){
  return String(str||"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

// ================= CREATE POST =================
const createPost = safe(async()=>{
  if(!state.user){ alert("Please log in first."); return; }
  if(!cooldown("post",2000)){ alert("Please wait a moment before posting again."); return; }

  const text = $("postInput").value.trim();
  const imgInput = $("imageInput");
  const vidInput = $("videoInput");

  if(!text && !imgInput?.files?.[0] && !vidInput?.files?.[0]){
    alert("Write something or attach a photo/video.");
    return;
  }

  const postBtn = $("postBtn");
  postBtn.disabled = true;
  postBtn.textContent = "Posting…";

  let image=null, video=null;

  if(imgInput?.files?.[0]){
    const file = imgInput.files[0];
    const path = `${state.user.id}/${Date.now()}_${file.name}`;
    const {data,error} = await db.storage.from("images").upload(path, file, {upsert:true});
    if(error){ alert("Image upload failed: " + error.message); }
    else {
      const {data:urlData} = db.storage.from("images").getPublicUrl(data.path);
      image = urlData.publicUrl;
    }
  }

  if(vidInput?.files?.[0]){
    const file = vidInput.files[0];
    const path = `${state.user.id}/${Date.now()}_${file.name}`;
    const {data,error} = await db.storage.from("videos").upload(path, file, {upsert:true});
    if(error){ alert("Video upload failed: " + error.message); }
    else {
      const {data:urlData} = db.storage.from("videos").getPublicUrl(data.path);
      video = urlData.publicUrl;
    }
  }

  const {error} = await db.from("posts").insert([{
    content: text,
    user_id: state.user.id,
    image,
    video,
    likes: 0
  }]);

  postBtn.disabled = false;
  postBtn.textContent = "Post";

  if(error) throw error;

  $("postInput").value = "";
  if(imgInput) imgInput.value = "";
  if(vidInput) vidInput.value = "";

  await loadFeed();
});

// ================= LIKE =================
const like = safe(async(id)=>{
  if(!state.user){ alert("Log in to like posts."); return; }
  if(!cooldown("like",800)) return;

  const {data:existing} = await db.from("likes")
    .select("post_id")
    .eq("post_id",id)
    .eq("user_id",state.user.id);

  if(existing?.length) return;

  const {error:likeErr} = await db.from("likes").insert([{ post_id:id, user_id:state.user.id }]);
  if(likeErr) throw likeErr;

  const post = state.posts.find(p=>p.id===id);
  const newLikes = (post?.likes||0)+1;

  await db.from("posts").update({likes:newLikes}).eq("id",id);

  if(post && post.user_id !== state.user.id){
    await db.from("notifications").insert([{
      user_id: post.user_id,
      from_user_id: state.user.id,
      type: "like",
      post_id: id
    }]).then(()=>{}).catch(()=>{});
  }

  if(post) post.likes = newLikes;
  render();
});

// ================= COMMENTS =================
const commentsCache = {};

async function toggleComments(postId){
  const section = $("comments-"+postId);
  const isHidden = section.style.display === "none";
  section.style.display = isHidden ? "block" : "none";
  if(isHidden) await loadComments(postId);
}

async function loadComments(postId){
  const {data} = await db.from("comments")
    .select("*").eq("post_id",postId).order("created_at",{ascending:true});
  commentsCache[postId] = data || [];
  renderComments(postId);
}

function renderComments(postId){
  const list = $("comments-list-"+postId);
  if(!list) return;
  const comments = commentsCache[postId] || [];
  if(!comments.length){
    list.innerHTML = `<div class="no-comments">No comments yet. Be first!</div>`;
    return;
  }
  list.innerHTML = comments.map(c=>{
    const user = state.profilesMap[c.user_id] || {};
    return `
      <div class="comment">
        <span class="comment-username">@${user.username || "user"}</span>
        <span class="comment-content">${escHtml(c.content)}</span>
      </div>`;
  }).join("");
}

const submitComment = safe(async(postId)=>{
  if(!state.user){ alert("Log in to comment."); return; }
  const input = $("comment-input-"+postId);
  const text = input.value.trim();
  if(!text) return;

  const {error} = await db.from("comments").insert([{
    post_id: postId,
    user_id: state.user.id,
    content: text
  }]);
  if(error) throw error;

  const post = state.posts.find(p=>p.id===postId);
  if(post && post.user_id !== state.user.id){
    await db.from("notifications").insert([{
      user_id: post.user_id,
      from_user_id: state.user.id,
      type: "comment",
      post_id: postId
    }]).then(()=>{}).catch(()=>{});
  }

  input.value = "";
  await loadComments(postId);
});

// ================= NOTIFICATIONS =================
async function goNotifications(){
  state.view = "notifications";

  const {data,error} = await db.from("notifications")
    .select("*")
    .eq("user_id",state.user.id)
    .order("created_at",{ascending:false});

  if(error){
    $("feed").innerHTML = `<p style="color:#555;padding:20px">${error.message}</p>`;
    return;
  }

  const notifs = data || [];

  // Ensure all from_user profiles are loaded
  await Promise.all([...new Set(notifs.map(n=>n.from_user_id))].map(id=>ensureProfile(id)));

  // Mark all unread as read
  if(notifs.some(n=>!n.read)){
    await db.from("notifications")
      .update({read:true})
      .eq("user_id",state.user.id)
      .eq("read",false);
    updateNotifBadge();
  }

  if(!notifs.length){
    $("feed").innerHTML = `<div class="notif-empty">No notifications yet</div>`;
    return;
  }

  $("feed").innerHTML = notifs.map(n=>{
    const from = state.profilesMap[n.from_user_id] || {};
    const name = from.username ? `@${from.username}` : "Someone";
    const icon   = n.type === "like" ? "❤️" : "💬";
    const action = n.type === "like" ? "liked your post" : "commented on your post";
    const time   = new Date(n.created_at).toLocaleString();
    return `
      <div class="notif-item ${n.read ? "" : "notif-unread"}">
        <span class="notif-icon">${icon}</span>
        <div class="notif-body">
          <span class="comment-username">${name}</span>
          <span class="notif-action"> ${action}</span>
          <div class="notif-time">${time}</div>
        </div>
      </div>`;
  }).join("");
}

async function updateNotifBadge(){
  if(!state.user) return;
  const {count} = await db.from("notifications")
    .select("*",{count:"exact",head:true})
    .eq("user_id",state.user.id)
    .eq("read",false);
  const badge = $("notifBadge");
  if(!badge) return;
  if(count > 0){
    badge.textContent = count > 9 ? "9+" : count;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// ================= PROFILE PAGE =================
async function goProfile(){
  state.view = "profile";

  const me = state.profilesMap[state.user.id] || {};

  $("feed").innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">${(me.username||"U")[0].toUpperCase()}</div>
      <div class="profile-info">
        <div class="profile-username">@${me.username || "user"}</div>
        <div class="profile-balance">💰 K${me.balance || 0}</div>
      </div>
      <div class="profile-edit">
        <input class="comment-input" id="usernameInput" value="${me.username||""}" placeholder="New username">
        <button class="comment-btn" onclick="saveUsername()">Save</button>
      </div>
    </div>
    <h3 style="color:#fff;margin:20px 0 12px">Your Posts</h3>
    <div id="myPosts"></div>
  `;

  await loadMyPosts();
}

const saveUsername = safe(async()=>{
  const val = $("usernameInput")?.value.trim();
  if(!val){ alert("Username cannot be empty."); return; }

  const {error} = await db.from("profiles")
    .update({username: val})
    .eq("user_id", state.user.id);
  if(error) throw error;

  state.profilesMap[state.user.id] = { ...state.profilesMap[state.user.id], username: val };
  refreshUserHeader();
  alert("Username updated to @" + val);
});

async function loadMyPosts(){
  const {data} = await db.from("posts")
    .select("*")
    .eq("user_id",state.user.id)
    .order("created_at",{ascending:false});

  const container = $("myPosts");
  if(!container) return;

  if(!data?.length){
    container.innerHTML = `<p style="color:#555;text-align:center">You haven't posted anything yet.</p>`;
    return;
  }

  container.innerHTML = data.map(p=>`
    <div class="post">
      <div class="content">${escHtml(p.content)}</div>
      ${p.image ? `<img src="${p.image}" loading="lazy">` : ""}
      ${p.video ? `<video controls src="${p.video}"></video>` : ""}
      <div class="actions">
        <span style="color:#555;font-size:13px">❤️ ${p.likes||0}</span>
        <button onclick="deletePost('${p.id}')" style="background:#1a0000;border-color:#440000;color:#ff6b6b">🗑 Delete</button>
      </div>
    </div>`).join("");
}

const deletePost = safe(async(id)=>{
  if(!confirm("Delete this post?")) return;
  const {error} = await db.from("posts").delete().eq("id",id).eq("user_id",state.user.id);
  if(error) throw error;
  await loadMyPosts();
});

// ================= REALTIME =================
function startRealtime(){
  db.channel("posts-live")
    .on("postgres_changes",
      {event:"*",schema:"public",table:"posts"},
      ()=>{ if(state.view==="home") loadFeed(); }
    ).subscribe();

  db.channel("notifs-live")
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"notifications",
       filter:`user_id=eq.${state.user.id}`},
      ()=> updateNotifBadge()
    ).subscribe();
}

// ================= NAV =================
function goHome(){ loadFeed(); }
function goJobs(){    $("feed").innerHTML = `<div class="notif-empty">💼 Jobs coming soon</div>`; }
function goSurveys(){ $("feed").innerHTML = `<div class="notif-empty">📋 Surveys coming soon</div>`; }

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async()=>{
  $("loginBtn").onclick  = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick   = createPost;

  const {data} = await db.auth.getSession();
  if(data?.session?.user){
    state.user = data.session.user;
    start();
  }
});
