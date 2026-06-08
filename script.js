// ========================================
// KUDASAI ENGINE
// ========================================

const { createClient } = supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
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
  mutesSet:     new Set(),
  blocksSet:    new Set(),
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
  // Sync mobile bottom nav
  const mobileMap = {
    "nav-home":"mnav-home","nav-explore":"mnav-explore",
    "nav-notifs":"mnav-notifs","nav-messages":"mnav-messages"
  };
  document.querySelectorAll(".mob-nav-item").forEach(el=>el.classList.remove("active-mob-nav"));
  if(id && mobileMap[id]){
    const mel = $(mobileMap[id]);
    if(mel) mel.classList.add("active-mob-nav");
  }
}

// ================= AUTH =================
const login = safe(async()=>{
  const email = $("email").value.trim();
  const pass  = $("password").value;
  if(!email || !pass){ showAuthError("Please enter your email and password."); return; }
  const {data,error} = await db.auth.signInWithPassword({ email, password:pass });
  if(error){ showAuthError(error.message); return; }
  state.user = data.user;
  start();
});

const signup = safe(async()=>{
  const email = $("email").value.trim();
  const pass  = $("password").value;
  if(!email || !pass){ showAuthError("Please enter your email and password."); return; }
  if(pass.length < 6){ showAuthError("Password must be at least 6 characters."); return; }
  const {data,error} = await db.auth.signUp({ email, password:pass });
  if(error){ showAuthError(error.message); return; }
  if(data.user && !data.user.identities?.length === 0){
    await db.from("profiles").insert([{ user_id:data.user.id, username:email.split("@")[0], balance:0 }]).catch(()=>{});
  }
  showAuthError("Account created! Check your email to confirm, then log in.", "success");
});

const loginWithGoogle = safe(async()=>{
  const {error} = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href }
  });
  if(error){ showAuthError(error.message); return; }
});

function showAuthError(msg, type="error"){
  let el = $("authError");
  if(!el){
    el = document.createElement("p");
    el.id = "authError";
    el.className = "auth-error";
    $("authScreen")?.querySelector(".auth-box")?.appendChild(el);
  }
  el.textContent = msg;
  el.style.color = type==="success" ? "#4ade80" : "#ff6b6b";
  el.style.display = "block";
  if(type==="success") return;
  setTimeout(()=>{ el.style.display="none"; }, 4000);
}

// ================= LANDING PAGE =================
function enterApp(){
  const landing = $("landingPage");
  if(!landing) return;
  landing.classList.add("exiting");
  setTimeout(()=>{
    landing.style.display = "none";
    const auth = $("authScreen");
    if(auth) auth.style.display = "flex";
    initLandingParticles(false);
  }, 580);
}

function initLandingParticles(run=true){
  const canvas = $("landingCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  let W = canvas.width  = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  let animId;
  const particles = Array.from({length:80},()=>({
    x: Math.random()*W, y: Math.random()*H,
    vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4,
    r: Math.random()*1.5+0.5,
    a: Math.random()
  }));
  function draw(){
    ctx.clearRect(0,0,W,H);
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy;
      if(p.x<0) p.x=W; if(p.x>W) p.x=0;
      if(p.y<0) p.y=H; if(p.y>H) p.y=0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(0,212,255,${p.a*0.5})`;
      ctx.fill();
    });
    animId = requestAnimationFrame(draw);
  }
  if(run){
    draw();
    window.addEventListener("resize",()=>{
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    },{once:false});
  } else {
    cancelAnimationFrame(animId);
  }
}

// ================= START =================
async function start(){
  // Hide landing and auth, show app
  const landing = $("landingPage");
  if(landing) landing.style.display = "none";
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "grid";
  initParticles();
  initInfiniteScroll();
  initPullToRefresh();
  await Promise.all([loadProfiles(), loadSocialData()]);
  await loadFeed();
  startRealtime();
  initPresence();
  updateNotifBadge();
  updateDMBadge();
  loadSidebar();
  loadStories();
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

  // Load mutes/blocks gracefully (tables may not exist yet)
  try {
    const [mutesRes, blocksRes] = await Promise.all([
      db.from("mutes").select("muted_id").eq("user_id",state.user.id),
      db.from("blocks").select("blocked_id").eq("user_id",state.user.id),
    ]);
    state.mutesSet  = new Set((mutesRes.data||[]).map(r=>r.muted_id));
    state.blocksSet = new Set((blocksRes.data||[]).map(r=>r.blocked_id));
  } catch(e){ console.warn("mutes/blocks:", e?.message); }
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
  loadStories();
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
  if(p.user_id && p.user_id !== state.user?.id && (state.mutesSet?.has(p.user_id) || state.blocksSet?.has(p.user_id))) return "";
  const user      = state.profilesMap[p.user_id] || {};
  const isMe      = p.user_id === state.user?.id;
  const liked     = state.likesSet.has(p.id);
  const bookmarked= state.bookmarksSet.has(p.id);
  const reposted  = state.repostsSet.has(p.id);
  const following = state.followingSet.has(p.user_id);
  const verified  = user.verified;

  const quotedHtml = (p.quoted_content && p.quoted_username) ? `
    <div class="quote-card" onclick="event.stopPropagation();${p.quoted_post_id?`openPost('${p.quoted_post_id}')`:''}">
      <div class="quote-username">@${escHtml(p.quoted_username)}</div>
      <div class="quote-content">${escHtml(p.quoted_content)}</div>
    </div>` : "";

  return `
    <div class="post" id="post-${p.id}">
      <div class="post-shimmer"></div>
      <div class="post-header-row">
        <div class="post-avatar" onclick="goProfile('${p.user_id}')" style="cursor:pointer${user.avatar_url?';background:none;padding:0;overflow:hidden':''}">
          ${user.avatar_url?`<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(user.username||"U")[0].toUpperCase()}
        </div>
        <div class="post-meta">
          <div style="display:flex;align-items:center;gap:5px">
            <span class="username" onclick="goProfile('${p.user_id}')" style="cursor:pointer">@${user.username||"user"}</span>
            ${verified ? `<span class="verify-badge" title="Verified">✓</span>` : ""}
          </div>
          <span class="post-time">${timeAgo(p.created_at)}</span>
        </div>
        ${!isMe ? `
          <button class="follow-btn ${following?"following":""}" onclick="toggleFollow('${p.user_id}')">
            ${following?"✓ Following":"+ Follow"}
          </button>
          <button class="post-more-btn" onclick="openUserMenu(event,'${p.user_id}')">⋯</button>` : `
          <button class="delete-btn" onclick="deletePost('${p.id}')" title="Delete post">🗑</button>`}
      </div>
      <div class="content" style="cursor:pointer" onclick="openPost('${p.id}')">${parseContent(p.content)}</div>
      ${quotedHtml}
      ${p.poll_options ? renderPollCard(p) : mediaHtml(p)}
      <div class="actions">
        <button class="${liked?"btn-liked":""}" onclick="likeBurst(event,'${p.id}')">
          ${liked?"❤️":"🤍"} ${p.likes??0}
        </button>
        <button onclick="toggleComments('${p.id}')">💬 Comment</button>
        <button class="${reposted?"btn-reposted":""}" onclick="repost('${p.id}')">
          🔁${reposted?" Reposted":"Repost"}
        </button>
        <button onclick="quoteRepost('${p.id}','${escHtml(user.username||"user")}','${escHtml((p.content||"").slice(0,80))}')">🗣 Quote</button>
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
  const vidInput = $("videoInput");
  const imgFiles = _pendingImgFiles.slice(); // snapshot of staged images

  const pollOptions = _pollActive ? getPollOptions() : [];
  const isPoll = _pollActive && pollOptions.length >= 2;

  if(!text && imgFiles.length === 0 && !vidInput?.files?.[0] && !isPoll){
    alert("Write something, attach a photo/video, or create a poll.");
    return;
  }
  if(_pollActive && pollOptions.length < 2){
    alert("Add at least 2 poll options.");
    return;
  }

  const postBtn = $("postBtn");
  postBtn.disabled = true;
  postBtn.textContent = "Posting…";

  let image=null, video=null;
  setUploadProgress(0);

  // Upload all staged images in parallel
  if(imgFiles.length > 0){
    setUploadProgress(15);
    const uploads = await Promise.all(imgFiles.map(async(file)=>{
      const path = `${state.user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
      const {data,error} = await db.storage.from("images").upload(path, file, {upsert:true});
      if(error){ console.warn("Image upload failed:", error.message); return null; }
      const {data:u} = db.storage.from("images").getPublicUrl(data.path);
      return u.publicUrl;
    }));
    const validUrls = uploads.filter(Boolean);
    if(validUrls.length === 1)      image = validUrls[0];
    else if(validUrls.length > 1)   image = JSON.stringify(validUrls);
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

  const insertObj = { content:text, user_id:state.user.id, image, video };
  if(quoteState){
    insertObj.quoted_post_id  = quoteState.postId;
    insertObj.quoted_content  = quoteState.content;
    insertObj.quoted_username = quoteState.username;
  }
  if(isPoll){
    const durationDays = parseInt($("pollDuration")?.value||"3");
    const ends = new Date(Date.now() + durationDays*24*60*60*1000).toISOString();
    insertObj.poll_options  = JSON.stringify(pollOptions);
    insertObj.poll_votes    = JSON.stringify({});
    insertObj.poll_ends_at  = ends;
  }
  const {error} = await db.from("posts").insert([insertObj]);

  setUploadProgress(100);
  postBtn.disabled = false;
  postBtn.textContent = "Post";
  if(error) throw error;

  $("postInput").value="";
  autoResizeTextarea($("postInput"));
  _pendingImgFiles = [];
  renderComposerPreviews();
  if(vidInput) vidInput.value="";
  if(isPoll){ _pollActive=false; togglePollBuilder(); }
  clearQuote();
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
  transitionFeed();

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

  _allNotifs = notifs;

  $("feed").innerHTML = `
    <div class="notif-filters">
      <button class="notif-filter-btn active" onclick="filterNotifications('all')">All</button>
      <button class="notif-filter-btn" onclick="filterNotifications('like')">❤️ Likes</button>
      <button class="notif-filter-btn" onclick="filterNotifications('comment')">💬 Comments</button>
      <button class="notif-filter-btn" onclick="filterNotifications('follow')">👤 Follows</button>
      <button class="notif-filter-btn" onclick="filterNotifications('message')">✉️ Messages</button>
    </div>
    <div id="notifList"></div>`;

  filterNotifications("all");
}

async function updateNotifBadge(){
  if(!state.user) return;
  const {count} = await db.from("notifications").select("*",{count:"exact",head:true})
    .eq("user_id",state.user.id).eq("read",false);
  const badge  = $("notifBadge");
  const mbadge = $("mnotifBadge");
  if(count>0){
    if(badge){ badge.textContent=count>9?"9+":count; badge.style.display="flex"; }
    if(mbadge) mbadge.style.display="block";
  } else {
    if(badge) badge.style.display="none";
    if(mbadge) mbadge.style.display="none";
  }
}

// ================= BOOKMARKS =================
async function goBookmarks(){
  state.view="bookmarks";
  setActiveNav("nav-bookmarks");
  showComposer(false);
  showFeedTabs(false);
  transitionFeed();

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
        ${me.status_message ? `<div class="profile-status">💭 ${escHtml(me.status_message)}</div>` : ""}
        <div class="profile-balance">💰 K${me.balance||0}</div>
        <div class="profile-stats">
          <span onclick="openFollowersList('${targetId}')" style="cursor:pointer"><strong id="follCount">${follRes.count||0}</strong> Followers</span>
          <span onclick="openFollowingList('${targetId}')" style="cursor:pointer"><strong>${followingRes.count||0}</strong> Following</span>
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
  const sInput = $("editStatusMsg");
  if(sInput) sInput.value = me.status_message||"";
  $("editModal").style.display = "flex";
}

function closeEditModal(e){
  if(e && e.target !== $("editModal")) return;
  $("editModal").style.display = "none";
}

const saveProfile = safe(async()=>{
  const username      = $("editUsername")?.value.trim();
  const bio           = $("editBio")?.value.trim();
  const statusMessage = $("editStatusMsg")?.value.trim();
  const avatarFile    = $("editAvatarFile")?.files?.[0];
  const bannerFile    = $("editBannerFile")?.files?.[0];

  if(!username){ alert("Username cannot be empty."); return; }

  const updates = { username, bio: bio||"", status_message: statusMessage||"" };

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
  transitionFeed();

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
      <label class="dm-img-btn" title="Send image">📷<input type="file" id="dmImgInput" accept="image/*" style="display:none" onchange="sendDMImage('${otherId}',this)"></label>
      <input class="comment-input" id="dmInput" placeholder="Message @${other.username||"user"}…"
        onkeydown="if(event.key==='Enter') sendMessage('${otherId}')">
      <button class="comment-btn" onclick="sendMessage('${otherId}')">Send</button>
    </div>`;

  // FIX: mark as read FIRST so badge clears immediately
  await db.from("messages").update({read:true})
    .eq("sender_id", otherId).eq("receiver_id", state.user.id).eq("read", false);
  updateDMBadge();

  await loadThread(otherId);
  initDMTyping(otherId);

  // Subscribe to this thread — also auto-mark new incoming as read
  if(dmChannel) db.removeChannel(dmChannel);
  // Filter to only incoming messages — outgoing are rendered immediately after send
  dmChannel = db.channel(`dm-thread-${[state.user.id,otherId].sort().join("-")}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",
       filter:`receiver_id=eq.${state.user.id}`},
      async(payload)=>{
        const m = payload.new;
        if(m.sender_id !== otherId) return; // different conversation
        await db.from("messages").update({read:true}).eq("id",m.id);
        updateDMBadge();
        await loadThread(otherId);
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
    thread.innerHTML=`<div class="no-comments" style="padding:30px">No messages yet. Say hi! 👋</div>`;
    return;
  }

  // Build a lookup map for reply_to support
  const msgMap = {};
  (data||[]).forEach(m=>{ msgMap[m.id] = m; });

  const otherProfile = state.profilesMap[otherId]||{};
  const meProfile    = state.profilesMap[state.user.id]||{};

  // Track the last message sent by me for read receipt display
  const lastMineId = [...(data||[])].reverse().find(m=>m.sender_id===state.user.id)?.id;

  const QUICK_REACTIONS = ["❤️","😂","🔥","👍","😮","😢"];

  thread.innerHTML = (data||[]).map(m=>{
    const mine        = m.sender_id === state.user.id;
    const wrapClass   = mine ? "dm-mine-wrap" : "dm-theirs-wrap";
    const senderName  = mine ? (meProfile.username||"You") : (otherProfile.username||"user");

    // Reply quote
    let replyHtml = "";
    if(m.reply_to_id && msgMap[m.reply_to_id]){
      const orig = msgMap[m.reply_to_id];
      const origMine = orig.sender_id === state.user.id;
      const origName = origMine ? (meProfile.username||"You") : (otherProfile.username||"user");
      replyHtml = `
        <div class="dm-quoted" onclick="scrollToMessage('${orig.id}')">
          <div class="dm-quoted-name">↩ @${escHtml(origName)}</div>
          <div class="dm-quoted-text">${escHtml((orig.content||"").slice(0,80))}</div>
        </div>`;
    }

    // Reactions
    const reactions = m.reactions ? (typeof m.reactions === "string" ? JSON.parse(m.reactions) : m.reactions) : {};
    const reactionHtml = Object.keys(reactions).length ? `
      <div class="dm-reactions">
        ${Object.entries(reactions).map(([emoji,users])=>`
          <div class="dm-reaction ${users.includes(state.user.id)?"reacted":""}"
               onclick="addDMReaction('${m.id}','${emoji}','${otherId}')">
            ${emoji}<span class="dm-reaction-count">${users.length}</span>
          </div>`).join("")}
      </div>` : "";

    // Read receipt — only on the last message I sent
    const readHtml = (mine && m.id===lastMineId) ? (m.read ? `<div class="dm-read-receipt">✓✓ Seen</div>` : `<div class="dm-read-receipt" style="opacity:.4">✓ Sent</div>`) : "";

    return `
      <div class="dm-msg-wrap ${wrapClass}" id="dmsg-${m.id}">
        <div class="dm-quick-reactions">
          ${QUICK_REACTIONS.map(e=>`<span class="dm-quick-react-emoji" onclick="addDMReaction('${m.id}','${e}','${otherId}')">${e}</span>`).join("")}
        </div>
        <button class="dm-reply-btn" onclick="setDMReply('${m.id}','${escHtml((m.content||"").slice(0,60))}','${escHtml(senderName)}')">↩ Reply</button>
        ${mine?`<button class="dm-delete-btn" onclick="deleteDMMessage('${m.id}','${otherId}')" title="Delete">🗑</button>`:""}
        <div class="dm-bubble">
          ${replyHtml}
          ${renderDMContent(m.content)}
        </div>
        ${reactionHtml}
        ${readHtml}
        <div class="dm-time">${timeAgo(m.created_at)}</div>
      </div>`;
  }).join("");

  thread.scrollTop = thread.scrollHeight;
}

const sendMessage = safe(async(otherId)=>{
  const input = $("dmInput");
  const text  = input?.value.trim();
  if(!text) return;

  const msgObj = {
    sender_id:   state.user.id,
    receiver_id: otherId,
    content:     text,
    read:        false
  };

  // Attach reply_to_id if replying
  if(dmReplyState){
    msgObj.reply_to_id = dmReplyState.msgId;
    clearDMReply();
  }

  const {error} = await db.from("messages").insert([msgObj]);
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
  const badge  = $("dmBadge");
  const mbadge = $("mdmBadge");
  if(count>0){
    if(badge){ badge.textContent=count>9?"9+":count; badge.style.display="flex"; }
    if(mbadge) mbadge.style.display="block";
  } else {
    if(badge) badge.style.display="none";
    if(mbadge) mbadge.style.display="none";
  }
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
      <div class="content" style="font-size:17px;margin-bottom:16px">${parseContent(post.content)}</div>
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
  const sb=$("storiesBar"); if(sb) sb.style.display=show?"flex":"none";
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
let _realtimeChannels = [];

function startRealtime(){
  // Prevent duplicate subscriptions — tear down any existing channels first
  _realtimeChannels.forEach(ch=>{ try{ db.removeChannel(ch); }catch(e){} });
  _realtimeChannels = [];

  // Smart post updates: prepend on INSERT, remove on DELETE, no full reload
  const postsCh = db.channel("posts-live")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"posts"},
      async(payload)=>{
        if(state.view!=="home" || !payload?.new) return;
        const p = payload.new;
        if(p.user_id===state.user.id) return; // own posts already rendered
        if(state.mutesSet?.has(p.user_id)||state.blocksSet?.has(p.user_id)) return;
        if(state.tab==="following" && !state.followingSet.has(p.user_id)) return;
        await ensureProfile(p.user_id);
        state.posts.unshift(p);
        const feed = $("feed");
        if(!feed) return;
        const div = document.createElement("div");
        div.innerHTML = postCard(p);
        const card = div.firstElementChild;
        if(card){
          card.style.cssText += ";opacity:0;transform:translateY(-10px);transition:opacity .4s,transform .4s";
          feed.prepend(card);
          requestAnimationFrame(()=>{ card.style.opacity="1"; card.style.transform="translateY(0)"; });
        }
      })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"posts"},
      (payload)=>{
        if(!payload?.old?.id) return;
        state.posts = state.posts.filter(p=>p.id!==payload.old.id);
        const el = $(`post-${payload.old.id}`);
        if(el){
          el.style.transition="opacity .25s,transform .25s";
          el.style.opacity="0"; el.style.transform="scale(0.95)";
          setTimeout(()=>el.remove(), 260);
        }
      })
    .subscribe();
  _realtimeChannels.push(postsCh);

  const notifsCh = db.channel("notifs-live")
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"notifications",
       filter:`user_id=eq.${state.user.id}`},
      async(payload)=>{
        updateNotifBadge();
        if(payload?.new){
          const n = payload.new;
          if(n.from_user_id) await ensureProfile(n.from_user_id);
          showNotifToast(n);
        }
      })
    .subscribe();
  _realtimeChannels.push(notifsCh);

  const dmCh = db.channel("dm-badge-live")
    .on("postgres_changes",
      {event:"INSERT",schema:"public",table:"messages",
       filter:`receiver_id=eq.${state.user.id}`},
      ()=> updateDMBadge())
    .subscribe();
  _realtimeChannels.push(dmCh);
}

// ================= NAV =================
function goHome(){
  $("searchInput").value="";
  state.tab="forYou";
  $("tabForYou")?.classList.add("tab-active");
  $("tabFollowing")?.classList.remove("tab-active");
  transitionFeed();
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

// ================= EXPLORE PAGE =================
async function goExplore(){
  state.view = "explore";
  setActiveNav("nav-explore");
  showComposer(false);
  showFeedTabs(false);
  transitionFeed();

  $("feed").innerHTML = `
    <div class="explore-header">
      <h2 class="explore-title">✦ Explore</h2>
      <p class="explore-sub">Discover trending posts and people</p>
    </div>
    <div class="skeleton-card"><div class="skeleton-row"><div class="skeleton-avatar skeleton-line"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div class="skeleton-line" style="height:12px;width:40%"></div></div></div><div class="skeleton-line" style="height:14px;width:90%;margin:8px 0 4px"></div></div>
    <div class="skeleton-card"><div class="skeleton-line" style="height:14px;width:80%;margin-bottom:8px"></div><div class="skeleton-line" style="height:14px;width:60%"></div></div>`;

  const now7d = new Date(Date.now() - 7*24*60*60*1000).toISOString();

  const [trendRes, discoverRes, usersRes] = await Promise.all([
    // Trending: top liked posts from last 7 days
    db.from("posts").select("*").gte("created_at", now7d)
      .order("likes", {ascending:false}).limit(8),
    // Discover: recent posts from users NOT followed
    db.from("posts").select("*").not("user_id","in",
      `(${[state.user.id,...state.followingSet].join(",") || state.user.id})`)
      .order("created_at",{ascending:false}).limit(8),
    // Suggested users
    db.from("profiles").select("*")
      .neq("user_id", state.user.id).limit(20)
  ]);

  const trending  = trendRes.data||[];
  const discover  = discoverRes.data||[];
  const allUsers  = usersRes.data||[];
  const suggested = allUsers.filter(u=>!state.followingSet.has(u.user_id)).slice(0,4);

  // Ensure profiles for posts
  const allPostUserIds = [...new Set([...trending,...discover].map(p=>p.user_id))];
  await Promise.all(allPostUserIds.map(ensureProfile));

  // Trending hashtags from trending posts
  const tagMap = new Map();
  [...trending,...discover].forEach(p=>{
    (p.content||"").match(/#\w+/g)?.forEach(t=>tagMap.set(t,(tagMap.get(t)||0)+1));
  });
  const topTags = [...tagMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);

  let html = `<div class="explore-header"><h2 class="explore-title">✦ Explore</h2><p class="explore-sub">Discover what's happening</p></div>`;

  if(topTags.length){
    html += `<div class="explore-section-title">🔥 Trending Topics</div>
    <div class="hashtag-chips">${topTags.map(([tag,n])=>`
      <div class="hashtag-chip" onclick="handleSearch('${tag}')">
        ${tag} <span class="chip-count">${n}</span>
      </div>`).join("")}</div>`;
  }

  if(suggested.length){
    html += `<div class="explore-section-title">⭐ People to Follow</div>
    <div class="explore-users">${suggested.map(u=>`
      <div class="explore-user-card">
        <div class="avatar-wrap">
          <div class="post-avatar" onclick="goProfile('${u.user_id}')" style="cursor:pointer">${(u.username||"U")[0].toUpperCase()}</div>
          ${presenceDot(u.user_id)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="explore-uname" onclick="goProfile('${u.user_id}')">@${escHtml(u.username||"user")}</div>
          ${u.bio?`<div class="explore-ubio">${escHtml(u.bio.slice(0,60))}</div>`:''}
        </div>
        <button class="follow-btn ${state.followingSet.has(u.user_id)?"following":""}" onclick="toggleFollow('${u.user_id}')">
          ${state.followingSet.has(u.user_id)?"✓ Following":"+ Follow"}
        </button>
      </div>`).join("")}</div>`;
  }

  if(trending.length){
    html += `<div class="explore-section-title">🚀 Trending Posts</div>`;
    html += trending.map(p=>postCard(p)).join("");
  }

  if(discover.length){
    html += `<div class="explore-section-title">🌐 Discover</div>`;
    html += discover.map(p=>postCard(p)).join("");
  }

  if(!trending.length && !discover.length){
    html += `<div class="empty-state">Nothing to explore yet. Be the first to post!</div>`;
  }

  $("feed").innerHTML = html;
}

// ================= QUOTE REPOST =================
let quoteState = null;

function quoteRepost(postId, username, content){
  quoteState = { postId, username, content };
  goHome();
  setTimeout(()=>{
    showComposer(true);
    const ta = $("postInput");
    if(!ta) return;
    // Show quote preview
    let qprev = $("quotePreview");
    if(!qprev){
      qprev = document.createElement("div");
      qprev.id = "quotePreview";
      qprev.className = "quote-preview-bar";
      ta.parentNode.insertBefore(qprev, ta.nextSibling);
    }
    qprev.innerHTML = `<div class="quote-preview-label">Quoting @${escHtml(username)}</div>
      <div class="quote-preview-text">${escHtml(content)}</div>
      <button class="quote-cancel" onclick="clearQuote()">✕</button>`;
    ta.focus();
    ta.placeholder = "Add your comment…";
  }, 200);
}

function clearQuote(){
  quoteState = null;
  const qprev = $("quotePreview");
  if(qprev) qprev.remove();
  const ta = $("postInput");
  if(ta) ta.placeholder = "What's happening?";
}

// ================= FULLSCREEN LIGHTBOX =================
function openLightbox(src, type="img"){
  // Route single video to gallery-free view; images go through gallery
  if(type==="vid" || type==="video"){
    const lb  = $("lightbox");
    const img = $("lightboxImg");
    const vid = $("lightboxVid");
    if(!lb) return;
    vid.src = src; vid.style.display="block";
    img.style.display="none";
    lb.style.display="flex";
    document.body.style.overflow="hidden";
    _galleryUrls=[]; // no gallery nav for video
    _updateGalleryUI();
    return;
  }
  openGallery([src], 0);
}

function closeLightbox(){
  const lb = $("lightbox");
  if(lb) lb.style.display="none";
  document.body.style.overflow="";
  const vid = $("lightboxVid");
  if(vid){ vid.pause(); vid.src=""; }
  _galleryUrls=[];
}

// ================= COMMAND PALETTE =================
const PALETTE_COMMANDS = [
  { icon:"🏠", label:"Go Home",         action:()=>goHome() },
  { icon:"🔭", label:"Explore",          action:()=>goExplore() },
  { icon:"👤", label:"My Profile",       action:()=>goProfile() },
  { icon:"🔔", label:"Notifications",    action:()=>goNotifications() },
  { icon:"🔖", label:"Bookmarks",        action:()=>goBookmarks() },
  { icon:"💬", label:"Messages",         action:()=>goMessages() },
  { icon:"💼", label:"Jobs",             action:()=>goJobs() },
  { icon:"✏️", label:"Edit Profile",     action:()=>openEditModal() },
  { icon:"🚪", label:"Log Out",          action:()=>{ db.auth.signOut(); location.reload(); }},
];

function openPalette(){
  $("cmdPalette").style.display="flex";
  $("cmdInput").value="";
  renderPaletteResults("");
  setTimeout(()=>$("cmdInput")?.focus(), 50);
}

function closePalette(e){
  if(e && e.target !== $("cmdPalette")) return;
  $("cmdPalette").style.display="none";
}

function closePaletteForce(){
  $("cmdPalette").style.display="none";
}

function filterPalette(q){
  renderPaletteResults(q.toLowerCase());
}

function renderPaletteResults(q){
  const res = $("cmdResults");
  if(!res) return;
  const filtered = q
    ? PALETTE_COMMANDS.filter(c=>c.label.toLowerCase().includes(q))
    : PALETTE_COMMANDS;

  res.innerHTML = filtered.map((c,i)=>`
    <div class="cmd-item" tabindex="0" id="cmd-item-${i}" onclick="runPaletteCmd(${PALETTE_COMMANDS.indexOf(c)})">
      <span class="cmd-item-icon">${c.icon}</span>
      <span class="cmd-item-label">${c.label}</span>
      <span class="cmd-item-hint">↵</span>
    </div>`).join("") || `<div class="cmd-empty">No results for "${q}"</div>`;
}

function runPaletteCmd(idx){
  closePaletteForce();
  PALETTE_COMMANDS[idx]?.action();
}

let paletteSelected = 0;
function handlePaletteKey(e){
  const items = $("cmdResults")?.querySelectorAll(".cmd-item");
  if(!items?.length) return;
  if(e.key==="ArrowDown"){ e.preventDefault(); paletteSelected=Math.min(paletteSelected+1,items.length-1); items[paletteSelected]?.focus(); }
  else if(e.key==="ArrowUp"){ e.preventDefault(); paletteSelected=Math.max(paletteSelected-1,0); items[paletteSelected]?.focus(); }
  else if(e.key==="Escape"){ closePaletteForce(); }
  else if(e.key==="Enter"){ items[paletteSelected]?.click(); }
}

// ================= PAGE TRANSITIONS =================
function transitionFeed(){
  const feed = $("feed");
  if(!feed) return;
  feed.classList.add("view-fade-out");
  setTimeout(()=>feed.classList.remove("view-fade-out"), 300);
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
let typingChannel = null;
const TYPING_CHANNEL_PREFIX = "typing-";

function initDMTyping(otherId){
  const input = $("dmInput");
  if(!input) return;

  // Clean up previous typing channel to prevent stacking
  if(typingChannel){ try{ db.removeChannel(typingChannel); }catch(e){} typingChannel=null; }
  isTyping = false;

  const channelName = TYPING_CHANNEL_PREFIX+[state.user.id,otherId].sort().join("-");

  input.addEventListener("input",()=>{
    if(!isTyping){
      isTyping = true;
      if(typingChannel) typingChannel.send({type:"broadcast",event:"typing",payload:{userId:state.user.id}}).catch(()=>{});
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(()=>{ isTyping=false; },2000);
  },{passive:true});

  typingChannel = db.channel(channelName)
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

// ================= DM REPLY SYSTEM =================
let dmReplyState = null;

function setDMReply(msgId, content, senderName){
  dmReplyState = { msgId, content, senderName };

  // Show reply preview bar above input
  let bar = $("dmReplyBar");
  if(!bar){
    bar = document.createElement("div");
    bar.id = "dmReplyBar";
    bar.className = "dm-reply-preview";
    const inputRow = document.querySelector(".dm-input-row");
    if(inputRow) inputRow.parentNode.insertBefore(bar, inputRow);
  }
  bar.innerHTML = `
    <div style="flex:1;min-width:0">
      <div class="dm-reply-preview-name">↩ Replying to @${escHtml(senderName)}</div>
      <div class="dm-reply-preview-text">${escHtml(content)}</div>
    </div>
    <button class="dm-reply-cancel" onclick="clearDMReply()">✕</button>`;
  bar.style.display = "flex";
  $("dmInput")?.focus();
}

function clearDMReply(){
  dmReplyState = null;
  const bar = $("dmReplyBar");
  if(bar) bar.style.display = "none";
}

function scrollToMessage(msgId){
  const el = $("dmsg-"+msgId);
  if(!el) return;
  el.scrollIntoView({ behavior:"smooth", block:"center" });
  el.classList.add("reply-highlight");
  setTimeout(()=>el.classList.remove("reply-highlight"), 1400);
}

// ================= DM REACTIONS =================
const addDMReaction = safe(async(msgId, emoji, otherId)=>{
  if(!state.user) return;

  // Fetch current message reactions
  const {data:msg} = await db.from("messages").select("reactions").eq("id",msgId).maybeSingle();
  if(!msg) return;

  let reactions = msg.reactions || {};
  if(typeof reactions === "string") reactions = JSON.parse(reactions);

  const users = reactions[emoji] || [];
  const myId  = state.user.id;

  if(users.includes(myId)){
    // Un-react
    reactions[emoji] = users.filter(u=>u!==myId);
    if(!reactions[emoji].length) delete reactions[emoji];
  } else {
    reactions[emoji] = [...users, myId];
  }

  await db.from("messages").update({ reactions }).eq("id",msgId);
  await loadThread(otherId);
});

// ================= MOBILE COMPOSE SHEET =================
let _mobileComposeOtherId = null;

function mobileNewPost(){
  // On mobile, scroll to composer or show a sheet
  const composer = $("composer");
  if(composer && window.innerWidth <= 768){
    showMobileComposeSheet();
  } else {
    goHome();
    setTimeout(()=>{ $("postInput")?.focus(); }, 200);
  }
}

function showMobileComposeSheet(){
  // Remove old sheet if exists
  let old = $("mobileComposeSheet");
  if(old) old.remove();

  const sheet = document.createElement("div");
  sheet.id = "mobileComposeSheet";
  sheet.className = "mobile-compose-sheet";
  sheet.innerHTML = `
    <div class="mobile-compose-inner">
      <div class="mobile-compose-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:15px;font-weight:800;color:#fff">New Post</span>
        <button onclick="closeMobileCompose()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#aaa;border-radius:10px;padding:6px 12px;cursor:pointer;font-family:Inter,sans-serif;font-size:13px">✕</button>
      </div>
      <textarea id="mobilePostInput" placeholder="What's happening?" rows="4"
        style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:16px;color:#e8eaf0;padding:14px;font-size:16px;font-family:Inter,sans-serif;resize:none;outline:none;line-height:1.6"></textarea>
      <div style="display:flex;gap:10px;margin-top:12px;align-items:center">
        <label style="padding:10px 14px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;cursor:pointer;font-size:13px;color:rgba(255,255,255,0.4);font-family:Inter,sans-serif">
          📷 Photo <input type="file" id="mobileImgInput" accept="image/*" style="display:none">
        </label>
        <button onclick="submitMobilePost()" style="flex:1;padding:13px;background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:14px;color:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:Inter,sans-serif;box-shadow:0 0 20px rgba(0,212,255,0.3)">Post ✦</button>
      </div>
    </div>`;

  sheet.addEventListener("click", e=>{ if(e.target===sheet) closeMobileCompose(); });
  document.body.appendChild(sheet);
  setTimeout(()=>$("mobilePostInput")?.focus(), 150);
}

function closeMobileCompose(){
  const sheet = $("mobileComposeSheet");
  if(sheet) sheet.remove();
}

const submitMobilePost = safe(async()=>{
  if(!state.user){ alert("Please log in first."); return; }
  if(!cooldown("post",2000)){ alert("Please wait before posting again."); return; }

  const text     = $("mobilePostInput")?.value.trim();
  const imgInput = $("mobileImgInput");

  if(!text && !imgInput?.files?.[0]){
    alert("Write something or attach a photo.");
    return;
  }

  let image = null;
  if(imgInput?.files?.[0]){
    const file = imgInput.files[0];
    const {data,error} = await db.storage.from("images")
      .upload(`${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
    if(!error){ const {data:u}=db.storage.from("images").getPublicUrl(data.path); image=u.publicUrl; }
  }

  const {error} = await db.from("posts").insert([{
    content: text, user_id: state.user.id, image, video: null
  }]);
  if(error) throw error;

  closeMobileCompose();
  goHome();
});

// ================= INIT =================
document.addEventListener("DOMContentLoaded", async()=>{
  // Start landing page particles
  initLandingParticles(true);

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

  // Wire up multi-image composer input
  $("imageInput")?.addEventListener("change", function(){
    for(const file of this.files){
      if(_pendingImgFiles.length >= 10) break; // cap at 10 images
      _pendingImgFiles.push(file);
    }
    this.value = ""; // reset so the same file can be re-added
    renderComposerPreviews();
  });

  // Escape closes modals, Ctrl+K opens palette, arrows navigate gallery
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      closePostModal();
      closeLightbox();
      closePaletteForce();
      $("editModal").style.display="none";
    }
    if((e.ctrlKey||e.metaKey) && e.key==="k"){
      e.preventDefault();
      openPalette();
    }
    // Arrow key navigation inside lightbox/gallery
    const lb = $("lightbox");
    if(lb && lb.style.display !== "none" && _galleryUrls.length > 1){
      if(e.key==="ArrowLeft")  { e.preventDefault(); galleryPrev(); }
      if(e.key==="ArrowRight") { e.preventDefault(); galleryNext(); }
    }
  });

  const {data} = await db.auth.getSession();
  if(data?.session?.user){
    state.user = data.session.user;
    start();
  }

  // Handle Google OAuth redirect
  db.auth.onAuthStateChange(async(event, session)=>{
    if(event==="SIGNED_IN" && session?.user && !state.user){
      state.user = session.user;
      // Ensure profile exists for OAuth user
      const {data:existing} = await db.from("profiles").select("user_id")
        .eq("user_id", session.user.id).maybeSingle();
      if(!existing){
        const email = session.user.email||"";
        await db.from("profiles").insert([{
          user_id:  session.user.id,
          username: email.split("@")[0],
          balance:  0
        }]).then(()=>{}).catch(()=>{});
      }
      start();
    }
  });
});

// ================= POLLS =================
let _pollActive = false;
let _pollOptionCount = 2;

function togglePollBuilder(){
  _pollActive = !_pollActive;
  const builder = $("pollBuilder");
  const btn = $("pollToggleBtn");
  const imgLabel = $("imageInput")?.parentElement;
  const vidLabel = $("videoInput")?.parentElement;
  if(!builder) return;
  if(_pollActive){
    builder.style.display = "block";
    btn?.classList.add("poll-toggle-active");
    // Disable photo/video when poll is active
    if(imgLabel) imgLabel.style.opacity="0.35", imgLabel.style.pointerEvents="none";
    if(vidLabel) vidLabel.style.opacity="0.35", vidLabel.style.pointerEvents="none";
    $("pollOpt0")?.focus();
  } else {
    builder.style.display = "none";
    btn?.classList.remove("poll-toggle-active");
    if(imgLabel) imgLabel.style.opacity="", imgLabel.style.pointerEvents="";
    if(vidLabel) vidLabel.style.opacity="", vidLabel.style.pointerEvents="";
    // Reset options back to 2
    _pollOptionCount = 2;
    const list = $("pollOptionsList");
    if(list){
      list.innerHTML = `
        <input class="poll-option-input" id="pollOpt0" placeholder="Option 1" maxlength="80">
        <input class="poll-option-input" id="pollOpt1" placeholder="Option 2" maxlength="80">`;
    }
  }
}

function addPollOption(){
  if(_pollOptionCount >= 4){ showToast("Max 4 options"); return; }
  const list = $("pollOptionsList");
  if(!list) return;
  const input = document.createElement("input");
  input.className = "poll-option-input";
  input.id = `pollOpt${_pollOptionCount}`;
  input.placeholder = `Option ${_pollOptionCount+1}`;
  input.maxLength = 80;
  list.appendChild(input);
  _pollOptionCount++;
  input.focus();
}

function getPollOptions(){
  const opts = [];
  for(let i=0;i<_pollOptionCount;i++){
    const v = ($(`pollOpt${i}`)?.value||"").trim();
    if(v) opts.push(v);
  }
  return opts;
}

function renderPollCard(p){
  if(!p.poll_options) return "";
  let options;
  try { options = JSON.parse(p.poll_options); } catch{ return ""; }
  const votes = p.poll_votes ? JSON.parse(p.poll_votes) : {};
  const myVote = p._myVote ?? null;
  const totalVotes = Object.values(votes).reduce((a,b)=>a+b,0);
  const hasVoted = myVote !== null;
  const ended = p.poll_ends_at && new Date(p.poll_ends_at) < new Date();
  const showResults = hasVoted || ended || p.user_id === state.user?.id;
  const maxVotes = Math.max(...Object.values(votes), 1);

  const optHtml = options.map((opt,i)=>{
    const count = votes[i]||0;
    const pct   = totalVotes ? Math.round(count/totalVotes*100) : 0;
    const isWinner = showResults && count === Math.max(...Object.values(votes)) && count > 0;
    const isMine   = myVote === i;
    return `
      <button class="poll-option-btn"
        onclick="${!showResults?`votePoll('${p.id}',${i})`:'void 0'}"
        ${showResults?"disabled":""}>
        ${showResults ? `<div class="poll-option-fill${isWinner?" winner":""}" style="transform:scaleX(${pct/100})"></div>` : ""}
        <div class="poll-option-label">
          <span>${escHtml(opt)}${isMine?`<span class="poll-option-check">✓</span>`:""}${isWinner&&showResults?`<span class="poll-option-check">🏆</span>`:""}</span>
          ${showResults?`<span class="poll-option-pct">${pct}%</span>`:""}
        </div>
      </button>`;
  }).join("");

  const endsText = p.poll_ends_at
    ? (ended ? "Poll ended" : `Ends ${timeAgo(p.poll_ends_at)} ago`)
    : "";

  return `<div class="poll-card">
    ${optHtml}
    <div class="poll-meta">
      <span>${totalVotes} vote${totalVotes!==1?"s":""}</span>
      ${endsText ? `<span>·</span><span>${endsText}</span>` : ""}
    </div>
  </div>`;
}

const votePoll = safe(async(postId, optionIndex)=>{
  if(!state.user){ alert("Log in to vote."); return; }
  if(!cooldown("poll_"+postId, 1000)) return;

  const {data:existing} = await db.from("poll_votes")
    .select("option_index").eq("post_id",postId).eq("user_id",state.user.id).maybeSingle();
  if(existing){ showToast("You already voted!"); return; }

  await db.from("poll_votes").insert([{post_id:postId, user_id:state.user.id, option_index:optionIndex}]);

  // Re-fetch post to update counts
  const {data:post} = await db.from("posts").select("*").eq("id",postId).maybeSingle();
  if(post){
    const idx = state.posts.findIndex(p=>p.id===postId);
    if(idx>=0){
      state.posts[idx] = {...post, _myVote:optionIndex};
      render();
    }
  }
  showToast("Vote recorded! ✓");
});

// ================= PULL TO REFRESH (mobile) =================
function initPullToRefresh(){
  if(window.innerWidth > 768) return;
  const main = document.querySelector(".main");
  if(!main) return;

  let startY = 0;
  let pulling = false;
  let indicator = document.createElement("div");
  indicator.className = "ptr-indicator";
  indicator.innerHTML = `<div class="ptr-spinner"></div><span>Refreshing…</span>`;
  document.body.appendChild(indicator);

  main.addEventListener("touchstart", e=>{
    if(main.scrollTop === 0) startY = e.touches[0].clientY;
  }, {passive:true});

  main.addEventListener("touchend", async e=>{
    if(!pulling) return;
    pulling = false;
    indicator.classList.add("visible");
    await loadFeed();
    setTimeout(()=>indicator.classList.remove("visible"), 600);
  }, {passive:true});

  main.addEventListener("touchmove", e=>{
    if(main.scrollTop > 0) return;
    const dy = e.touches[0].clientY - startY;
    if(dy > 60) pulling = true;
  }, {passive:true});
}

function showToast(msg, duration=2500){
  const container = $("notifToastContainer");
  if(!container) return;
  const t = document.createElement("div");
  t.className = "notif-toast";
  t.innerHTML = `<div class="toast-body" style="flex:1"><div class="toast-title">${escHtml(msg)}</div></div>`;
  t.onclick = ()=>t.remove();
  container.appendChild(t);
  setTimeout(()=>{ t.classList.add("toast-out"); setTimeout(()=>t.remove(), 400); }, duration);
}

// ================= CONTENT PARSER (hashtags + mentions) =================
function parseContent(text){
  let t = escHtml(text||"");
  t = t.replace(/#(\w+)/g,(_,tag)=>`<span class="hashtag" onclick="event.stopPropagation();handleSearch('#${tag}')">#${tag}</span>`);
  t = t.replace(/@(\w+)/g,(_,user)=>`<span class="mention" onclick="event.stopPropagation();handleSearch('@${user}')">@${user}</span>`);
  return t;
}

// ================= DM CONTENT RENDERER =================
function renderDMContent(content){
  if((content||"").startsWith("[img]")){
    const url = escHtml(content.slice(5));
    return `<img src="${url}" class="dm-img-preview" onclick="openLightbox('${url}','img')" alt="Image">`;
  }
  return parseContent(content);
}

// ================= NOTIFICATION FILTER =================
let _allNotifs = [];

function filterNotifications(type){
  const typeOrder = ["all","like","comment","follow","message"];
  document.querySelectorAll(".notif-filter-btn").forEach((btn,i)=>{
    btn.classList.toggle("active", typeOrder[i]===type);
  });

  const icons   = {like:"❤️",comment:"💬",follow:"👤",message:"✉️"};
  const actions = {like:"liked your post",comment:"commented on your post",follow:"followed you",message:"sent you a message"};

  const list = $("notifList");
  if(!list) return;

  const filtered = type==="all" ? _allNotifs : _allNotifs.filter(n=>n.type===type);

  if(!filtered.length){
    list.innerHTML=`<div class="empty-state" style="padding:30px">No ${type==="all"?"":type+" "}notifications</div>`;
    return;
  }

  list.innerHTML = filtered.map(n=>{
    const from = state.profilesMap[n.from_user_id]||{};
    const onClick = n.post_id ? `openPost('${n.post_id}')` : n.from_user_id ? `goProfile('${n.from_user_id}')` : "";
    return `<div class="notif-item ${n.read?"":"notif-unread"}" onclick="${onClick}">
      <span class="notif-icon">${icons[n.type]||"🔔"}</span>
      <div class="notif-body">
        <span class="comment-username">@${escHtml(from.username||"user")}</span>
        <span class="notif-action"> ${actions[n.type]||n.type}</span>
        <div class="notif-time">${timeAgo(n.created_at)} ago</div>
      </div>
    </div>`;
  }).join("");
}

// ================= NOTIFICATION TOAST =================
function showNotifToast(n){
  const container = $("notifToastContainer");
  if(!container || document.hidden) return;
  const icons   = {like:"❤️",comment:"💬",follow:"👤",message:"✉️"};
  const actions = {like:"liked your post",comment:"commented",follow:"followed you",message:"sent you a message"};
  const from = state.profilesMap[n.from_user_id]||{};

  const toast = document.createElement("div");
  toast.className = "notif-toast";
  toast.innerHTML = `
    <div class="toast-icon">${icons[n.type]||"🔔"}</div>
    <div class="toast-body">
      <div class="toast-title">@${escHtml(from.username||"user")}</div>
      <div class="toast-sub">${actions[n.type]||n.type}</div>
    </div>`;
  toast.onclick = ()=>{
    if(n.post_id) openPost(n.post_id);
    else if(n.from_user_id) goProfile(n.from_user_id);
    toast.remove();
  };
  container.appendChild(toast);
  setTimeout(()=>{
    toast.classList.add("toast-out");
    setTimeout(()=>toast.remove(), 300);
  }, 4000);
}

// ================= STORIES =================
let viewerStories = [];
let viewerIdx     = 0;
let viewerTimer   = null;

async function loadStories(){
  const bar = $("storiesBar");
  if(!bar || state.view !== "home") return;

  try {
    const cutoff = new Date(Date.now() - 24*60*60*1000).toISOString();
    const {data,error} = await db.from("stories").select("*")
      .gte("created_at",cutoff).order("created_at",{ascending:false});
    if(error){ console.warn("stories:", error.message); return; }

    const stories = data||[];
    await Promise.all([...new Set(stories.map(s=>s.user_id))].map(ensureProfile));

    // Build per-user groups
    const groups = new Map();
    for(const s of stories){
      if(!groups.has(s.user_id)) groups.set(s.user_id,[]);
      groups.get(s.user_id).push(s);
    }

    // Flat list for viewer navigation
    viewerStories = [];
    groups.forEach((list,uid)=> list.forEach(s=>viewerStories.push({story:s,userId:uid})));

    // Update my avatar in stories bar
    const me = state.profilesMap[state.user?.id];
    const myEl = $("myStoryAvatar");
    if(myEl && me?.avatar_url){
      myEl.innerHTML=`<img src="${me.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else if(myEl && me?.username){
      myEl.textContent = me.username[0].toUpperCase();
    }

    const list = $("storiesList");
    if(!list) return;

    if(!groups.size){ list.innerHTML=""; return; }

    list.innerHTML = [...groups.entries()].map(([uid,storyList])=>{
      const u = state.profilesMap[uid]||{};
      const idx = viewerStories.findIndex(v=>v.userId===uid);
      const av = u.avatar_url
        ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : (u.username||"?")[0].toUpperCase();
      return `<div class="story-item" onclick="viewStory(${idx})">
        <div class="story-ring story-unseen"><div class="story-avatar-inner">${av}</div></div>
        <div class="story-label">@${escHtml(u.username||"user")}</div>
      </div>`;
    }).join("");
  } catch(e){ console.warn("loadStories:", e?.message); }
}

function addStory(){
  $("storyImgInput")?.click();
}

const uploadStory = safe(async(input)=>{
  if(!state.user) return;
  const file = input.files?.[0];
  if(!file) return;

  const {data,error} = await db.storage.from("images")
    .upload(`stories/${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
  if(error){ alert("Upload failed: "+error.message); return; }

  const {data:urlData} = db.storage.from("images").getPublicUrl(data.path);
  const caption = prompt("Add a caption (optional):") || null;

  const {error:e2} = await db.from("stories").insert([{
    user_id: state.user.id, image_url: urlData.publicUrl, caption
  }]);
  if(e2){ alert("Failed to post story: "+e2.message); return; }

  input.value="";
  await loadStories();
});

function viewStory(idx){
  if(!viewerStories.length) return;
  viewerIdx = Math.max(0, Math.min(idx, viewerStories.length-1));
  const sv = $("storyViewer");
  if(sv) sv.style.display = "flex";
  document.body.style.overflow = "hidden";
  renderStoryFrame();
}

function renderStoryFrame(){
  const entry = viewerStories[viewerIdx];
  if(!entry) return;
  const { story, userId } = entry;
  const u = state.profilesMap[userId]||{};

  const avEl  = $("storyViewerAvatar");
  const nmEl  = $("storyViewerName");
  const tmEl  = $("storyViewerTime");
  const imgEl = $("storyViewerImg");
  const capEl = $("storyViewerCaption");
  const pw    = $("storyProgressWrap");

  if(avEl){
    if(u.avatar_url) avEl.innerHTML=`<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    else avEl.textContent=(u.username||"?")[0].toUpperCase();
  }
  if(nmEl) nmEl.textContent = "@"+(u.username||"user");
  if(tmEl) tmEl.textContent = timeAgo(story.created_at)+" ago";
  if(imgEl) imgEl.src = story.image_url||"";
  if(capEl) capEl.textContent = story.caption||"";

  if(pw){
    pw.innerHTML = viewerStories.map((_,i)=>`
      <div class="story-progress-seg">
        <div class="story-progress-fill ${i<viewerIdx?"done":i===viewerIdx?"active":""}"></div>
      </div>`).join("");
  }

  clearTimeout(viewerTimer);
  viewerTimer = setTimeout(()=>nextStory(), 5000);
}

function nextStory(){
  if(viewerIdx < viewerStories.length-1){ viewerIdx++; renderStoryFrame(); }
  else closeStoryViewer();
}

function prevStory(){
  if(viewerIdx > 0){ viewerIdx--; renderStoryFrame(); }
}

function closeStoryViewer(){
  clearTimeout(viewerTimer);
  const sv = $("storyViewer");
  if(sv) sv.style.display = "none";
  document.body.style.overflow = "";
}

// ================= FOLLOWERS / FOLLOWING MODAL =================
let _followModalUsers  = [];
let _followModalTarget = "";

async function openFollowersList(targetId){
  _followModalTarget = targetId;
  const title = $("followModalTitle");
  if(title) title.textContent = "Followers";
  if($("followSearch")) $("followSearch").value = "";

  const {data} = await db.from("follows").select("follower_id").eq("following_id",targetId);
  const ids = (data||[]).map(r=>r.follower_id);
  await Promise.all(ids.map(ensureProfile));
  _followModalUsers = ids.map(id=>state.profilesMap[id]).filter(Boolean);
  renderFollowModal(_followModalUsers);
  $("followModal").style.display = "flex";
}

async function openFollowingList(targetId){
  _followModalTarget = targetId;
  const title = $("followModalTitle");
  if(title) title.textContent = "Following";
  if($("followSearch")) $("followSearch").value = "";

  const {data} = await db.from("follows").select("following_id").eq("follower_id",targetId);
  const ids = (data||[]).map(r=>r.following_id);
  await Promise.all(ids.map(ensureProfile));
  _followModalUsers = ids.map(id=>state.profilesMap[id]).filter(Boolean);
  renderFollowModal(_followModalUsers);
  $("followModal").style.display = "flex";
}

function renderFollowModal(users){
  const list = $("followModalList");
  if(!list) return;
  if(!users.length){
    list.innerHTML=`<div class="empty-state" style="padding:24px">Nobody here yet</div>`; return;
  }
  list.innerHTML = users.map(u=>{
    const following = state.followingSet.has(u.user_id);
    const isMe = u.user_id === state.user?.id;
    const av = u.avatar_url
      ? `<img src="${u.avatar_url}" style="width:100%;height:100%;object-fit:cover">`
      : (u.username||"?")[0].toUpperCase();
    return `<div class="follow-list-item">
      <div class="follow-list-avatar" onclick="closeFollowModal();goProfile('${u.user_id}')">${av}</div>
      <div class="follow-list-info">
        <div class="follow-list-name" onclick="closeFollowModal();goProfile('${u.user_id}')">@${escHtml(u.username||"user")}</div>
        ${u.bio?`<div class="follow-list-bio">${escHtml(u.bio.slice(0,50))}</div>`:""}
      </div>
      ${!isMe?`<button class="follow-btn ${following?"following":""}" onclick="toggleFollow('${u.user_id}')">
        ${following?"✓":"+ Follow"}
      </button>`:""}
    </div>`;
  }).join("");
}

function closeFollowModal(e){
  if(e && e.target !== $("followModal")) return;
  $("followModal").style.display = "none";
}

function filterFollowList(query){
  if(!query.trim()){ renderFollowModal(_followModalUsers); return; }
  const q = query.toLowerCase();
  renderFollowModal(_followModalUsers.filter(u=>
    (u.username||"").toLowerCase().includes(q)||(u.bio||"").toLowerCase().includes(q)
  ));
}

// ================= DM IMAGE SEND =================
const sendDMImage = safe(async(otherId, input)=>{
  if(!state.user) return;
  const file = input.files?.[0];
  if(!file) return;

  const {data,error} = await db.storage.from("images")
    .upload(`dm/${state.user.id}/${Date.now()}_${file.name}`, file, {upsert:true});
  if(error){ alert("Upload failed: "+error.message); return; }

  const {data:urlData} = db.storage.from("images").getPublicUrl(data.path);
  const msgObj = {
    sender_id:   state.user.id,
    receiver_id: otherId,
    content:     `[img]${urlData.publicUrl}`,
    read:        false
  };
  if(dmReplyState){ msgObj.reply_to_id=dmReplyState.msgId; clearDMReply(); }
  const {error:e2} = await db.from("messages").insert([msgObj]);
  if(e2) throw e2;
  input.value="";
  await loadThread(otherId);
});

// ================= DM DELETE MESSAGE =================
const deleteDMMessage = safe(async(msgId, otherId)=>{
  if(!state.user) return;
  if(!confirm("Delete this message?")) return;
  const {error} = await db.from("messages").delete()
    .eq("id",msgId).eq("sender_id",state.user.id);
  if(error) throw error;
  await loadThread(otherId);
});

// ================= USER CONTEXT MENU =================
function openUserMenu(event, userId){
  event.stopPropagation();
  const menu = $("userContextMenu");
  if(!menu) return;

  const isMuted   = state.mutesSet?.has(userId);
  const isBlocked = state.blocksSet?.has(userId);

  $("ctxMenuItems").innerHTML = `
    <div class="ctx-item" onclick="goProfile('${userId}');closeUserMenu()">👤 View Profile</div>
    <div class="ctx-item" onclick="startDM('${userId}');closeUserMenu()">💬 Send Message</div>
    <div class="ctx-item" onclick="${isMuted?`unmuteUser('${userId}')`:`muteUser('${userId}')`};closeUserMenu()">
      ${isMuted?"🔊 Unmute User":"🔇 Mute User"}
    </div>
    <div class="ctx-item danger" onclick="${isBlocked?`unblockUser('${userId}')`:`blockUser('${userId}')`};closeUserMenu()">
      🚫 ${isBlocked?"Unblock User":"Block User"}
    </div>`;

  menu.style.display = "block";
  const x = Math.min(event.clientX + 4, window.innerWidth - 185);
  const y = Math.min(event.clientY + 4, window.innerHeight - 180);
  menu.style.left = x+"px";
  menu.style.top  = y+"px";

  setTimeout(()=>document.addEventListener("click", closeUserMenu, {once:true}), 10);
}

function closeUserMenu(){
  const menu = $("userContextMenu");
  if(menu) menu.style.display = "none";
}

const muteUser = safe(async(userId)=>{
  if(!state.user) return;
  const {error} = await db.from("mutes").insert([{user_id:state.user.id, muted_id:userId}]);
  if(error && error.message.includes("duplicate")) return;
  if(error) throw error;
  state.mutesSet?.add(userId);
  if(state.view==="home") render();
});

const unmuteUser = safe(async(userId)=>{
  if(!state.user) return;
  await db.from("mutes").delete().eq("user_id",state.user.id).eq("muted_id",userId);
  state.mutesSet?.delete(userId);
  if(state.view==="home") render();
});

const blockUser = safe(async(userId)=>{
  if(!state.user) return;
  if(!confirm("Block this user? Their posts will be hidden.")) return;
  await Promise.all([
    db.from("follows").delete().eq("follower_id",state.user.id).eq("following_id",userId),
    db.from("follows").delete().eq("follower_id",userId).eq("following_id",state.user.id),
    db.from("blocks").insert([{user_id:state.user.id, blocked_id:userId}]),
  ]).catch(()=>{});
  state.followingSet.delete(userId);
  state.blocksSet?.add(userId);
  if(state.view==="home") render();
});

const unblockUser = safe(async(userId)=>{
  if(!state.user) return;
  await db.from("blocks").delete().eq("user_id",state.user.id).eq("blocked_id",userId);
  state.blocksSet?.delete(userId);
});

// ═══════════════════════════════════════════════════════════
// CAROUSEL + GALLERY SYSTEM
// ═══════════════════════════════════════════════════════════

// ── Image field parser ──────────────────────────────────────
// image column stores either a single URL string, or a
// JSON-encoded array of URLs for multi-photo posts.
function parseImages(imageField){
  if(!imageField) return [];
  if(imageField.startsWith("[")){
    try{ return JSON.parse(imageField); }catch(e){ return [imageField]; }
  }
  return [imageField];
}

// ── Media HTML generator (used inside postCard) ─────────────
function mediaHtml(p){
  const imgs = parseImages(p.image);
  let html = "";

  if(imgs.length === 1){
    // Single image — clean full-width photo with zoom-in cursor
    const safe_url = escHtml(imgs[0]);
    html += `<img class="post-img" src="${safe_url}" loading="lazy"
      onclick="openGallery([${JSON.stringify(imgs).slice(1,-1).replace(/"/g,"&quot;")}],0)">`;
  } else if(imgs.length > 1){
    const slides = imgs.map((url,i)=>
      `<div class="carousel-slide">
        <img src="${escHtml(url)}" loading="lazy"
          onclick="event.stopPropagation();openGallery(${escHtml(JSON.stringify(imgs))},${i})">
       </div>`
    ).join("");
    const dots = imgs.map((_,i)=>
      `<span class="carousel-dot${i===0?" active":""}"
        onclick="event.stopPropagation();carouselGoTo('${p.id}',${i})"></span>`
    ).join("");
    html += `
      <div class="post-carousel" id="carousel-${p.id}"
           data-index="0" data-count="${imgs.length}"
           data-urls="${escHtml(JSON.stringify(imgs))}"
           ontouchstart="carouselTouchStart(event,'${p.id}')"
           ontouchend="carouselTouchEnd(event,'${p.id}')">
        <div class="carousel-track" id="carousel-track-${p.id}">${slides}</div>
        <button class="carousel-prev" onclick="event.stopPropagation();carouselPrev('${p.id}')">‹</button>
        <button class="carousel-next" onclick="event.stopPropagation();carouselNext('${p.id}')">›</button>
        <div class="carousel-dots" id="carousel-dots-${p.id}">${dots}</div>
        <div class="carousel-counter" id="carousel-counter-${p.id}">1 / ${imgs.length}</div>
      </div>`;
  }

  if(p.video){
    html += `<video class="post-video" controls src="${escHtml(p.video)}"
      onclick="event.stopPropagation()"></video>`;
  }

  return html;
}

// ── Carousel navigation ─────────────────────────────────────
function carouselGoTo(postId, idx){
  const el = $("carousel-"+postId);
  if(!el) return;
  const count = parseInt(el.dataset.count)||1;
  idx = ((idx % count) + count) % count; // wrap
  el.dataset.index = idx;

  const track = $("carousel-track-"+postId);
  if(track) track.style.transform = `translateX(-${idx * 100}%)`;

  const dotsEl = $("carousel-dots-"+postId);
  if(dotsEl){
    dotsEl.querySelectorAll(".carousel-dot").forEach((d,i)=>{
      d.classList.toggle("active", i===idx);
    });
  }

  const counter = $("carousel-counter-"+postId);
  if(counter) counter.textContent = `${idx+1} / ${count}`;
}

function carouselNext(postId){
  const el = $("carousel-"+postId);
  if(el) carouselGoTo(postId, parseInt(el.dataset.index||0)+1);
}

function carouselPrev(postId){
  const el = $("carousel-"+postId);
  if(el) carouselGoTo(postId, parseInt(el.dataset.index||0)-1);
}

// Touch swipe: ≥40px horizontal swipe advances the carousel
const _carouselTouchX = {};
function carouselTouchStart(e, postId){
  _carouselTouchX[postId] = e.touches[0].clientX;
}
function carouselTouchEnd(e, postId){
  const sx = _carouselTouchX[postId];
  if(sx == null) return;
  const diff = sx - e.changedTouches[0].clientX;
  if(Math.abs(diff) > 40) diff > 0 ? carouselNext(postId) : carouselPrev(postId);
  delete _carouselTouchX[postId];
}

// ── Composer multi-image staging ────────────────────────────
let _pendingImgFiles = [];

function renderComposerPreviews(){
  const strip = $("composerImgPreviews");
  if(!strip) return;
  if(_pendingImgFiles.length === 0){
    strip.style.display = "none";
    strip.innerHTML = "";
    return;
  }
  strip.style.display = "flex";
  strip.innerHTML = _pendingImgFiles.map((f,i)=>{
    const url = URL.createObjectURL(f);
    return `<div class="composer-img-thumb">
      <img src="${url}" alt="">
      <button class="composer-img-remove" onclick="removeComposerImg(${i})" title="Remove">✕</button>
    </div>`;
  }).join("") +
  (_pendingImgFiles.length > 1
    ? `<div class="composer-img-count">${_pendingImgFiles.length} photos</div>`
    : "");
}

function removeComposerImg(i){
  _pendingImgFiles.splice(i,1);
  renderComposerPreviews();
}

// ── Gallery lightbox ────────────────────────────────────────
let _galleryUrls = [];
let _galleryIdx  = 0;

function openGallery(urls, startIdx=0){
  if(!Array.isArray(urls)) urls = [urls];
  _galleryUrls = urls.filter(Boolean);
  _galleryIdx  = Math.min(startIdx, _galleryUrls.length-1);
  _renderGallerySlide();
  const lb = $("lightbox");
  if(lb){ lb.style.display = "flex"; document.body.style.overflow = "hidden"; }
}

function galleryPrev(){
  if(_galleryUrls.length < 2) return;
  _galleryIdx = ((_galleryIdx - 1) + _galleryUrls.length) % _galleryUrls.length;
  _renderGallerySlide();
}

function galleryNext(){
  if(_galleryUrls.length < 2) return;
  _galleryIdx = (_galleryIdx + 1) % _galleryUrls.length;
  _renderGallerySlide();
}

function _renderGallerySlide(){
  const img = $("lightboxImg");
  const vid = $("lightboxVid");
  if(img){ img.src = _galleryUrls[_galleryIdx]||""; img.style.display = "block"; }
  if(vid) vid.style.display = "none";
  _updateGalleryUI();
}

function _updateGalleryUI(){
  const multi   = _galleryUrls.length > 1;
  const prevBtn = $("lightboxPrev");
  const nextBtn = $("lightboxNext");
  const counter = $("lightboxCounter");
  if(prevBtn) prevBtn.style.display = multi ? "flex" : "none";
  if(nextBtn) nextBtn.style.display = multi ? "flex" : "none";
  if(counter){
    counter.style.display = multi ? "block" : "none";
    if(multi) counter.textContent = `${_galleryIdx+1} / ${_galleryUrls.length}`;
  }
}
