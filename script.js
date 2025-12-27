function addPost() {
  const textarea = document.querySelector("textarea");
  const postText = textarea.value;

  if (postText.trim() === "") return;

  const postDiv = document.createElement("div");
  postDiv.className = "post";
  postDiv.innerText = postText;

  document.getElementById("posts").prepend(postDiv);
  textarea.value = "";
}
