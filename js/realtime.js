// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Realtime Module
// Manages Supabase Realtime subscriptions for live updates
// ═════════════════════════════════════════════════════════════════════

window.KSRealtime = {
  channels: new Map(),
  db: null,

  init(supabaseClient) {
    this.db = supabaseClient;
  },

  // Subscribe to new posts
  subscribeToPosts(callback) {
    if (!this.db) return;
    if (this.channels.has('posts')) return;

    const channel = this.db.channel('public:posts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts'
      }, (payload) => {
        if (typeof callback === 'function') callback(payload.new);
      })
      .subscribe();

    this.channels.set('posts', channel);
    return channel;
  },

  // Subscribe to notifications
  subscribeToNotifications(userId, callback) {
    if (!this.db || !userId) return;
    const key = `notifications:${userId}`;
    if (this.channels.has(key)) return;

    const channel = this.db.channel(key)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        if (typeof callback === 'function') callback(payload.new);
      })
      .subscribe();

    this.channels.set(key, channel);
    return channel;
  },

  // Subscribe to direct messages
  subscribeToMessages(userId, otherId, callback) {
    if (!this.db || !userId || !otherId) return;
    const key = `dm:${[userId, otherId].sort().join('-')}`;
    if (this.channels.has(key)) return;

    const channel = this.db.channel(key)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const m = payload.new;
        const relevant = (m.sender_id === userId && m.receiver_id === otherId) ||
                         (m.sender_id === otherId && m.receiver_id === userId);
        if (relevant && typeof callback === 'function') callback(m);
      })
      .subscribe();

    this.channels.set(key, channel);
    return channel;
  },

  // Unsubscribe from specific channel
  unsubscribe(key) {
    const channel = this.channels.get(key);
    if (channel) {
      try { this.db.removeChannel(channel); } catch (_) {}
      this.channels.delete(key);
    }
  },

  // Unsubscribe from all channels
  unsubscribeAll() {
    for (const [key, channel] of this.channels) {
      try { this.db?.removeChannel(channel); } catch (_) {}
    }
    this.channels.clear();
  }
};
