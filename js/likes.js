// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Likes Module
// ═════════════════════════════════════════════════════════════════════

window.KSLikes = {
  // Toggle like on a post
  async toggle(postId, userId) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    try {
      // Check if already liked
      const { data: existing } = await db.from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Unlike
        await db.from('likes').delete().eq('id', existing.id);
        await this._updateCount(postId, -1);
        return { liked: false };
      } else {
        // Like
        await db.from('likes').insert([{ post_id: postId, user_id: userId }]);
        await this._updateCount(postId, 1);
        return { liked: true };
      }
    } catch (e) {
      return { error: e.message };
    }
  },

  // Internal: update likes_count on posts table
  async _updateCount(postId, delta) {
    const db = window.db;
    if (!db) return;

    // Get current count
    const { data } = await db.from('posts').select('likes_count').eq('id', postId).single();
    const current = data?.likes_count || 0;
    await db.from('posts').update({ likes_count: Math.max(0, current + delta) }).eq('id', postId);
  },

  // Check if user has liked a post
  async hasLiked(postId, userId) {
    const db = window.db;
    if (!db || !userId) return false;

    const { data } = await db.from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    return !!data;
  },

  // Get all likes for a post (count)
  async getCount(postId) {
    const db = window.db;
    if (!db) return 0;

    const { count } = await db.from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);

    return count || 0;
  }
};
