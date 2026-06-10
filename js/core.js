const { createClient } = supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const state = {
  user: null,
  posts: [],
  profilesMap: {},
  lastAction: {}
};

const $ = id => document.getElementById(id);

function safe(fn){
  return async (...args)=>{
    try{ await fn(...args); }
    catch(e){
      console.error(e);
      alert(e.message);
    }
  };
}

function cooldown(k,t){
  const n = Date.now();
  if(state.lastAction[k] && n - state.lastAction[k] < t) return false;
  state.lastAction[k] = n;
  return true;
}
