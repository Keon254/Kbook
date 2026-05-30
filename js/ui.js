function goHome(){ loadFeed(); }
function goChat(){ alert("Chat coming next"); }
function goNotifications(){ alert("Notifications coming"); }

document.addEventListener("DOMContentLoaded", async()=>{

  $("loginBtn").onclick = login;
  $("signupBtn").onclick = signup;
  $("postBtn").onclick = createPost;

  const { data } = await db.auth.getSession();

  if(data?.session?.user){
    state.user = data.session.user;
    start();
  }
});