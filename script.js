const postInput = document.getElementById("postInput");
const postBtn = document.getElementById("postBtn");
const feed = document.getElementById("feed");

postBtn.addEventListener("click", () => {
  const text = postInput.value.trim();

  if (text === "") {
    alert("Write something first.");
    return;
  }

  const post = document.createElement("div");
  post.className = "post";

  post.innerHTML = `
    <h4>You</h4>
    <p>${text}</p>
    <div class="actions">
      <button class="like-btn">Like</button>
      <button>Comment</button>
    </div>
  `;

  feed.prepend(post);
  postInput.value = "";
});
