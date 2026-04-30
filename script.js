const { createClient } = supabase;

const db = createClient("https://zoipwzvfkbzszpiectzb.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4");

const state = {
  user:null,
  posts:[],
  profilesMap:{},
  lastAction:{}
};

const $ = id => document.getElementById(id);

// SAFE
function safe(fn){
  return async (...args)=>{
    try{ await fn(...args); }
    catch(e){ console.error(e); alert(e.message); }
  };
}

// COOLDOWN
function cooldown(k,t){
  const n=Date.now();
  if(state.lastAction[k] && n-state.lastAction[k]<t) return false;
  state.lastAction[k]=n;
  return true;
}

// AUTH
const login = safe(async()=>{
  const {data,error} = await db.auth.signInWithPassword({
    email:$("email").value,
    password:$("password").value
  });
  if(error) throw error;

  state.user=data.user;
  start();
});

const signup = safe(async()=>{
  const {data,error} = await db.auth.signUp({
    email:$("email").value,
    password:$("password").value
  });
  if(error) throw error;

  await db.from("profiles").insert([{
    user_id:data.user.id,
    username:$("email").value.split("@")[0]
  }]);

  alert("Signup success");
});

// START
async function start(){
  document.querySelector(".auth").style.display="none";
  $("app").style.display="block";
  loadFeed();
}

// FEED
async function loadFeed(){
  const {data:posts} = await db.from("posts")
    .select("*")
    .order("created_at",{ascending:false});

  state.posts = posts || [];
  render();
}

// RENDER
function render(){
  $("feed").innerHTML = state.posts.map(p=>`
    <div class="post">

      <div class="username">@user</div>

      <div>${p.content}</div>

      ${p.image?`<img src="${p.image}">`:""}
      ${p.video?`<video controls src="${p.video}"></video>`:""}

      <div class="actions">
        <button onclick="like('${p.id}')">❤️ ${p.likes||0}</button>
      </div>

    </div>
  `).join("");
}

// POST
const createPost = safe(async()=>{
  if(!cooldown("post",2000)) return;

  const text = $("postInput").value.trim();
  if(!text) return;

  const imgInput = $("imageInput");
  const vidInput = $("videoInput");

  let image=null, video=null;

  if(imgInput && imgInput.files[0]){
    const file = imgInput.files[0];

    const {data} = await db.storage
      .from("images")
      .upload(Date.now()+file.name,file);

    const {data:urlData} = db.storage
      .from("images")
      .getPublicUrl(data.path);

    image = urlData.publicUrl;
  }

  if(vidInput && vidInput.files[0]){
    const file = vidInput.files[0];

    const {data} = await db.storage
      .from("videos")
      .upload(Date.now()+file.name,file);

    const {data:urlData} = db.storage
      .from("videos")
      .getPublicUrl(data.path);

    video = urlData.publicUrl;
  }

  await db.from("posts").insert([{
    content:text,
    user_id:state.user.id,
    image,video,likes:0
  }]);

  $("postInput").value="";
  loadFeed();
});

// LIKE
const like = safe(async(id)=>{
  if(!cooldown("like",800)) return;

  const {data:existing} = await db.from("likes")
    .select("*")
    .eq("post_id",id)
    .eq("user_id",state.user.id);

  if(existing?.length) return;

  await db.from("likes").insert([{
    post_id:id,
    user_id:state.user.id
  }]);

  const post = state.posts.find(p=>p.id===id);
  const newLikes = (post.likes||0)+1;

  await db.from("posts")
    .update({likes:newLikes})
    .eq("id",id);

  post.likes = newLikes;
  render();
});

// NAV
function goHome(){ loadFeed(); }
function goChat(){ alert("Chat coming next"); }
function goNotifications(){ alert("Notifications coming"); }

// INIT
document.addEventListener("DOMContentLoaded",()=>{
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;
});
