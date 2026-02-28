// ========================================
// KBOOK v3 COMPLETE AUTH + POSTS
// ========================================

// ====== SUPABASE CONFIG ======
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"; // keep your real key

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ====== ELEMENTS ======
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signupBtn");
const loginEmailBtn = document.getElementById("loginEmailBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const app = document.getElementById("app");
const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

let currentUser = null;
let realtimeChannel = null;

// ====== UI CONTROL ======
function showApp() {
  app.style.display = "block";
  logoutBtn.style.display = "inline-block";
  signupBtn.style.display = "none";
  loginEmailBtn.style.display = "none";
  loginBtn.style.display = "none";
}

function showAuth() {
  app.style.display = "none";
  logoutBtn.style.display = "none";
  signupBtn.style.display = "inline-block";
  loginEmailBtn.style.display = "inline-block";
  loginBtn.style.display = "inline-block";
}

// ====== EMAIL SIGNUP ======
signupBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) return alert("Enter email and password");

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) alert(error.message);
};

// ====== EMAIL LOGIN ======
loginEmailBtn.onclick = async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) return alert("Enter email and password");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) alert(error.message);
};

// ====== GOOGLE LOGIN ======
loginBtn.onclick = async () => {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://keon254.github.io/Kbook"
    }
  });
};

// ====== LOGOUT ======
logoutBtn.onclick = async () => {
  await supabase.auth.signOut();
  location.reload();
};

// ====== SESSION CHECK ======
async function initialize() {
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    currentUser = data.session.user;
    showApp();
    loadPosts();
    subscribeRealtime();
  } else {
    showAuth();
  }
}

initialize();

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    currentUser = session.user;
    showApp();
    loadPosts();
    subscribeRealtime();
  } else {
    currentUser = null;
    showAuth();
  }
});

// ====== CREATE POST ======
postBtn.onclick = async () => {
  const text = postInput.value.trim();
  if (!text || !currentUser) return;

  const { error } = await supabase.from("posts").insert([
    {
      content: text,
      user_id: currentUser.id
    }
  ]);

  if (error) alert(error.message);

  postInput.value = "";
};

// ====== LOAD POSTS ======
async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return console.error(error.message);

  renderPosts(data);
}

// ====== RENDER POSTS ======
function renderPosts(posts) {
  feed.innerHTML = "";

  posts.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";

    const isOwner = currentUser && currentUser.id === post.user_id;

    div.innerHTML = `
      <h4>${post.user_id}</h4>
      <p>${post.content}</p>
      <small>${new Date(post.created_at).toLocaleString()}</small>
      ${isOwner ? `<button class="deleteBtn" data-id="${post.id}">Delete</button>` : ""}
    `;

    feed.appendChild(div);
  });

  document.querySelectorAll(".deleteBtn").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");

      await supabase.from("posts").delete().eq("id", id);
    };
  });
}

// ====== REALTIME ======
function subscribeRealtime() {
  if (realtimeChannel) return;

  realtimeChannel = supabase
    .channel("posts-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "posts" },
      () => loadPosts()
    )
    .subscribe();
}
