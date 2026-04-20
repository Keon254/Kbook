// ========================================
// KUDASAI STAGE 17 ULTRA (FULL SYSTEM)
// ========================================

const { createClient } = supabase;

const db = createClient("https://zoipwzvfkbzszpiectzb.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4");

const state = {
  user: null,
  profile: null,
  posts: [],
  profilesMap: {},
  balance: 0
};

const $ = id => document.getElementById(id);

// ================= AUTH =================
async function login(){
  const {data,error} = await db.auth.signInWithPassword({
    email:$("email").value,
    password:$("password").value
  });
  if(error) return alert(error.message);

  state.user = data.user;
  bootstrap();
}

async function signup(){
  const {error} = await db.auth.signUp({
    email:$("email").value,
    password:$("password").value
  });
  if(error) return alert(error.message);

  alert("Signup success");
}

// ================= BOOT =================
async function bootstrap(){
  document.querySelector(".auth").style.display="none";
  $("app").style.display="block";

  await loadProfile();
  await loadFeed();
}

// ================= PROFILE =================
async function loadProfile(){
  const {data} = await db.from("profiles")
    .select("*")
    .eq("user_id",state.user.id)
    .single();

  state.profile = data || {username:"user",balance:0};
  state.balance = state.profile.balance || 0;

  $("userTag").innerText = state.profile.username;
}

// ================= FEED =================
async function loadFeed(){
  const {data:posts} = await db.from("posts").select("*");
  const {data:profiles} = await db.from("profiles").select("*");

  state.profilesMap = {};
  profiles.forEach(p=>state.profilesMap[p.user_id]=p);

  state.posts = posts || [];

  renderFeed();
}

function renderFeed(){
  const sorted = state.posts.map(p=>{
    const age = (Date.now() - new Date(p.created_at)) / 1000;
    return {...p, score:(p.likes||0)*5 + (100000/(age+1))};
  }).sort((a,b)=>b.score-a.score);

  $("feed").innerHTML = sorted.map(p=>{
    const user = state.profilesMap[p.user_id];

    return `
      <div class="post">
        <b>${user?.username || "user"}</b>
        <p>${p.content}</p>

        ${p.image ? `<img src="${p.image}" style="width:100%;border-radius:10px;">` : ""}

        ❤️ ${p.likes||0}

        <button onclick="like('${p.id}')">Like</button>
        <button onclick="openComments('${p.id}')">Comment</button>
        <button onclick="viewProfile('${p.user_id}')">Profile</button>
      </div>
    `;
  }).join("");
}

// ================= POST =================
async function createPost(){
  const file = $("imageInput")?.files?.[0];
  let imageUrl = null;

  if(file){
    const {data} = await db.storage
      .from("images")
      .upload(Date.now()+"_"+file.name,file);

    imageUrl = data.path;
  }

  await db.from("posts").insert([{
    content:$("postInput").value,
    user_id:state.user.id,
    image:imageUrl,
    likes:0
  }]);

  $("postInput").value="";
  loadFeed();
}

// ================= LIKE =================
async function like(id){
  const post = state.posts.find(p=>p.id===id);

  await db.from("posts")
    .update({likes:(post.likes||0)+1})
    .eq("id",id);

  await db.from("notifications").insert([{
    user_id:post.user_id,
    type:"like",
    message:`${state.profile.username} liked your post`
  }]);

  loadFeed();
}

// ================= COMMENTS =================
async function openComments(postId){
  const {data} = await db.from("comments")
    .select("*").eq("post_id",postId);

  $("feed").innerHTML = `
    <h2>Comments</h2>
    ${data.map(c=>`<p>${c.content}</p>`).join("")}
    <input id="commentInput">
    <button onclick="addComment('${postId}')">Send</button>
  `;
}

async function addComment(postId){
  const text = $("commentInput").value;

  await db.from("comments").insert([{
    post_id:postId,
    user_id:state.user.id,
    content:text
  }]);

  openComments(postId);
}

// ================= FOLLOW =================
async function follow(userId){
  await db.from("followers").insert([{
    follower_id:state.user.id,
    following_id:userId
  }]);

  alert("Followed");
}

// ================= PROFILE VIEW =================
function viewProfile(userId){
  $("feed").innerHTML = `
    <h2>Profile</h2>
    <button onclick="follow('${userId}')">Follow</button>
    <button onclick="openChat('${userId}')">Message</button>
  `;
}

// ================= MESSAGING =================
function openChat(userId){
  $("feed").innerHTML = `
    <h2>Chat</h2>
    <input id="msgInput">
    <button onclick="sendMsg('${userId}')">Send</button>
  `;
}

async function sendMsg(userId){
  await db.from("messages").insert([{
    sender_id:state.user.id,
    receiver_id:userId,
    content:$("msgInput").value
  }]);

  $("msgInput").value="";
}

// ================= JOB =================
function goJobs(){
  db.from("jobs").select("*").then(({data})=>{
    $("feed").innerHTML = `
      <h2>Jobs</h2>
      <input id="jobTitle">
      <input id="jobPrice">
      <button onclick="createJob()">Create</button>

      ${data.map(j=>`
        <div class="post">
          ${j.title} - $${j.price}
          <button onclick="acceptJob('${j.id}','${j.user_id}')">Accept</button>
        </div>
      `).join("")}
    `;
  });
}

async function createJob(){
  await db.from("jobs").insert([{
    title:$("jobTitle").value,
    price:$("jobPrice").value,
    user_id:state.user.id
  }]);
  goJobs();
}

async function acceptJob(jobId,ownerId){
  await db.from("notifications").insert([{
    user_id:ownerId,
    type:"job",
    message:"Your job was accepted"
  }]);
}

// ================= SURVEY =================
function goSurvey(){
  db.from("surveys").select("*").then(({data})=>{
    $("feed").innerHTML = data.map(s=>`
      <div class="post">
        <p>${s.question}</p>
        <input id="ans${s.id}">
        <button onclick="submitSurvey('${s.id}',${s.reward})">
          Earn ${s.reward}
        </button>
      </div>
    `).join("");
  });
}

async function submitSurvey(id,reward){
  await db.from("survey_responses").insert([{
    survey_id:id,
    user_id:state.user.id,
    answer:$("ans"+id).value
  }]);

  state.balance += reward;

  await db.from("profiles")
    .update({balance:state.balance})
    .eq("user_id",state.user.id);

  alert("Earned!");
}

// ================= NOTIFICATIONS =================
function goNotifications(){
  db.from("notifications")
    .select("*")
    .eq("user_id",state.user.id)
    .then(({data})=>{
      $("feed").innerHTML = data.map(n=>`
        <div class="post">${n.message}</div>
      `).join("");
    });
}

// ================= AI =================
function openAI(){
  $("feed").innerHTML = `
    <h2>AI</h2>
    <input id="aiInput">
    <button onclick="askAI()">Ask</button>
    <div id="aiRes"></div>
  `;
}

async function askAI(){
  const q = $("aiInput").value;

  const res = await fetch("YOUR_BACKEND_URL",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message:q})
  });

  const data = await res.json();
  $("aiRes").innerText = data.reply;
}

// ================= INIT =================
document.addEventListener("DOMContentLoaded",async()=>{
  $("loginBtn").onclick=login;
  $("signupBtn").onclick=signup;
  $("postBtn").onclick=createPost;

  const {data} = await db.auth.getSession();
  if(data.session){
    state.user = data.session.user;
    bootstrap();
  }
});
