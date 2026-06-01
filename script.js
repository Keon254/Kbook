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
  user:         null,
  posts:        [],
  profilesMap:  {},
  lastAction:   {},
  view:         "home",
  tab:          "forYou",
  followingSet: new Set(),
  bookmarksSet: new Set(),
  repostsSet:   new Set(),
  likesSet:     new Set(),
};

const $ = id => document.getElementById(id);

// ================= UTILS =================
function escHtml(str){
  return String(str||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function timeAgo(ts){
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if(s < 60)  return s + "s";
  if(s < 3600) return Math.floor(s/60) + "m";
  if(s < 86400) return Math.floor(s/3600) + "h";
  return Math.floor(s/86400) + "d";
}

function safe(fn){
  return async (...args)=>{
    try{ return await fn(...args); }
    catch(e){
      console.error(e);
      const msg = e?.message || String(e);
      if(msg.includes("relation") || msg.includes("does not exist")){
        alert("Table not found. Please run supabase_setup.sql in your Supabase SQL Editor.");
      } else {
        alert(msg);
      }
    }
  };
}

function cooldown(k,t){
  const n = Date.now();
  if(state.lastAction[k] && n - state.lastAction[k] < t) return false;
  state.lastAction[k] = n;
  return true;
}

function setActiveNav(id){
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.remove("active-nav"));
  const el = $(id);
  if(el) el.classList.add("active-nav");
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
  await db.from("profiles").insert([{ user_id:data.user.id, username:email.split("@")[0], balance:0 }]);
  alert("Account created! You can now log in.");
});

// ================= START =================
async function start(){
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "grid";
  initParticles();
  await Promise.all([loadProfiles(), loadSocialData()]);
  await loadFeed();
  startRealtime();
  updateNotifBadge();
  updateDMBadge();
  loadSidebar();
}

// ================= PROFILES =================
async function loadProfiles(){
  const {data,error} = await db.from("profiles").select("*");
  if(error){ console.warn("profiles:", error.message); return; }
  state.profilesMap = {};
  (data||[]).forEach(p=>{ state.profilesMap[p.user_id] = p; });
  refreshUserHeader();
}

async function ensureProfile(userId){
  if(state.profilesMap[userId]) return;
  const {data} = await db.from("profiles").select("*").eq("user_id",userId).maybeSingle();
  if(data) state.profilesMap[userId] = data;
}

function refreshUserHeader(){
  const me = state.profilesMap[state.user?.id];
  const tag = $("userTag");
  const bal = $("balanceText");
  if(tag) tag.textContent = "@"+(me?.username||"user");
  if(bal) bal.textContent = "K"+(me?.balance||0);
}

// ================= SOCIAL DATA =================
async function loadSocialData(){
  if(!state.user) return;

  const [followRes, bookmarkRes, repostRes, likeRes] = await Promise.all([
    db.from("follows").select("following_id").eq("follower_id",state.user.id),
    db.from("bookmarks").select("post_id").eq("user_id",state.user.id),
    db.from("reposts").select("post_id").eq("user_id",state.user.id),
    db.from("likes").select("post_id").eq("user_id",state.user.id),
  ]);

  state.followingSet = new Set((followRes.data||[]).map(r=>r.following_id));
  state.bookmarksSet = new Set((bookmarkRes.data||[]).map(r=>r.post_id));
  state.repostsSet   = new Set((repostRes.data||[]).map(r=>r.post_id));
  state.likesSet     = new Set((likeRes.data||[]).map(r=>r.post_id));
}

// ================= FEED =================
async function loadFeed(){
  state.view = "home";
  setActiveNav("nav-home");
  showComposer(true);
  showFeedTabs(true);
  showSkeletons(4);

  let query = db.from("posts").select("*").order("created_at",{ascending:false});

  if(state.tab === "following"){
    const ids = [...state.followingSet];
    if(!ids.length){
      $("feed").innerHTML = `<div class="empty-state">You're not following anyone yet.<br>Follow people to see their posts here.</div>`;
      return;
    }
    query = query.in("user_id", ids);
  }

  const {data,error} = await query;
  if(error){ $("feed").innerHTML = `<p style="color:#f55;padding:20px">${error.message}</p>`; return; }
  state.posts = data||[];
  render();
}

function render(posts){
  const list = posts || state.posts;
  if(!list.length){
    $("feed").innerHTML = `<div class="empty-state">No posts here yet.</div>`;
    return;
  }
  $("feed").innerHTML = list.map(p=>postCard(p)).join("");
}

function postCard(p){
  const user      = state.profilesMap[p.user_id] || {};
  const isMe      = p.user_id === state.user?.id;
  const liked     = state.likesSet.has(p.id);
  const bookmarked= state.bookmarksSet.has(p.id);
  const reposted  = state.repostsSet.has(p.id);
  const following = state.followingSet.has(p.user_id);

  return `
    <div class="post" id="post-${p.id}">
      <div class="post-header-row">
        <div class="post-avatar">${(user.username||"U")[0].toUpperCase()}</div>
        <div class="post-meta">
          <span class="username">@${user.username||"user"}</span>
          <span class="post-time">${timeAgo(p.created_at)}</span>
        </div>
        ${!isMe ? `
          <button class="follow-btn ${following?"following":""}" onclick="toggleFollow('${p.user_id}')">
            ${following?"✓ Following":"+ Follow"}
          </button>` : `
          <button class="delete-btn" onclick="deletePost('${p.id}')" title="Delete post">🗑</button>`}
      </div>
      <div class="content">${escHtml(p.content)}</div>
      ${p.image ? `<img src="${p.image}" loading="lazy">` : ""}
      ${p.video ? `<video controls src="${p.video}"></video>` : ""}
      <div class="actions">
        <button class="${liked?"btn-liked":""}" onclick="likeBurst(event,'${p.id}')">
          ${liked?"❤️":"🤍"} ${p.likes??0}
        </button>
        <button onclick="toggleComments('${p.id}')">💬 Comment</button>
        <button class="${reposted?"btn-reposted":""}" onclick="repost('${p.id}')">
          🔁${reposted?" Reposted":"Repost"}
        </button>
        <button class="${bookmarked?"btn-bookmarked":""}" onclick="bookmark('${p.id}')">
          ${bookmarked?"🔖":"🏷"} ${bookmarked?"Saved":"Save"}
        </button>
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
    </div>`;
}

// ================= TABS =================
function switchTab(tab){
  state.tab = tab;
  $("tabForYou").classList.toggle("tab-active",   tab==="forYou");
  $("tabFollowing").classList.toggle("tab-active", tab==="following");
  loadFeed();
}

// ================= SEARCH =================
let searchTimer;
function handleSearch(query){
  clearTimeout(searchTimer);
  if(!query.trim()){ loadFeed(); return; }
  searchTimer = setTimeout(()=> runSearch(query.trim()), 300);
}

async function runSearch(q){
  state.view = "search";
  showComposer(false);
  showFeedTabs(false);

  const isUser = q.startsWith("@");
  const term   = isUser ? q.slice(1) : q;

  let posts = [], users = [];

  if(isUser){
    const {data} = await db.from("profiles").select("*").ilike("username",`%${term}%`).limit(20);
    users = data||[];
  } else {
    const [postRes, userRes] = await Promise.all([
      db.from("posts").select("*").ilike("content",`%${term}%`).order("created_at",{ascending:false}).limit(30),
      db.from("profiles").select("*").ilike("username",`%${q}%`).limit(5),
    ]);
    posts = postRes.data||[];
    users = userRes.data||[];
  }

  let html = "";

  if(users.length){
    html += `<div class="search-section-title">👤 Users</div>`;
    html += users.map(u=>{
      const following = state.followingSet.has(u.user_id);
      const isMe = u.user_id === state.user?.id;
      return `
        <div class="user-card">
          <div class="post-avatar">${(u.username||"U")[0].toUpperCase()}</div>
          <div class="user-card-info">
            <div class="username">@${u.username}</div>
          </div>
          ${!isMe?`
            <button class="follow-btn ${following?"following":""}" onclick="toggleFollow('${u.user_id}')">
              ${following?"✓ Following":"+ Follow"}
            </button>
            <button class="dm-btn" onclick="startDM('${u.user_id}')">✉️</button>
          `:""}
        </div>`;
    }).join("");
  }

  if(posts.length){
    html += `<div class="search-section-title">📝 Posts</div>`;
    // Ensure profiles loaded for search results
    await Promise.all([...new Set(posts.map(p=>p.user_id))].map(id=>ensureProfile(id)));
    html += posts.map(p=>postCard(p)).join("");
  }

  if(!users.length && !posts.length){
    html = `<div class="empty-state">No results for "${escHtml(q)}"</div>`;
  }

  $("feed").innerHTML = html;
}

// ================= CREATE POST =================
const createPost = safe(async()=>{
  if(!state.user){ alert("Please log in first."); return; }
  if(!cooldown("post",2000)){ alert("Please wait before posting again."); return; }

  const text     = $("postInput").value.trim();
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
    const {data,error} = await db.storage.from("images")
      .upload(`${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
    if(error) alert("Image upload failed: "+error.message);
    else { const {data:u}=db.storage.from("images").getPublicUrl(data.path); image=u.publicUrl; }
  }

  if(vidInput?.files?.[0]){
    const file = vidInput.files[0];
    const {data,error} = await db.storage.from("videos")
      .upload(`${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
    if(error) alert("Video upload failed: "+error.message);
    else { const {data:u}=db.storage.from("videos").getPublicUrl(data.path); video=u.publicUrl; }
  }

  const {error} = await db.from("posts").insert([{
    content:text, user_id:state.user.id, image, video
  }]);

  postBtn.disabled = false;
  postBtn.textContent = "Post";
  if(error) throw error;

  $("postInput").value="";
  if(imgInput) imgInput.value="";
  if(vidInput) vidInput.value="";

  await loadFeed();
});

// ================= LIKE =================
const like = safe(async(id)=>{
  if(!state.user){ alert("Log in to like."); return; }
  if(!cooldown("like",600)) return;

  const alreadyLiked = state.likesSet.has(id);

  if(alreadyLiked){
    await db.from("likes").delete().eq("post_id",id).eq("user_id",state.user.id);
    state.likesSet.delete(id);
    const post = state.posts.find(p=>p.id===id);
    if(post){ post.likes = Math.max(0,(post.likes||1)-1);
      await db.from("posts").update({likes:post.likes}).eq("id",id); }
  } else {
    const {error} = await db.from("likes").insert([{post_id:id,user_id:state.user.id}]);
    if(error) throw error;
    state.likesSet.add(id);
    const post = state.posts.find(p=>p.id===id);
    const newLikes = (post?.likes||0)+1;
    if(post){ post.likes=newLikes;
      await db.from("posts").update({likes:newLikes}).eq("id",id); }
    if(post && post.user_id !== state.user.id){
      db.from("notifications").insert([{
        user_id:post.user_id, from_user_id:state.user.id, type:"like", post_id:id
      }]).then(()=>{}).catch(()=>{});
    }
  }
  render();
});

// ================= REPOST =================
const repost = safe(async(id)=>{
  if(!state.user){ alert("Log in to repost."); return; }
  if(!cooldown("repost",800)) return;

  if(state.repostsSet.has(id)){
    await db.from("reposts").delete().eq("post_id",id).eq("user_id",state.user.id);
    state.repostsSet.delete(id);
  } else {
    const {error} = await db.from("reposts").insert([{post_id:id,user_id:state.user.id}]);
    if(error) throw error;
    state.repostsSet.add(id);
  }
  render();
});

// ================= BOOKMARK =================
const bookmark = safe(async(id)=>{
  if(!state.user){ alert("Log in to bookmark."); return; }

  if(state.bookmarksSet.has(id)){
    await db.from("bookmarks").delete().eq("post_id",id).eq("user_id",state.user.id);
    state.bookmarksSet.delete(id);
  } else {
    const {error} = await db.from("bookmarks").insert([{post_id:id,user_id:state.user.id}]);
    if(error) throw error;
    state.bookmarksSet.add(id);
  }
  render();
});

// ================= FOLLOW =================
const toggleFollow = safe(async(userId)=>{
  if(!state.user){ alert("Log in to follow."); return; }
  if(userId === state.user.id) return;

  if(state.followingSet.has(userId)){
    await db.from("follows").delete()
      .eq("follower_id",state.user.id).eq("following_id",userId);
    state.followingSet.delete(userId);
  } else {
    const {error} = await db.from("follows").insert([{
      follower_id:state.user.id, following_id:userId
    }]);
    if(error) throw error;
    state.followingSet.add(userId);
    db.from("notifications").insert([{
      user_id:userId, from_user_id:state.user.id, type:"follow", post_id:null
    }]).then(()=>{}).catch(()=>{});
  }
  // Re-render current view
  if(state.view==="home") render();
  else if(state.view==="search"){
    const q = $("searchInput")?.value.trim();
    if(q) runSearch(q);
  } else if(state.view==="profile_other") renderOtherProfile();
  loadSidebar();
});

// ================= COMMENTS =================
const commentsCache = {};

async function toggleComments(postId){
  const section = $("comments-"+postId);
  const isHidden = section.style.display==="none";
  section.style.display = isHidden?"block":"none";
  if(isHidden) await loadComments(postId);
}

async function loadComments(postId){
  const {data} = await db.from("comments").select("*")
    .eq("post_id",postId).order("created_at",{ascending:true});
  commentsCache[postId] = data||[];
  renderComments(postId);
}

function renderComments(postId){
  const list = $("comments-list-"+postId);
  if(!list) return;
  const comments = commentsCache[postId]||[];
  if(!comments.length){
    list.innerHTML=`<div class="no-comments">No comments yet.</div>`; return;
  }
  list.innerHTML = comments.map(c=>{
    const u = state.profilesMap[c.user_id]||{};
    return `<div class="comment">
      <span class="comment-username">@${u.username||"user"}</span>
      <span class="comment-content">${escHtml(c.content)}</span>
    </div>`;
  }).join("");
}

const submitComment = safe(async(postId)=>{
  if(!state.user){ alert("Log in to comment."); return; }
  const input = $("comment-input-"+postId);
  const text  = input.value.trim();
  if(!text) return;
  const {error} = await db.from("comments").insert([{
    post_id:postId, user_id:state.user.id, content:text
  }]);
  if(error) throw error;
  const post = state.posts.find(p=>p.id===postId);
  if(post && post.user_id!==state.user.id){
    db.from("notifications").insert([{
      user_id:post.user_id, from_user_id:state.user.id, type:"comment", post_id:postId
    }]).then(()=>{}).catch(()=>{});
  }
  input.value="";
  await loadComments(postId);
});

// ================= NOTIFICATIONS =================
async function goNotifications(){
  state.view="notifications";
  setActiveNav("nav-notifs");
  showComposer(false);
  showFeedTabs(false);

  const {data,error} = await db.from("notifications").select("*")
    .eq("user_id",state.user.id).order("created_at",{ascending:false});

  if(error){ $("feed").innerHTML=`<p style="color:#f55;padding:20px">${error.message}</p>`; return; }

  const notifs = data||[];
  await Promise.all([...new Set(notifs.map(n=>n.from_user_id).filter(Boolean))].map(ensureProfile));

  if(notifs.some(n=>!n.read)){
    await db.from("notifications").update({read:true})
      .eq("user_id",state.user.id).eq("read",false);
    updateNotifBadge();
  }

  if(!notifs.length){ $("feed").innerHTML=`<div class="empty-state">No notifications yet</div>`; return; }

  const icons   = {like:"❤️",comment:"💬",follow:"👤"};
  const actions = {like:"liked your post",comment:"commented on your post",follow:"followed you"};

  $("feed").innerHTML = notifs.map(n=>{
    const from = state.profilesMap[n.from_user_id]||{};
    return `<div class="notif-item ${n.read?"":"notif-unread"}">
      <span class="notif-icon">${icons[n.type]||"🔔"}</span>
      <div class="notif-body">
        <span class="comment-username">@${from.username||"user"}</span>
        <span class="notif-action"> ${actions[n.type]||n.type}</span>
        <div class="notif-time">${timeAgo(n.created_at)} ago</div>
      </div>
    </div>`;
  }).join("");
}

async function updateNotifBadge(){
  if(!state.user) return;
  const {count} = await db.from("notifications").select("*",{count:"exact",head:true})
    .eq("user_id",state.user.id).eq("read",false);
  const badge = $("notifBadge");
  if(!badge) return;
  if(count>0){ badge.textContent=count>9?"9+":count; badge.style.display="flex"; }
  else badge.style.display="none";
}

// ================= BOOKMARKS =================
async function goBookmarks(){
  state.view="bookmarks";
  setActiveNav("nav-bookmarks");
  showComposer(false);
  showFeedTabs(false);

  if(!state.bookmarksSet.size){
    $("feed").innerHTML=`<div class="empty-state">No bookmarks yet. Tap 🏷 on a post to save it.</div>`;
    return;
  }

  const {data,error} = await db.from("posts").select("*")
    .in("id",[...state.bookmarksSet]).order("created_at",{ascending:false});

  if(error){ $("feed").innerHTML=`<p style="color:#f55;padding:20px">${error.message}</p>`; return; }

  await Promise.all([...new Set((data||[]).map(p=>p.user_id))].map(ensureProfile));
  $("feed").innerHTML = `<div class="search-section-title">🔖 Saved Posts</div>`
    + (data||[]).map(p=>postCard(p)).join("");
}

// ================= PROFILE =================
async function goProfile(userId){
  const targetId = userId || state.user?.id;
  const isMe     = targetId === state.user?.id;
  state.view     = isMe ? "profile" : "profile_other";

  setActiveNav(isMe ? "nav-profile" : null);
  showComposer(false);
  showFeedTabs(false);

  await ensureProfile(targetId);
  const me      = state.profilesMap[targetId]||{};
  const following = state.followingSet.has(targetId);

  // Get follower/following counts
  const [follRes, followingRes] = await Promise.all([
    db.from("follows").select("*",{count:"exact",head:true}).eq("following_id",targetId),
    db.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",targetId),
  ]);

  $("feed").innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">${(me.username||"U")[0].toUpperCase()}</div>
      <div class="profile-info">
        <div class="profile-username">@${me.username||"user"}</div>
        <div class="profile-balance">💰 K${me.balance||0}</div>
        <div class="profile-stats">
          <span><strong>${follRes.count||0}</strong> Followers</span>
          <span><strong>${followingRes.count||0}</strong> Following</span>
        </div>
      </div>
      ${isMe ? `
        <div class="profile-edit">
          <input class="comment-input" id="usernameInput" value="${me.username||""}" placeholder="New username">
          <button class="comment-btn" onclick="saveUsername()">Save</button>
        </div>` : `
        <button class="follow-btn ${following?"following":""}" onclick="toggleFollow('${targetId}')">
          ${following?"✓ Following":"+ Follow"}
        </button>`
      }
    </div>
    <h3 style="color:#fff;margin:20px 0 12px">${isMe?"Your Posts":"Posts"}</h3>
    <div id="myPosts"></div>`;

  loadUserPosts(targetId, isMe);
}

async function loadUserPosts(userId, isMe){
  const {data} = await db.from("posts").select("*")
    .eq("user_id",userId).order("created_at",{ascending:false});
  const container = $("myPosts");
  if(!container) return;
  if(!data?.length){
    container.innerHTML=`<div class="empty-state">No posts yet.</div>`; return;
  }
  container.innerHTML = data.map(p=>`
    <div class="post">
      <div class="post-header-row">
        <div class="post-meta">
          <span class="post-time">${timeAgo(p.created_at)} ago</span>
        </div>
        ${isMe?`<button onclick="deletePost('${p.id}')" class="delete-btn">🗑</button>`:""}
      </div>
      <div class="content">${escHtml(p.content)}</div>
      ${p.image?`<img src="${p.image}" loading="lazy">`:""}
      ${p.video?`<video controls src="${p.video}"></video>`:""}
      <div class="actions">
        <span style="color:#555;font-size:13px">❤️ ${p.likes||0}</span>
      </div>
    </div>`).join("");
}

const saveUsername = safe(async()=>{
  const val = $("usernameInput")?.value.trim();
  if(!val){ alert("Username cannot be empty."); return; }
  const {error} = await db.from("profiles").update({username:val}).eq("user_id",state.user.id);
  if(error) throw error;
  state.profilesMap[state.user.id] = {...(state.profilesMap[state.user.id]||{}), username:val};
  refreshUserHeader();
  alert("Username updated to @"+val);
});

const deletePost = safe(async(id)=>{
  if(!confirm("Delete this post?")) return;
  const {error} = await db.from("posts").delete().eq("id",id).eq("user_id",state.user.id);
  if(error) throw error;
  goProfile();
});

// ================= SIDEBAR =================
async function loadSidebar(){
  loadTrending();
  loadWhoToFollow();
}

async function loadTrending(){
  const {data} = await db.from("posts").select("content,likes")
    .order("likes",{ascending:false}).limit(5);

  const el = $("trendingList");
  if(!el) return;
  if(!data?.length){ el.innerHTML=`<p style="color:#555;font-size:13px">No trending yet</p>`; return; }

  // Extract hashtags or just show most liked post excerpts
  const tags = new Map();
  (data||[]).forEach(p=>{
    const matches = (p.content||"").match(/#\w+/g)||[];
    matches.forEach(t=>{ tags.set(t,(tags.get(t)||0)+1); });
  });

  if(tags.size){
    el.innerHTML = [...tags.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([tag,n])=>`<div class="trending-item" onclick="handleSearch('${tag}')">
        <div class="trending-tag">${tag}</div>
        <div class="trending-count">${n} post${n>1?"s":""}</div>
      </div>`).join("");
  } else {
    el.innerHTML = (data||[]).slice(0,3).map(p=>`
      <div class="trending-item">
        <div class="trending-tag" style="font-size:12px;color:#aaa">${escHtml((p.content||"").slice(0,30))}…</div>
        <div class="trending-count">❤️ ${p.likes||0}</div>
      </div>`).join("");
  }
}

async function loadWhoToFollow(){
  const el = $("whoToFollow");
  if(!el) return;

  const {data} = await db.from("profiles").select("*").neq("user_id",state.user.id).limit(10);
  const suggestions = (data||[]).filter(p=>!state.followingSet.has(p.user_id)).slice(0,3);

  if(!suggestions.length){ el.innerHTML=`<p style="color:#555;font-size:13px">No suggestions</p>`; return; }

  el.innerHTML = suggestions.map(u=>`
    <div class="who-item">
      <div class="who-avatar">${(u.username||"U")[0].toUpperCase()}</div>
      <div class="who-name" onclick="goProfile('${u.user_id}')">@${u.username}</div>
      <button class="follow-btn" onclick="toggleFollow('${u.user_id}')">+ Follow</button>
    </div>`).join("");
}

// ================= DIRECT MESSAGES =================
let dmChannel = null;

async function goMessages(){
  state.view = "messages";
  setActiveNav("nav-messages");
  showComposer(false);
  showFeedTabs(false);

  $("feed").innerHTML = `<div class="empty-state" style="padding:30px 0">Loading conversations…</div>`;

  // Fetch all messages involving the current user
  const {data, error} = await db.from("messages")
    .select("*")
    .or(`sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`)
    .order("created_at", {ascending:false});

  if(error){ $("feed").innerHTML=`<p style="color:#f55;padding:20px">${error.message}</p>`; return; }

  // Build unique conversations (group by the other person)
  const seen = new Set();
  const convos = [];
  for(const m of (data||[])){
    const otherId = m.sender_id === state.user.id ? m.receiver_id : m.sender_id;
    if(!seen.has(otherId)){
      seen.add(otherId);
      convos.push({ otherId, lastMsg: m });
    }
  }

  // Ensure profiles loaded
  await Promise.all(convos.map(c=>ensureProfile(c.otherId)));

  // Mark unread as read (all in one go)
  await db.from("messages").update({read:true})
    .eq("receiver_id", state.user.id).eq("read", false);
  updateDMBadge();

  if(!convos.length){
    $("feed").innerHTML = `
      <div class="empty-state">
        No messages yet.<br>
        <span style="font-size:13px;color:#444">Search for a user and tap Message to start a chat.</span>
      </div>`;
    return;
  }

  $("feed").innerHTML = `
    <div class="search-section-title">💬 Conversations</div>
    ${convos.map(c=>{
      const u = state.profilesMap[c.otherId]||{};
      const preview = escHtml((c.lastMsg.content||"").slice(0,60));
      const mine = c.lastMsg.sender_id === state.user.id;
      return `
        <div class="dm-convo" onclick="openDM('${c.otherId}')">
          <div class="post-avatar">${(u.username||"?")[0].toUpperCase()}</div>
          <div class="dm-convo-body">
            <div class="dm-convo-name">@${u.username||"user"}</div>
            <div class="dm-convo-preview">${mine?"You: ":""}${preview}</div>
          </div>
          <div class="dm-convo-time">${timeAgo(c.lastMsg.created_at)}</div>
        </div>`;
    }).join("")}`;
}

async function openDM(otherId){
  state.view = "dm_thread";
  await ensureProfile(otherId);
  const other = state.profilesMap[otherId]||{};

  $("feed").innerHTML = `
    <div class="dm-header">
      <button class="dm-back" onclick="goMessages()">← Back</button>
      <div class="post-avatar" style="width:32px;height:32px;font-size:13px">${(other.username||"?")[0].toUpperCase()}</div>
      <span class="dm-header-name">@${other.username||"user"}</span>
    </div>
    <div class="dm-thread" id="dmThread"></div>
    <div class="dm-input-row">
      <input class="comment-input" id="dmInput" placeholder="Message @${other.username||"user"}…"
        onkeydown="if(event.key==='Enter') sendMessage('${otherId}')">
      <button class="comment-btn" onclick="sendMessage('${otherId}')">Send</button>
    </div>`;

  await loadThread(otherId);

  // Mark incoming messages as read
  await db.from("messages").update({read:true})
    .eq("sender_id", otherId).eq("receiver_id", state.user.id).eq("read",false);
  updateDMBadge();

  // Subscribe to this thread
  if(dmChannel) db.removeChannel(dmChannel);
  dmChannel = db.channel(`dm-${[state.user.id,otherId].sort().join("-")}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},
      async(payload)=>{
        const m = payload.new;
        if((m.sender_id===state.user.id && m.receiver_id===otherId) ||
           (m.sender_id===otherId && m.receiver_id===state.user.id)){
          await loadThread(otherId);
        }
      })
    .subscribe();
}

async function loadThread(otherId){
  const {data} = await db.from("messages").select("*")
    .or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${state.user.id})`)
    .order("created_at",{ascending:true});

  const thread = $("dmThread");
  if(!thread) return;

  if(!data?.length){
    thread.innerHTML=`<div class="no-comments" style="padding:30px">No messages yet. Say hi!</div>`;
    return;
  }

  thread.innerHTML = data.map(m=>{
    const mine = m.sender_id === state.user.id;
    return `
      <div class="dm-msg ${mine?"dm-mine":"dm-theirs"}">
        <div class="dm-bubble">${escHtml(m.content)}</div>
        <div class="dm-time">${timeAgo(m.created_at)}</div>
      </div>`;
  }).join("");

  thread.scrollTop = thread.scrollHeight;
}

const sendMessage = safe(async(otherId)=>{
  const input = $("dmInput");
  const text  = input?.value.trim();
  if(!text) return;

  const {error} = await db.from("messages").insert([{
    sender_id:   state.user.id,
    receiver_id: otherId,
    content:     text,
    read:        false
  }]);
  if(error) throw error;

  input.value = "";
  await loadThread(otherId);

  // Notify recipient
  db.from("notifications").insert([{
    user_id:      otherId,
    from_user_id: state.user.id,
    type:         "message",
    post_id:      null
  }]).then(()=>{}).catch(()=>{});
});

async function updateDMBadge(){
  if(!state.user) return;
  const {count} = await db.from("messages")
    .select("*",{count:"exact",head:true})
    .eq("receiver_id",state.user.id)
    .eq("read",false);
  const badge = $("dmBadge");
  if(!badge) return;
  if(count>0){ badge.textContent=count>9?"9+":count; badge.style.display="flex"; }
  else badge.style.display="none";
}

// Button on profile/search to start a DM
function startDM(userId){
  openDM(userId);
  setActiveNav("nav-messages");
}

// ================= DELETE POST =================
const deletePost = safe(async(id)=>{
  if(!state.user) return;
  if(!confirm("Delete this post?")) return;

  const el = $("post-"+id);
  if(el){
    el.style.transition = "opacity 0.3s, transform 0.3s";
    el.style.opacity = "0";
    el.style.transform = "scale(0.95) translateY(-8px)";
    await new Promise(r=>setTimeout(r,300));
  }

  const {error} = await db.from("posts").delete()
    .eq("id",id).eq("user_id",state.user.id);
  if(error) throw error;

  state.posts = state.posts.filter(p=>p.id!==id);
  render();
});

// ================= LIKE BURST ANIMATION =================
function likeBurst(event, id){
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top  + rect.height/2;

  const alreadyLiked = state.likesSet.has(id);

  if(!alreadyLiked){
    const emojis = ["❤️","💖","💗","✨","💫","⭐"];
    const count  = 8;
    for(let i=0;i<count;i++){
      const el = document.createElement("div");
      el.className = "like-particle";
      el.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      const angle  = (i/count)*2*Math.PI + (Math.random()-0.5)*0.5;
      const dist   = 60 + Math.random()*60;
      el.style.left = cx+"px";
      el.style.top  = cy+"px";
      el.style.setProperty("--tx", Math.cos(angle)*dist+"px");
      el.style.setProperty("--ty", Math.sin(angle)*dist+"px");
      el.style.fontSize = (14+Math.random()*10)+"px";
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 800);
    }

    btn.style.transform = "scale(1.35)";
    setTimeout(()=>{ btn.style.transform = ""; }, 300);
  }

  like(id);
}

// ================= UI HELPERS =================
function showComposer(show){
  const el=$("composer"); if(el) el.style.display=show?"block":"none";
}
function showFeedTabs(show){
  const el=$("feedTabs"); if(el) el.style.display=show?"flex":"none";
}

// ================= SKELETON LOADING =================
function showSkeletons(n=3){
  const skels = Array.from({length:n},()=>`
    <div class="skeleton-card">
      <div class="skeleton-row">
        <div class="skeleton-line skeleton-avatar"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px">
          <div class="skeleton-line" style="height:12px;width:40%"></div>
          <div class="skeleton-line" style="height:10px;width:25%"></div>
        </div>
      </div>
      <div class="skeleton-line" style="height:14px;width:90%;margin-bottom:8px"></div>
      <div class="skeleton-line" style="height:14px;width:70%;margin-bottom:8px"></div>
      <div class="skeleton-line" style="height:14px;width:55%"></div>
    </div>`).join("");
  $("feed").innerHTML = skels;
}

// ================= PARTICLES =================
function initParticles(){
  const canvas = document.getElementById("particleCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");

  function resize(){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; }
  resize();
  window.addEventListener("resize", resize, {passive:true});

  const PARTICLE_COUNT = 55;
  const particles = Array.from({length:PARTICLE_COUNT},()=>({
    x: Math.random()*window.innerWidth,
    y: Math.random()*window.innerHeight,
    r: Math.random()*1.5+0.4,
    vx:(Math.random()-0.5)*0.18,
    vy:(Math.random()-0.5)*0.18,
    a: Math.random(),
    va:0.003+Math.random()*0.004,
  }));

  let frame;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const p of particles){
      p.x += p.vx; p.y += p.vy;
      p.a += p.va;
      if(p.a>1||p.a<0) p.va*=-1;
      if(p.x<0) p.x=canvas.width;
      if(p.x>canvas.width) p.x=0;
      if(p.y<0) p.y=canvas.height;
      if(p.y>canvas.height) p.y=0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,212,255,${p.a*0.35})`;
      ctx.fill();
    }
    frame = requestAnimationFrame(draw);
  }
  draw();

  // Pause when tab hidden to avoid memory/CPU waste
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden) cancelAnimationFrame(frame);
    else draw();
  });
}

// ================= REALTIME =================
function startRealtime(){
  db.channel("posts-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"posts"},
      ()=>{ if(state.view==="home") loadFeed(); })
    .subscribe();

  db.channel("notifs-live")
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"notifications",
       filter:`user_id=eq.${state.user.id}`},
      ()=> updateNotifBadge())
    .subscribe();

  db.channel("dm-badge-live")
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"messages",
       filter:`receiver_id=eq.${state.user.id}`},
      ()=> updateDMBadge())
    .subscribe();
}

// ================= NAV =================
function goHome(){
  $("searchInput").value="";
  state.tab="forYou";
  $("tabForYou")?.classList.add("tab-active");
  $("tabFollowing")?.classList.remove("tab-active");
  loadFeed();
}
function goJobs(){
  state.view="jobs"; setActiveNav("nav-jobs");
  showComposer(false); showFeedTabs(false);
  $("feed").innerHTML=`<div class="empty-state">💼 Jobs coming soon</div>`;
}
function goSurveys(){
  state.view="surveys"; setActiveNav("nav-surveys");
  showComposer(false); showFeedTabs(false);
  $("feed").innerHTML=`<div class="empty-state">📋 Surveys coming soon</div>`;
}

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
