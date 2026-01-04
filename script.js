// ===============================
// SUPABASE CONFIG (REPLACE THESE)
// ===============================
const SUPABASE_URL = "https://zoipwzvfkbzszpiectzb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4";

// ===============================
// INIT
// ===============================
const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ===============================
// ELEMENTS
// ===============================
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const app = document.getElementById("app");
const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

let currentUser = null;

// ===============================
// GOOGLE LOGIN (FIXED FOR GITHUB)
// ===============================
loginBtn.onclick = async () => {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://keon254.github.io/Kbook/"
    }
  });
};

// ===============================
// LOGOUT
// ===============================
logoutBtn.onclick = async () => {
  await supabase.auth.signOut();
};

// ===============================
// AUTH STATE
// ===============================
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    currentUser = session.user;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    app.style.display = "block";
    loadPosts();
  } else {
    currentUser = null;
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    app.style.display = "none";
  }
});

// ===============================
// CREATE POST
// ===============================
postBtn.onclick = async () => {
  const text = postInput.value.trim();
  if (!text || !currentUser) return;

  const { error } = await supabase.from("posts").insert([
    {
      content: text,
      user_id: currentUser.id
    }
  ]);

  if (!error) {
    postInput.value = "";
    loadPosts();
  }
};

// ===============================
// LOAD POSTS
// ===============================
async function loadPosts() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return;

  feed.innerHTML = "";

  data.forEach(post => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <h4>User</h4>
      <p>${post.content}</p>
    `;
    feed.appendChild(div);
  });
}
