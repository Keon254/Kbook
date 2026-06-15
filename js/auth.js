// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Auth Module (uses global db from script.js)
// ═════════════════════════════════════════════════════════════════════

const _authLocalState = {
  user: null,
  profile: null
};

// Get db reference (initialized in script.js)
const _getDb = () => window.db;

// Login helper
const loginWithCreds = safe(async (email, password) => {
  const db = _getDb();
  if (!db) throw new Error('Database not initialized');

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;

  _authLocalState.user = data.user;
  return data.user;
});

// Signup helper
const signupWithCreds = safe(async (email, password) => {
  const db = _getDb();
  if (!db) throw new Error('Database not initialized');

  const { data, error } = await db.auth.signUp({ email, password });
  if (error) throw error;

  if (data?.user) {
    const username = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').slice(0, 24) || 'user';
    await db.from('profiles').insert([{
      user_id: data.user.id,
      username,
      balance: 0
    }]);
  }

  return data;
});

// Forgot password helper
const resetPassword = safe(async (email) => {
  const db = _getDb();
  if (!db) throw new Error('Database not initialized');

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '?reset=1'
  });
  if (error) throw error;
  return true;
});

// Export for use in script.js
window.KASAuth = {
  login: loginWithCreds,
  signup: signupWithCreds,
  resetPassword,
  getState: () => ({ ..._authLocalState })
};
