const login = safe(async()=>{

  const { data,error } =
  await db.auth.signInWithPassword({

    email:$("email").value,
    password:$("password").value

  });

  if(error) throw error;

  state.user = data.user;

  await bootstrap();
});

const signup = safe(async()=>{

  const email = $("email").value;

  const { data,error } =
  await db.auth.signUp({

    email,
    password:$("password").value

  });

  if(error) throw error;

  await db.from("profiles").insert([{
    user_id:data.user.id,
    username:email.split("@")[0],
    balance:0
  }]);

  alert("Signup success");
});

async function bootstrap(){

  $("authScreen").style.display = "none";
  $("app").style.display = "grid";

  await loadProfile();
  await loadFeed();

  startRealtime();
}

async function loadProfile(){

  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("user_id",state.user.id)
    .maybeSingle();

  state.profile = data;

  $("userTag").textContent =
    "@" + (data?.username || "user");

  $("balanceText").textContent =
    "K" + (data?.balance || 0);
}
