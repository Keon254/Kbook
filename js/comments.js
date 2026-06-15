// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Comments Module
// ═════════════════════════════════════════════════════════════════════

window.KSComments = {
  // Load comments for a post
  async load(postId, options = {}) {
    const db = window.db;
    if (!db) return { data: [], error: 'No database' };

    const { limit = 50, offset = 0 } = options;

    try {
      const { data, error } = await db.from('comments')
        .select('*, profiles(username, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);
      return { data, error };
    } catch (e) {
      return { data: null, error: e.message };
    }
  },

  // Add a comment
  async add(postId, userId, content) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };
    if (!content?.trim()) return { error: 'Comment cannot be empty' };

    try {
      const { data, error } = await db.from('comments')
        .insert([{ post_id: postId, user_id: userId, content: content.trim() }])
        .select('*, profiles(username, avatar_url)')
        .single();

      if (!error && data) {
        // Update comment count
        await this._updateCount(postId, 1);
      }

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Delete a comment
  async delete(commentId, postId, userId) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    try {
      const { error } = await db.from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);

      if (!error) {
        await this._updateCount(postId, -1);
      }

      return { error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Internal: update comments_count
  async _updateCount(postId, delta) {
    const db = window.db;
    if (!db) return;

    const { data } = await db.from('posts').select('comments_count').eq('id', postId).single();
    const current = data?.comments_count || 0;
    await db.from('posts').update({ comments_count: Math.max(0, current + delta) }).eq('id', postId);
  }
};
