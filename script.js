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
  onlineSet:    new Set(),
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
  initInfiniteScroll();
  await Promise.all([loadProfiles(), loadSocialData()]);
  await loadFeed();
  startRealtime();
  initPresence();
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

  // Reset infinite scroll state
  feedPage = 0;
  feedLoading = false;
  feedExhausted = false;
  state.posts = [];

  showSkeletons(4);

  if(state.tab==="following" && !state.followingSet.size){
    $("feed").innerHTML = `<div class="empty-state">You're not following anyone yet.<br>Follow people to see their posts here.</div>`;
    return;
  }

  await loadFeedPage();
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
      <div class="content" style="cursor:pointer" onclick="openPost('${p.id}')">${escHtml(p.content)}</div>
      ${p.image ? `<img src="${p.image}" loading="lazy" style="cursor:pointer" onclick="openPost('${p.id}')">` : ""}
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
  setUploadProgress(0);

  if(imgInput?.files?.[0]){
    setUploadProgress(20);
    const file = imgInput.files[0];
    const {data,error} = await db.storage.from("images")
      .upload(`${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
    if(error) alert("Image upload failed: "+error.message);
    else { const {data:u}=db.storage.from("images").getPublicUrl(data.path); image=u.publicUrl; }
    setUploadProgress(60);
  }

  if(vidInput?.files?.[0]){
    setUploadProgress(40);
    const file = vidInput.files[0];
    const {data,error} = await db.storage.from("videos")
      .upload(`${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
    if(error) alert("Video upload failed: "+error.message);
    else { const {data:u}=db.storage.from("videos").getPublicUrl(data.path); video=u.publicUrl; }
    setUploadProgress(80);
  }

  const {error} = await db.from("posts").insert([{
    content:text, user_id:state.user.id, image, video
  }]);

  setUploadProgress(100);
  postBtn.disabled = false;
  postBtn.textContent = "Post";
  if(error) throw error;

  $("postInput").value="";
  autoResizeTextarea($("postInput"));
  if(imgInput) imgInput.value="";
  if(vidInput) vidInput.value="";
  setTimeout(()=>setUploadProgress(null), 600);

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
  } else if(state.view==="profile_other"){
    // Update the follow button in-place without full re-render
    const btn = $(`followBtn-${userId}`);
    if(btn){
      const nowFollowing = state.followingSet.has(userId);
      btn.textContent = nowFollowing ? "✓ Following" : "+ Follow";
      btn.className = `follow-btn${nowFollowing?" following":""}`;
    }
    const cntEl = $("follCount");
    if(cntEl){
      const {count} = await db.from("follows").select("*",{count:"exact",head:true}).eq("following_id",userId);
      cntEl.textContent = count||0;
    }
  }
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
let profileTab = "posts";

async function goProfile(userId){
  const targetId = userId || state.user?.id;
  if(!targetId) return;
  const isMe = targetId === state.user?.id;
  state.view = isMe ? "profile" : "profile_other";
  profileTab = "posts";

  setActiveNav(isMe ? "nav-profile" : null);
  showComposer(false);
  showFeedTabs(false);

  await ensureProfile(targetId);
  const me = state.profilesMap[targetId]||{};
  const following = state.followingSet.has(targetId);

  const [follRes, followingRes] = await Promise.all([
    db.from("follows").select("*",{count:"exact",head:true}).eq("following_id",targetId),
    db.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",targetId),
  ]);

  const avatarLetter = (me.username||"U")[0].toUpperCase();
  const avatarInner  = me.avatar_url
    ? `<img src="${me.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : avatarLetter;

  $("feed").innerHTML = `
    <div class="profile-banner" style="${me.banner_url?`background-image:url('${me.banner_url}')`:``}"></div>
    <div class="profile-card" style="margin-top:-40px;position:relative">
      <div class="profile-avatar" style="${me.avatar_url?'background:none;overflow:hidden;padding:0':''}">${avatarInner}</div>
      <div class="profile-info">
        <div class="profile-username">@${escHtml(me.username||"user")}</div>
        ${me.bio ? `<div class="profile-bio">${escHtml(me.bio)}</div>` : ""}
        <div class="profile-balance">💰 K${me.balance||0}</div>
        <div class="profile-stats">
          <span><strong id="follCount">${follRes.count||0}</strong> Followers</span>
          <span><strong>${followingRes.count||0}</strong> Following</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center">
        ${isMe ? `
          <button class="comment-btn" onclick="openEditModal()">✏️ Edit Profile</button>` : `
          <button class="follow-btn ${following?"following":""}" id="followBtn-${targetId}" onclick="toggleFollow('${targetId}')">
            ${following?"✓ Following":"+ Follow"}
          </button>
          <button class="dm-btn" style="padding:8px 16px;border-radius:14px" onclick="startDM('${targetId}')">💬 Message</button>
          <span class="presence-chip ${state.onlineSet.has(targetId)?"online":"offline"}" id="presChip-${targetId}" data-presence="${targetId}">
            ${state.onlineSet.has(targetId)?"🟢 Online":"⚫ Offline"}
          </span>`}
      </div>
    </div>
    <div class="profile-tabs">
      <button class="tab-btn tab-active"  id="ptab-posts"  onclick="switchProfileTab('posts','${targetId}',${isMe})">Posts</button>
      <button class="tab-btn"             id="ptab-media"  onclick="switchProfileTab('media','${targetId}',${isMe})">Media</button>
      <button class="tab-btn"             id="ptab-likes"  onclick="switchProfileTab('likes','${targetId}',${isMe})">Likes</button>
      <button class="tab-btn"             id="ptab-replies" onclick="switchProfileTab('replies','${targetId}',${isMe})">Replies</button>
    </div>
    <div id="profileContent"></div>`;

  loadProfileTab("posts", targetId, isMe);
}

function switchProfileTab(tab, targetId, isMe){
  profileTab = tab;
  ["posts","media","likes","replies"].forEach(t=>{
    $(`ptab-${t}`)?.classList.toggle("tab-active", t===tab);
  });
  loadProfileTab(tab, targetId, isMe);
}

async function loadProfileTab(tab, targetId, isMe){
  const container = $("profileContent");
  if(!container) return;
  container.innerHTML = `<div class="skeleton-card"><div class="skeleton-row"><div class="skeleton-line" style="height:80px;width:100%"></div></div></div>`;

  if(tab==="posts"){
    const {data} = await db.from("posts").select("*")
      .eq("user_id",targetId).order("created_at",{ascending:false});
    if(!data?.length){ container.innerHTML=`<div class="empty-state">No posts yet.</div>`; return; }
    container.innerHTML = data.map(p=>postCard(p)).join("");

  } else if(tab==="media"){
    const {data} = await db.from("posts").select("*")
      .eq("user_id",targetId).not("image","is",null).order("created_at",{ascending:false});
    const withMedia = (data||[]).filter(p=>p.image||p.video);
    if(!withMedia.length){ container.innerHTML=`<div class="empty-state">No media posts yet.</div>`; return; }
    container.innerHTML = `<div class="media-grid">${withMedia.map(p=>`
      <div class="media-thumb" onclick="openPost('${p.id}')">
        ${p.image?`<img src="${p.image}" loading="lazy">`:`<video src="${p.video}"></video>`}
      </div>`).join("")}</div>`;

  } else if(tab==="likes"){
    const {data:likeData} = await db.from("likes").select("post_id").eq("user_id",targetId);
    const ids = (likeData||[]).map(l=>l.post_id);
    if(!ids.length){ container.innerHTML=`<div class="empty-state">No liked posts yet.</div>`; return; }
    const {data} = await db.from("posts").select("*").in("id",ids).order("created_at",{ascending:false});
    await Promise.all([...new Set((data||[]).map(p=>p.user_id))].map(ensureProfile));
    container.innerHTML = (data||[]).map(p=>postCard(p)).join("");

  } else if(tab==="replies"){
    const {data} = await db.from("comments").select("*")
      .eq("user_id",targetId).order("created_at",{ascending:false}).limit(20);
    if(!data?.length){ container.innerHTML=`<div class="empty-state">No replies yet.</div>`; return; }
    container.innerHTML = data.map(c=>`
      <div class="post" style="cursor:pointer" onclick="openPost('${c.post_id}')">
        <div class="post-header-row">
          <div class="post-avatar">${(state.profilesMap[targetId]?.username||"U")[0].toUpperCase()}</div>
          <div class="post-meta">
            <span class="username">@${state.profilesMap[targetId]?.username||"user"}</span>
            <span class="post-time">${timeAgo(c.created_at)}</span>
          </div>
        </div>
        <div class="content" style="color:#8899aa">↩ Reply: ${escHtml(c.content)}</div>
      </div>`).join("");
  }
}

// ================= PROFILE EDIT =================
function openEditModal(){
  const me = state.profilesMap[state.user?.id]||{};
  const uInput = $("editUsername");
  const bInput = $("editBio");
  if(uInput) uInput.value = me.username||"";
  if(bInput) bInput.value = me.bio||"";
  $("editModal").style.display = "flex";
}

function closeEditModal(e){
  if(e && e.target !== $("editModal")) return;
  $("editModal").style.display = "none";
}

const saveProfile = safe(async()=>{
  const username   = $("editUsername")?.value.trim();
  const bio        = $("editBio")?.value.trim();
  const avatarFile = $("editAvatarFile")?.files?.[0];
  const bannerFile = $("editBannerFile")?.files?.[0];

  if(!username){ alert("Username cannot be empty."); return; }

  const updates = { username, bio: bio||"" };

  const progressWrap = $("editProgress");
  const progressBar  = $("editProgressBar");
  if(progressWrap) progressWrap.style.display = "block";

  let step = 0;
  const setProgress = pct => { if(progressBar) progressBar.style.width = pct+"%"; };

  if(avatarFile){
    setProgress(20);
    const {data,error} = await db.storage.from("images")
      .upload(`avatars/${state.user.id}_${Date.now()}`, avatarFile, {upsert:true});
    if(!error){ const {data:u}=db.storage.from("images").getPublicUrl(data.path); updates.avatar_url=u.publicUrl; }
    setProgress(50);
  }

  if(bannerFile){
    setProgress(60);
    const {data,error} = await db.storage.from("images")
      .upload(`banners/${state.user.id}_${Date.now()}`, bannerFile, {upsert:true});
    if(!error){ const {data:u}=db.storage.from("images").getPublicUrl(data.path); updates.banner_url=u.publicUrl; }
    setProgress(85);
  }

  const {error} = await db.from("profiles").update(updates).eq("user_id",state.user.id);
  if(error) throw error;

  setProgress(100);
  state.profilesMap[state.user.id] = {...(state.profilesMap[state.user.id]||{}), ...updates};
  refreshUserHeader();

  setTimeout(()=>{
    if(progressWrap) progressWrap.style.display = "none";
    $("editModal").style.display = "none";
    goProfile();
  }, 500);
});

// saveUsername kept for legacy calls
async function saveUsername(){ openEditModal(); }

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
      <div class="avatar-wrap">
        <div class="who-avatar">${(u.username||"U")[0].toUpperCase()}</div>
        ${presenceDot(u.user_id)}
      </div>
      <div class="who-name" onclick="goProfile('${u.user_id}')">@${u.username}</div>
      <button class="follow-btn" onclick="toggleFollow('${u.user_id}')">+ Follow</button>
    </div>`).join("");
}

// ================= PRESENCE =================
let presenceChannel = null;

function initPresence(){
  if(presenceChannel) { db.removeChannel(presenceChannel); presenceChannel = null; }

  presenceChannel = db.channel("kudasai-presence", {
    config: { presence: { key: state.user.id } }
  });

  presenceChannel
    .on("presence", { event: "sync" }, ()=>{
      const raw = presenceChannel.presenceState();
      state.onlineSet = new Set(Object.keys(raw));
      updateAllPresenceDots();
    })
    .on("presence", { event: "join" }, ({ key })=>{
      state.onlineSet.add(key);
      updatePresenceDot(key, true);
    })
    .on("presence", { event: "leave" }, ({ key })=>{
      state.onlineSet.delete(key);
      updatePresenceDot(key, false);
    })
    .subscribe(async (status)=>{
      if(status === "SUBSCRIBED"){
        await presenceChannel.track({
          user_id:   state.user.id,
          online_at: new Date().toISOString()
        });
      }
    });
}

function presenceDot(userId){
  const online = state.onlineSet.has(userId);
  return `<span class="presence-dot ${online?"online":"offline"}" data-presence="${userId}" title="${online?"Online":"Offline"}"></span>`;
}

function updateAllPresenceDots(){
  document.querySelectorAll("[data-presence]").forEach(el=>{
    const uid = el.dataset.presence;
    const online = state.onlineSet.has(uid);
    el.className = `presence-dot ${online?"online":"offline"}`;
    el.title = online ? "Online" : "Offline";
  });
}

function updatePresenceDot(userId, online){
  // Update all small dots
  document.querySelectorAll(`.presence-dot[data-presence="${userId}"]`).forEach(el=>{
    el.className = `presence-dot ${online?"online":"offline"}`;
    el.title = online ? "Online" : "Offline";
  });
  // Update presence chip on profile page
  document.querySelectorAll(`.presence-chip[data-presence="${userId}"]`).forEach(el=>{
    el.className = `presence-chip ${online?"online":"offline"}`;
    el.textContent = online ? "🟢 Online" : "⚫ Offline";
  });
  // Update status line in DM header
  const dmStatus = $(`dm-status-${userId}`);
  if(dmStatus) dmStatus.textContent = online ? "🟢 Online" : "⚫ Offline";
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
          <div class="avatar-wrap">
            <div class="post-avatar">${(u.username||"?")[0].toUpperCase()}</div>
            ${presenceDot(c.otherId)}
          </div>
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
      <div class="avatar-wrap">
        <div class="post-avatar" style="width:32px;height:32px;font-size:13px">${(other.username||"?")[0].toUpperCase()}</div>
        ${presenceDot(otherId)}
      </div>
      <div>
        <span class="dm-header-name">@${other.username||"user"}</span>
        <div id="dm-status-${otherId}" class="dm-status-text">${state.onlineSet.has(otherId)?"🟢 Online":"⚫ Offline"}</div>
      </div>
    </div>
    <div class="dm-thread" id="dmThread"></div>
    <div class="typing-indicator" id="typingIndicator" style="display:none">
      <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
    </div>
    <div class="dm-input-row">
      <input class="comment-input" id="dmInput" placeholder="Message @${other.username||"user"}…"
        onkeydown="if(event.key==='Enter') sendMessage('${otherId}')">
      <button class="comment-btn" onclick="sendMessage('${otherId}')">Send</button>
    </div>`;

  await loadThread(otherId);
  initDMTyping(otherId);

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

// ================= POST DETAIL MODAL =================
async function openPost(postId){
  const modal = $("postModal");
  const box   = $("postModalBox");
  if(!modal||!box) return;

  box.innerHTML = `<div class="skeleton-card"><div class="skeleton-row"><div class="skeleton-avatar skeleton-line"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="skeleton-line" style="height:12px;width:40%"></div></div></div><div class="skeleton-line" style="height:14px;width:90%;margin-bottom:8px"></div><div class="skeleton-line" style="height:14px;width:60%"></div></div>`;
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";

  const {data:post} = await db.from("posts").select("*").eq("id",postId).maybeSingle();
  if(!post){ box.innerHTML=`<div class="empty-state">Post not found.</div>`; return; }

  await ensureProfile(post.user_id);
  const user = state.profilesMap[post.user_id]||{};
  const liked = state.likesSet.has(post.id);
  const reposted = state.repostsSet.has(post.id);
  const bookmarked = state.bookmarksSet.has(post.id);
  const isMe = post.user_id === state.user?.id;

  const {data:comments} = await db.from("comments").select("*")
    .eq("post_id",postId).order("created_at",{ascending:true});

  await Promise.all([...new Set((comments||[]).map(c=>c.user_id))].map(ensureProfile));

  const commentsHtml = (comments||[]).length ? (comments||[]).map(c=>{
    const cu = state.profilesMap[c.user_id]||{};
    return `<div class="comment"><span class="comment-username">@${escHtml(cu.username||"user")}</span><span class="comment-content">${escHtml(c.content)}</span></div>`;
  }).join("") : `<div class="no-comments">No comments yet. Be first!</div>`;

  box.innerHTML = `
    <div class="modal-header">
      <span>Post</span>
      <button class="modal-close" onclick="closePostModal()">✕</button>
    </div>
    <div class="modal-body" style="overflow-y:auto;max-height:75vh">
      <div class="post-header-row" style="margin-bottom:14px">
        <div class="post-avatar">${(user.username||"U")[0].toUpperCase()}</div>
        <div class="post-meta">
          <span class="username">@${escHtml(user.username||"user")}</span>
          <span class="post-time">${timeAgo(post.created_at)}</span>
        </div>
        ${isMe?`<button class="delete-btn" onclick="deletePost('${post.id}');closePostModal()">🗑</button>`:""}
      </div>
      <div class="content" style="font-size:17px;margin-bottom:16px">${escHtml(post.content)}</div>
      ${post.image?`<img src="${post.image}" style="width:100%;border-radius:18px;margin-bottom:14px">`:""}
      ${post.video?`<video controls src="${post.video}" style="width:100%;border-radius:18px;margin-bottom:14px"></video>`:""}
      <div class="actions" style="margin-bottom:18px">
        <button class="${liked?"btn-liked":""}" onclick="likeBurst(event,'${post.id}')">
          ${liked?"❤️":"🤍"} ${post.likes??0}
        </button>
        <button class="${reposted?"btn-reposted":""}" onclick="repost('${post.id}')">🔁 ${reposted?"Reposted":"Repost"}</button>
        <button class="${bookmarked?"btn-bookmarked":""}" onclick="bookmark('${post.id}')">
          ${bookmarked?"🔖":"🏷"} ${bookmarked?"Saved":"Save"}
        </button>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:16px">
        <div class="comments-list" style="margin-bottom:14px">${commentsHtml}</div>
        <div class="comment-input-row">
          <input class="comment-input" id="modalCommentInput" placeholder="Add a comment…"
            onkeydown="if(event.key==='Enter') submitModalComment('${post.id}')">
          <button class="comment-btn" onclick="submitModalComment('${post.id}')">Send</button>
        </div>
      </div>
    </div>`;
}

function closePostModal(e){
  if(e && e.target !== $("postModal")) return;
  $("postModal").style.display = "none";
  document.body.style.overflow = "";
}

const submitModalComment = safe(async(postId)=>{
  const input = $("modalCommentInput");
  const text  = input?.value.trim();
  if(!text) return;
  const {error} = await db.from("comments").insert([{
    post_id:postId, user_id:state.user.id, content:text
  }]);
  if(error) throw error;
  input.value = "";
  openPost(postId);
});

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
  if(state.view==="home") render();
  else if(state.view==="profile"||state.view==="profile_other") goProfile();
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

// ================= COMPOSER ENHANCEMENTS =================
const EMOJIS = ["😀","😂","🥹","😍","🤩","😎","🥳","🤔","😤","🔥","💯","❤️","💖","✨","🎉","👀","💀","🤣","😭","🫡","🙏","💪","🎯","🚀","🌙","⚡","💎","👑","🌊","🎶","🍕","🤝","💬","📸","🎥"];

function toggleEmoji(){
  const picker = $("emojiPicker");
  if(!picker) return;
  if(picker.style.display==="none" || !picker.innerHTML){
    picker.innerHTML = EMOJIS.map(e=>
      `<span class="emoji-item" onclick="insertEmoji('${e}')">${e}</span>`
    ).join("");
    picker.style.display = "flex";
  } else {
    picker.style.display = "none";
  }
}

function insertEmoji(emoji){
  const ta = $("postInput");
  if(!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const val   = ta.value;
  ta.value = val.slice(0,start) + emoji + val.slice(end);
  ta.selectionStart = ta.selectionEnd = start + emoji.length;
  ta.focus();
  autoResizeTextarea(ta);
}

function autoResizeTextarea(ta){
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 300)+"px";
}

function setUploadProgress(pct){
  const wrap = $("uploadProgress");
  const bar  = $("uploadProgressBar");
  if(!wrap||!bar) return;
  if(pct===null){ wrap.style.display="none"; bar.style.width="0%"; return; }
  wrap.style.display = "block";
  bar.style.width = pct+"%";
}

// ================= INFINITE SCROLL =================
let feedPage = 0;
const PAGE_SIZE = 10;
let feedLoading = false;
let feedExhausted = false;

async function loadFeedPage(){
  if(feedLoading || feedExhausted) return;
  feedLoading = true;

  let query = db.from("posts").select("*")
    .order("created_at",{ascending:false})
    .range(feedPage*PAGE_SIZE, (feedPage+1)*PAGE_SIZE-1);

  if(state.tab==="following"){
    const ids = [...state.followingSet];
    if(!ids.length){ feedLoading=false; return; }
    query = db.from("posts").select("*").in("user_id",ids)
      .order("created_at",{ascending:false})
      .range(feedPage*PAGE_SIZE, (feedPage+1)*PAGE_SIZE-1);
  }

  const {data,error} = await query;
  feedLoading = false;
  if(error || !data?.length){ feedExhausted=true; return; }

  await Promise.all([...new Set(data.map(p=>p.user_id))].map(ensureProfile));

  if(feedPage===0){
    state.posts = data;
    render();
  } else {
    state.posts = [...state.posts, ...data];
    const feed = $("feed");
    if(feed){
      const frag = document.createDocumentFragment();
      data.forEach(p=>{
        const div = document.createElement("div");
        div.innerHTML = postCard(p);
        frag.appendChild(div.firstElementChild);
      });
      feed.appendChild(frag);
    }
  }

  if(data.length < PAGE_SIZE) feedExhausted = true;
  feedPage++;
}

function initInfiniteScroll(){
  const sentinel = $("feedSentinel");
  if(!sentinel) return;
  const obs = new IntersectionObserver(entries=>{
    if(entries[0].isIntersecting && state.view==="home") loadFeedPage();
  },{rootMargin:"200px"});
  obs.observe(sentinel);
}

// ================= DM TYPING INDICATOR =================
let typingTimer = null;
let isTyping = false;
const TYPING_CHANNEL_PREFIX = "typing-";

function initDMTyping(otherId){
  const input = $("dmInput");
  if(!input) return;

  const channelName = TYPING_CHANNEL_PREFIX+[state.user.id,otherId].sort().join("-");

  input.addEventListener("input",()=>{
    if(!isTyping){
      isTyping = true;
      db.channel(channelName).send({type:"broadcast",event:"typing",payload:{userId:state.user.id}})
        .catch(()=>{});
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(()=>{ isTyping=false; },2000);
  });

  db.channel(channelName)
    .on("broadcast",{event:"typing"},(payload)=>{
      if(payload.payload?.userId===otherId){
        const indicator = $("typingIndicator");
        if(indicator){
          indicator.style.display="flex";
          clearTimeout(indicator._timer);
          indicator._timer = setTimeout(()=>{ indicator.style.display="none"; },2500);
        }
      }
    })
    .subscribe();
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async()=>{
  $("loginBtn").onclick  = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick   = createPost;

  // Enter key to post (Ctrl+Enter or Cmd+Enter)
  $("postInput")?.addEventListener("keydown", e=>{
    if((e.ctrlKey||e.metaKey) && e.key==="Enter"){ e.preventDefault(); createPost(); }
  });

  // Auto-resize textarea
  $("postInput")?.addEventListener("input", e=>{
    autoResizeTextarea(e.target);
    // Hide emoji picker when typing
    const picker = $("emojiPicker");
    if(picker) picker.style.display="none";
  });

  // Close emoji picker on outside click
  document.addEventListener("click", e=>{
    const picker = $("emojiPicker");
    const btn = $("emojiBtn");
    if(picker && btn && !picker.contains(e.target) && e.target!==btn){
      picker.style.display="none";
    }
  });

  // Escape closes modals
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      closePostModal();
      $("editModal").style.display="none";
    }
  });

  const {data} = await db.auth.getSession();
  if(data?.session?.user){
    state.user = data.session.user;
    start();
  }
});
