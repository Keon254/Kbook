// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Feed Module
// Exported functions for dynamic feed loading, pagination, filtering
// ═════════════════════════════════════════════════════════════════════

window.KSFeed = {
  PAGE_SIZE: 10,

  // Load posts with pagination
  async load(options = {}) {
    const db = window.db;
    if (!db) return { data: [], error: 'No database' };

    const { tab = 'forYou', page = 0, userId } = options;
    const from = page * this.PAGE_SIZE;
    const to = from + this.PAGE_SIZE - 1;

    try {
      let query = db.from('posts')
        .select('*, profiles(username, avatar_url)')
        .order('created_at', { ascending: false })
        .range(from, to);

      // Filter by following if tab is 'following'
      if (tab === 'following' && userId) {
        const { data: follows } = await db.from('follows')
          .select('following_id')
          .eq('follower_id', userId);

        const ids = (follows || []).map(f => f.following_id);
        if (!ids.length) return { data: [] };
        query = query.in('user_id', ids);
      }

      const { data, error } = await query;
      return { data, error };
    } catch (e) {
      return { data: null, error: e.message };
    }
  },

  // Load trending posts
  async loadTrending(limit = 20) {
    const db = window.db;
    if (!db) return { data: [], error: 'No database' };

    try {
      const { data, error } = await db.from('posts')
        .select('*, profiles(username, avatar_url)')
        .order('likes_count', { ascending: false })
        .limit(limit);
      return { data, error };
    } catch (e) {
      return { data: null, error: e.message };
    }
  },

  // Search posts
  async search(query, limit = 20) {
    const db = window.db;
    if (!db) return { data: [], error: 'No database' };

    try {
      const { data, error } = await db.from('posts')
        .select('*, profiles(username, avatar_url)')
        .ilike('content', `%${query}%`)
        .order('created_at', { ascending: false })
        .limit(limit);
      return { data, error };
    } catch (e) {
      return { data: null, error: e.message };
    }
  }
};
