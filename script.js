const postBtn = document.getElementById("postBtn");
const postInput = document.getElementById("postInput");
const feed = document.getElementById("feed");

postBtn.addEventListener("click", createPost);

function createPost() {
  const text = postInput.value.trim();
  if (text === "") return;

  const post = document.createElement("div");
  post.className = "post";

  post.innerHTML = `
    <h4>You</h4>
    <p>${text}</p>
    <div class="actions">
      <button class="like-btn">Like (<span>0</span>)</button>
      <button>Comment</button>
    </div>
  `;

  feed.prepend(post);
  postInput.value = "";

  const likeBtn = post.querySelector(".like-btn");
  const countSpan = likeBtn.querySelector("span");
  let likes = 0;

  likeBtn.addEventListener("click", () => {
    likes++;
    countSpan.textContent = likes;
  });
}
