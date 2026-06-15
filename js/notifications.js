// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Notifications Module
// ═════════════════════════════════════════════════════════════════════

window.KSNotifications = {
  // Load notifications for a user
  async load(userId, options = {}) {
    const db = window.db;
    if (!db || !userId) return { data: [], error: 'Not authenticated' };

    const { limit = 30, unreadOnly = false } = options;

    try {
      let query = db.from('notifications')
        .select('*, profiles(username, avatar_url)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (unreadOnly) {
        query = query.eq('read', false);
      }

      const { data, error } = await query;
      return { data, error };
    } catch (e) {
      return { data: null, error: e.message };
    }
  },

  // Mark notifications as read
  async markRead(userId, notificationIds = null) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    try {
      let query = db.from('notifications')
        .update({ read: true })
        .eq('user_id', userId);

      if (notificationIds && Array.isArray(notificationIds)) {
        query = query.in('id', notificationIds);
      } else {
        query = query.eq('read', false);
      }

      const { error } = await query;
      return { error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Create a notification
  async create(userId, fromUserId, type, postId = null) {
    const db = window.db;
    if (!db) return { error: 'No database' };

    try {
      const { data, error } = await db.from('notifications')
        .insert([{
          user_id: userId,
          from_user_id: fromUserId,
          type,
          post_id: postId
        }])
        .single();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Get unread count
  async getUnreadCount(userId) {
    const db = window.db;
    if (!db || !userId) return 0;

    const { count } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    return count || 0;
  }
};
