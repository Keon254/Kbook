// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Surveys/Polls Module
// ═════════════════════════════════════════════════════════════════════

window.KSSurveys = {
  // Get all polls
  async list(options = {}) {
    const db = window.db;
    if (!db) return { data: [] };

    const { limit = 20, offset = 0 } = options;

    try {
      const { data, error } = await db.from('posts')
        .select('*, profiles(username, avatar_url)')
        .not('poll_options', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Create a poll post
  async create(userId, content, options, duration = 3) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    const validOpts = options.filter(o => o?.trim());
    if (validOpts.length < 2) return { error: 'Need at least 2 options' };

    const pollOptions = validOpts.map(text => ({ text, votes: 0 }));
    const endsAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);

    try {
      const { data, error } = await db.from('posts').insert([{
        user_id: userId,
        content: content?.trim() || '',
        poll_options: pollOptions,
        poll_ends_at: endsAt.toISOString()
      }]).select('*').single();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Vote on a poll (delegates to KSPost.votePoll)
  async vote(postId, userId, optionIndex) {
    if (!window.KSPost) return { error: 'Post module not loaded' };
    return window.KSPost.votePoll(postId, userId, optionIndex);
  },

  // Get poll results
  async getResults(postId) {
    const db = window.db;
    if (!db) return { error: 'No database' };

    try {
      const { data, error } = await db.from('posts')
        .select('poll_options')
        .eq('id', postId)
        .single();

      if (!data?.poll_options) return { error: 'Poll not found' };

      const total = data.poll_options.reduce((sum, o) => sum + (o.votes || 0), 0);
      const results = data.poll_options.map((o, i) => ({
        index: i,
        text: o.text,
        votes: o.votes || 0,
        percentage: total ? Math.round((o.votes || 0) / total * 100) : 0
      }));

      return { data: { results, total }, error };
    } catch (e) {
      return { error: e.message };
    }
  }
};
