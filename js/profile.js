// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Profile Module
// ═════════════════════════════════════════════════════════════════════

window.KSProfile = {
  // Get a user's profile
  async get(userId) {
    const db = window.db;
    if (!db) return { error: 'No database' };

    try {
      const { data, error } = await db.from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Update a user's profile
  async update(userId, updates) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    const allowed = ['username', 'bio', 'avatar_url', 'banner_url', 'status_message'];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }

    try {
      const { data, error } = await db.from('profiles')
        .update(filtered)
        .eq('user_id', userId)
        .select('*')
        .single();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Get user's posts
  async getPosts(userId, limit = 20) {
    const db = window.db;
    if (!db) return { data: [] };

    try {
      const { data, error } = await db.from('posts')
        .select('*, profiles(username, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Get followers
  async getFollowers(userId) {
    const db = window.db;
    if (!db) return { data: [] };

    try {
      const { data, error } = await db.from('follows')
        .select('follower_id, profiles!follows_follower_id_fkey(user_id, username, avatar_url)')
        .eq('following_id', userId);

      return { data: data?.map(f => f.profiles), error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Get following
  async getFollowing(userId) {
    const db = window.db;
    if (!db) return { data: [] };

    try {
      const { data, error } = await db.from('follows')
        .select('following_id, profiles!follows_following_id_fkey(user_id, username, avatar_url)')
        .eq('follower_id', userId);

      return { data: data?.map(f => f.profiles), error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Follow a user
  async follow(followerId, followingId) {
    const db = window.db;
    if (!db || !followerId) return { error: 'Not authenticated' };

    try {
      const { error } = await db.from('follows').insert([{
        follower_id: followerId,
        following_id: followingId
      }]);

      return { error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Unfollow a user
  async unfollow(followerId, followingId) {
    const db = window.db;
    if (!db || !followerId) return { error: 'Not authenticated' };

    try {
      const { error } = await db.from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

      return { error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Check if following
  async isFollowing(followerId, followingId) {
    const db = window.db;
    if (!db) return false;

    const { data } = await db.from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', followingId)
      .maybeSingle();

    return !!data;
  }
};
