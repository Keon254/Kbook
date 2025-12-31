const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

let posts = [];
let currentUserEmail = null;

// Expose a function called after successful login
window.afterLoginPost = (userEmail) => {
  currentUserEmail = userEmail;
  loadPosts();
  renderPosts();

  // Show post input and attach event listeners
  postBtn.addEventListener("click", createPost);
  postInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") createPost();
  });
};

// Expose a function called after logout
window.afterLogoutPost = () => {
  currentUserEmail = null;
  posts = [];
  feed.innerHTML = "";
  postInput.value = "";

  // Remove event listeners to prevent memory leaks
  postBtn.removeEventListener("click", createPost);
  postInput.removeEventListener("keypress", createPost);
};

function loadPosts() {
  // For now, posts are stored per user in localStorage using email key
  const stored = localStorage.getItem(`posts_${currentUserEmail}`);
  posts = stored ? JSON.parse(stored) : [];
}

function savePosts() {
  localStorage.setItem(`posts_${currentUserEmail}`, JSON.stringify(posts));
}

function createPost() {
  const text = postInput.value.trim();
  if (text === "") return;

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

      <div class="comments">
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

    const commentList = postDiv.querySelector(".comment-list");
    const commentInput = postDiv.querySelector(".comment-input");

    // Render comments
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
          user: currentUserEmail,
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
