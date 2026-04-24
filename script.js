const { createClient } = supabase;

const db = createClient("YOUR_URL","YOUR_KEY");

const state = {
  user:null,
  posts:[],
  profilesMap:{},
  page:0,
  lastAction:{}
};

const $ = id=>document.getElementById(id);

// SAFE
function safe(fn){
  return async (...args)=>{
    try{ await fn(...args); }
    catch(e){ alert(e.message); }
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
  const {data,error}=await db.auth.signUp({
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
  loadFeed(true);
  realtime();
  notifRealtime();
}

// FEED
async function loadFeed(reset=false){
  if(reset){ state.posts=[]; state.page=0; }

  const {data}=await db.from("posts")
    .select("*")
    .range(state.page*10,state.page*10+9);

  state.posts=[...state.posts,...data];
  render();
  state.page++;
}

// SCORE
function score(p){
  const age=(Date.now()-new Date(p.created_at))/1000;
  return (p.likes||0)*6+(p.shares||0)*8+(100000/(age+1));
}

// RENDER
function render(){
  $("feed").innerHTML = state.posts
    .sort((a,b)=>score(b)-score(a))
    .map(p=>`
      <div class="post">
        <b>${p.content}</b>

        ${p.image?`<img src="${p.image}">`:""}
        ${p.video?`<video autoplay loop controls src="${p.video}"></video>`:""}

        ❤️ ${p.likes||0}
        <button onclick="like('${p.id}')">Like</button>
        <button onclick="sharePost('${p.id}')">Share</button>
      </div>
    `).join("");
}

// SCROLL
window.addEventListener("scroll",()=>{
  if(window.innerHeight+window.scrollY>=document.body.offsetHeight-200){
    loadFeed();
  }
});

// POST
const createPost = safe(async()=>{
  if(!cooldown("post",2000)) return;

  const text=$("postInput").value;
  const img=$("imageInput").files[0];
  const vid=$("videoInput").files[0];

  let image=null,video=null;

  if(img){
    const {data}=await db.storage.from("images")
      .upload(Date.now()+img.name,img);
    image=data.path;
  }

  if(vid){
    const {data}=await db.storage.from("videos")
      .upload(Date.now()+vid.name,vid);
    video=data.path;
  }

  await db.from("posts").insert([{
    content:text,
    user_id:state.user.id,
    image,video,likes:0
  }]);

  loadFeed(true);
});

// LIKE
const like = safe(async(id)=>{
  if(!cooldown("like",800)) return;

  await db.from("likes").insert([{post_id:id,user_id:state.user.id}]);

  const post=state.posts.find(p=>p.id===id);
  await db.from("posts")
    .update({likes:(post.likes||0)+1})
    .eq("id",id);

  loadFeed(true);
});

// SHARE
const sharePost = safe(async(id)=>{
  const post=state.posts.find(p=>p.id===id);
  await db.from("posts")
    .update({shares:(post.shares||0)+1})
    .eq("id",id);
});

// CHAT
function goChat(){
  $("feed").innerHTML=`
    <div id="chatBox"></div>
    <input id="msgInput">
    <button onclick="sendMsg()">Send</button>
  `;
  loadMsgs();
}

async function loadMsgs(){
  const {data}=await db.from("messages").select("*");
  $("chatBox").innerHTML=data.map(m=>`<div>${m.content}</div>`).join("");
}

async function sendMsg(){
  await db.from("messages").insert([{
    content:$("msgInput").value,
    sender_id:state.user.id
  }]);
}

// REALTIME
function realtime(){
  db.channel("posts")
    .on("postgres_changes",{event:"*",schema:"public",table:"posts"},
    ()=>loadFeed(true)).subscribe();
}

// NOTIF
function notifRealtime(){
  db.channel("notif")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"},
    p=>{
      if(p.new.user_id===state.user.id){
        alert(p.new.message);
      }
    }).subscribe();
}

// JOBS
function goJobs(){
  db.from("jobs").select("*").then(({data})=>{
    $("feed").innerHTML=data.map(j=>`<div>${j.title}</div>`).join("");
  });
}

// NOTIF PAGE
function goNotifications(){
  db.from("notifications")
    .select("*")
    .eq("user_id",state.user.id)
    .then(({data})=>{
      $("feed").innerHTML=data.map(n=>`<div>${n.message}</div>`).join("");
    });
}

// AI
function openAI(){
  $("feed").innerHTML=`
    <input id="aiInput">
    <button onclick="askAI()">Ask</button>
    <div id="aiRes"></div>
  `;
}

async function askAI(){
  const res=await fetch("YOUR_AI_URL",{
    method:"POST",
    body:JSON.stringify({message:$("aiInput").value})
  });
  const data=await res.json();
  $("aiRes").innerText=data.reply;
}

// INIT
document.addEventListener("DOMContentLoaded",()=>{
  $("loginBtn").onclick=login;
  $("signupBtn").onclick=signup;
  $("postBtn").onclick=createPost;
});
