const { createClient } = supabase;

const db = createClient("https://zoipwzvfkbzszpiectzb.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4");

const state = {
  user:null,
  profile:null,
  posts:[],
  profilesMap:{},
  balance:0
};

const $ = id => document.getElementById(id);

// ================= AUTH =================
async function login(){
  const {data,error}=await db.auth.signInWithPassword({
    email:$("email").value,
    password:$("password").value
  });
  if(error) return alert(error.message);

  state.user=data.user;
  bootstrap();
}

async function signup(){
  const {error}=await db.auth.signUp({
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
  loadFeed();
}

// ================= PROFILE =================
async function loadProfile(){
  const {data}=await db.from("profiles")
    .select("*")
    .eq("user_id",state.user.id)
    .single();

  state.profile=data;
  $("userTag").innerText=data.username;
}

// ================= FEED =================
async function loadFeed(){
  const {data}=await db.from("posts").select("*");

  state.posts=data;

  $("feed").innerHTML=data.map(p=>`
    <div class="post">
      <b>${p.content}</b>
      <br>
      ❤️ ${p.likes||0}
      <button onclick="like('${p.id}')">Like</button>
      <button onclick="openComments('${p.id}')">Comment</button>
    </div>
  `).join("");
}

// ================= POST =================
async function createPost(){
  await db.from("posts").insert([{
    content:$("postInput").value,
    user_id:state.user.id,
    likes:0
  }]);
  $("postInput").value="";
  loadFeed();
}

// ================= LIKE + NOTIFY =================
async function like(id){
  const post=state.posts.find(p=>p.id===id);

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
  const {data}=await db.from("comments")
    .select("*").eq("post_id",postId);

  $("feed").innerHTML=`
    <h2>Comments</h2>
    ${data.map(c=>`<p>${c.content}</p>`).join("")}
    <input id="commentInput">
    <button onclick="addComment('${postId}')">Send</button>
  `;
}

async function addComment(postId){
  await db.from("comments").insert([{
    post_id:postId,
    user_id:state.user.id,
    content:$("commentInput").value
  }]);

  await db.from("notifications").insert([{
    user_id:state.user.id,
    type:"comment",
    message:"Someone commented"
  }]);

  openComments(postId);
}

// ================= JOB SYSTEM =================
function goJobs(){
  db.from("jobs").select("*").then(({data})=>{
    $("feed").innerHTML=`
      <h2>Jobs</h2>
      <input id="jobTitle" placeholder="Title">
      <input id="jobPrice" placeholder="Price">
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
  alert("Job accepted");
}

// ================= SURVEY =================
function goSurvey(){
  db.from("surveys").select("*").then(({data})=>{
    $("feed").innerHTML=data.map(s=>`
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

  state.balance+=reward;

  await db.from("profiles")
    .update({balance:state.balance})
    .eq("user_id",state.user.id);

  alert("Earned!");
}

// ================= NOTIFICATIONS UI =================
function goNotifications(){
  db.from("notifications")
    .select("*")
    .eq("user_id",state.user.id)
    .then(({data})=>{
      $("feed").innerHTML=data.map(n=>`
        <div class="post">${n.message}</div>
      `).join("");
    });
}

// ================= AI =================
function openAI(){
  $("feed").innerHTML=`
    <h2>AI</h2>
    <input id="aiInput">
    <button onclick="askAI()">Ask</button>
    <div id="aiRes"></div>
  `;
}

function askAI(){
  const q=$("aiInput").value;
  $("aiRes").innerText="Thinking...";
  setTimeout(()=>{
    $("aiRes").innerText="AI: "+q;
  },1000);
}

// ================= NAV =================
function goHome(){ loadFeed(); }

// ================= INIT =================
document.addEventListener("DOMContentLoaded",async()=>{
  $("loginBtn").onclick=login;
  $("signupBtn").onclick=signup;
  $("postBtn").onclick=createPost;

  const {data}=await db.auth.getSession();
  if(data.session){
    state.user=data.session.user;
    bootstrap();
  }
});
