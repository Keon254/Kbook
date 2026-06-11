// ========================================
// KUDASAI ENGINE — STARTUP FIX v2.0
// ========================================

const { createClient } = supabase;

// ───────────────────────────────────────
// ✓ FIXED: Use window.SUPABASE_URL correctly
// ✗ OLD: const _SUPA_URL = window.https://zoipwzvfkbzszpiectzb.supabase.co || '';
// ───────────────────────────────────────
const _SUPA_URL = window.SUPABASE_URL || '';
const _SUPA_KEY = window.SUPABASE_ANON_KEY || '';
const _CREDS_OK  = Boolean(_SUPA_URL && _SUPA_KEY);

// Startup logging for debugging infinite loading
const _startupLog = [];
function logStartup(msg) {
  const ts = new Date().toISOString().slice(11,19);
  _startupLog.push({msg, ts, now: Date.now()});
  console.log(`[${ts}] 📍 ${msg}`);
}

logStartup(`App init started`);
logStartup(`Supabase configured: ${_CREDS_OK ? '✓ YES' : '⚠️ STUB MODE'}`);

let db;
try {
  if (!_CREDS_OK) throw new Error('Supabase credentials not found');
  db = createClient(_SUPA_URL, _SUPA_KEY);
  logStartup('Supabase client created successfully');
} catch(_) {
  logStartup('⚠️ Using offline stub (Supabase unconfigured)');
  
  // Stub client — allows app to function without credentials
  // All DB operations resolve to no-op promises with friendly error messages
  const _noopPromise = Promise.resolve({data:null, error:{message:'Supabase not configured.'}});
  const _chainProxy = new Proxy(function(){return _chainProxy;},{
    get(_,prop){
      if(prop==='then')   return _noopPromise.then.bind(_noopPromise);
      if(prop==='catch')  return _noopPromise.catch.bind(_noopPromise);
      if(prop==='finally')return _noopPromise.finally.bind(_noopPromise);
      return _chainProxy;
    },
    apply(){ return _chainProxy; }
  });
  
  db = {
    auth: {
      getSession:         ()=>Promise.resolve({data:{session:null},error:null}),
      onAuthStateChange:  ()=>({data:{subscription:{unsubscribe:()=>{}}}}),
      signInWithPassword: ()=>Promise.resolve({data:null,error:{message:'Supabase not configured.'}}),
      signUp:             ()=>Promise.resolve({data:null,error:{message:'Supabase not configured.'}}),
      signInWithOAuth:    ()=>Promise.resolve({data:null,error:{message:'Supabase not configured.'}}),
      signOut:            ()=>Promise.resolve({error:null}),
    },
    from:    ()=>_chainProxy,
    channel: ()=>({on:()=>({subscribe:()=>{}})}),
    removeChannel: ()=>{},
  };
}

