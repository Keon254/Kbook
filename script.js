const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

// Load saved posts on page load
let posts = JSON.parse(localStorage.getItem("posts")) || [];
renderPosts();

// Button click
postBtn.addEventListener("click", createPost);

// Enter key
postInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    createPost();
  }
});

function createPost() {
  const text = postInput.value.trim();
  if (text === "") return;

  const postData = {
    user: "You",
    text: text,
    time: new Date().toLocaleString(),
    likes: 0
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
        <button>Comment</button>
      </div>
    `;

    const likeBtn = postDiv.querySelector(".like-btn");
    likeBtn.addEventListener("click", () => {
      posts[index].likes++;
      savePosts();
      renderPosts();
    });

    feed.appendChild(postDiv);
  });
}

function savePosts() {
  localStorage.setItem("posts", JSON.stringify(posts));
}
