// ========================================
// KUDASAI STAGE 2 — PROFILE SYSTEM
// ========================================

const { createClient } = supabase;

const db = createClient(
  "https://zoipwzvfkbzszpiectzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4"
);

const state = {
  user: null,
  profile: null,
  posts: []
};

const $ = (id) => document.getElementById(id);

// ===== AUTH =====
async function login() {
  const { data, error } = await db.auth.signInWithPassword({
    email: $("email").value,
    password: $("password").value
  });

  if (error) return alert(error.message);

  state.user = data.user;
  await bootstrap();
}

async function signup() {
  const { error } = await db.auth.signUp({
    email: $("email").value,
    password: $("password").value
  });

  if (error) return alert(error.message);

  alert("Signup successful");
}

// ===== BOOT =====
async function bootstrap() {
  await loadProfile();
  showApp();
  loadFeed();
}

// ===== PROFILE LOAD =====
async function loadProfile() {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (!data) {
    const username = "user" + Math.floor(Math.random()*9999);

    await db.from("profiles").insert([{
      user_id: state.user.id,
      username,
      bio: "",
      avatar: ""
    }]);

    state.profile = { username, bio: "", avatar: "" };
  } else {
    state.profile = data;
  }
}

// ===== FEED =====
async function loadFeed() {
  const { data } = await db.from("posts").select("*");
  state.posts = data || [];

  const feed = $("feed");
  feed.innerHTML = "<h3>Feed coming next stage...</h3>";
}

// ===== PROFILE UI =====
async function goProfile() {
  const feed = $("feed");

  const postCount = state.posts.filter(p => p.user_id === state.user.id).length;

  feed.innerHTML = `
    <div class="profile-card">

      <img class="avatar"
        src="${state.profile.avatar || 'https://via.placeholder.com/90'}">

      <h2>${state.profile.username}</h2>
      <p>${state.profile.bio || "No bio yet"}</p>

      <div class="stats">
        <div class="stat">
          <b>${postCount}</b>
          <p>Posts</p>
        </div>
      </div>

      <div class="edit-box">
        <input id="newName" placeholder="New username">
        <input id="newBio" placeholder="New bio">
        <input type="file" id="avatarUpload">

        <button onclick="updateProfile()">Save</button>
      </div>

    </div>
  `;
}

// ===== UPDATE PROFILE =====
async function updateProfile() {
  const username = $("newName").value.trim();
  const bio = $("newBio").value.trim();
  const file = $("avatarUpload").files[0];

  let avatarUrl = state.profile.avatar;

  // upload avatar
  if (file) {
    const filePath = `avatars/${state.user.id}_${Date.now()}`;

    const { error: uploadError } = await db.storage
      .from("avatars")
      .upload(filePath, file);

    if (uploadError) return alert(uploadError.message);

    const { data } = db.storage.from("avatars").getPublicUrl(filePath);
    avatarUrl = data.publicUrl;
  }

  await db.from("profiles")
    .update({
      username: username || state.profile.username,
      bio: bio || state.profile.bio,
      avatar: avatarUrl
    })
    .eq("user_id", state.user.id);

  alert("Profile updated");
  await loadProfile();
  goProfile();
}

// ===== UI =====
function showApp() {
  document.querySelector(".auth").style.display = "none";
  $("app").style.display = "flex";
}

// ===== NAV =====
function goHome() {
  loadFeed();
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;

  const { data } = await db.auth.getSession();

  if (data?.session?.user) {
    state.user = data.session.user;
    await bootstrap();
  }
});
