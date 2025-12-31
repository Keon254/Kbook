// script.js

// DOM Elements
const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

// Posts storage
let posts = JSON.parse(localStorage.getItem("posts")) || [];

// Current user email (set after login)
let currentUserEmail = null;

// Render posts
function renderPosts() {
  feed.innerHTML = "";

  posts.forEach((post, index) => {
    const postDiv = document.createElement("div");
    postDiv.className = "post";

    postDiv.innerHTML = `
      <h4>${post.user}</h4>
      <small>${post.time}</small>
      <p>${post.text}</p>

      <div class="actions">
        <button class="like-btn">Like (<span>${post.likes}</span>)</button>
        <button class="comment-toggle">Comment</button>
      </div>

      <div class="comments" style="display:none;">
        <div class="comment-list"></div>
        <input type="text" placeholder="Write a comment..." class="comment-input" />
      </div>
    `;

    // Like logic
    postDiv.querySelector(".like-btn").addEventListener("click", () => {
      posts[index].likes++;
      savePosts();
      renderPosts();
    });

    const commentToggle = postDiv.querySelector(".comment-toggle");
    const commentsDiv = postDiv.querySelector(".comments");
    const commentList = postDiv.querySelector(".comment-list");
    const commentInput = postDiv.querySelector(".comment-input");

    // Toggle comment box visibility
    commentToggle.addEventListener("click", () => {
      commentsDiv.style.display = commentsDiv.style.display === "none" ? "block" : "none";
    });

    // Render comments
    commentList.innerHTML = "";
    post.comments.forEach((c) => {
      const cDiv = document.createElement("div");
      cDiv.innerHTML = `<strong>${c.user}</strong>: ${c.text} <small>(${c.time})</small>`;
      commentList.appendChild(cDiv);
    });

    // Add comment on Enter
    commentInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const text = commentInput.value.trim();
        if (text === "") return;

        post.comments.push({
          user: currentUserEmail || "Anonymous",
          text,
          time: new Date().toLocaleString()
        });

        savePosts();
        renderPosts();
      }
    });

    feed.appendChild(postDiv);
  });
}

// Save posts to localStorage
function savePosts() {
  localStorage.setItem("posts", JSON.stringify(posts));
}

// Create a post
function createPost() {
  const text = postInput.value.trim();
  if (text === "") return;

  if (!currentUserEmail) {
    alert("You must be logged in to post.");
    return;
  }

  const postData = {
    user: currentUserEmail,
    text,
    time: new Date().toLocaleString(),
    likes: 0,
    comments: []
  };

  posts.unshift(postData);
  savePosts();
  renderPosts();
  postInput.value = "";
}

// Expose function to be called after login from index.html
window.afterLogin = (userEmail) => {
  currentUserEmail = userEmail;
  renderPosts();
};

// Expose function to be called after logout from index.html
window.afterLogout = () => {
  currentUserEmail = null;
  posts = [];
  feed.innerHTML = "";
  postInput.value = "";
};

// Event listeners for posting
postBtn.addEventListener("click", createPost);
postInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") createPost();
});
