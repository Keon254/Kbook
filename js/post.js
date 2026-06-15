// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Post Module
// ═════════════════════════════════════════════════════════════════════

window.KSPost = {
  // Create a new post
  async create(userId, content, options = {}) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };
    if (!content?.trim() && !options.image_url && !options.video_url) {
      return { error: 'Post cannot be empty' };
    }

    const postData = {
      user_id: userId,
      content: content?.trim() || ''
    };

    // Add optional fields
    if (options.image_url) postData.image_url = options.image_url;
    if (options.video_url) postData.video_url = options.video_url;
    if (options.audio_url) postData.audio_url = options.audio_url;
    if (options.community_id) postData.community_id = options.community_id;
    if (options.poll_options) postData.poll_options = options.poll_options;
    if (options.thread_id) postData.thread_id = options.thread_id;

    try {
      const { data, error } = await db.from('posts')
        .insert([postData])
        .select('*, profiles(username, avatar_url)')
        .single();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Get a single post
  async get(postId) {
    const db = window.db;
    if (!db) return { error: 'No database' };

    try {
      const { data, error } = await db.from('posts')
        .select('*, profiles(username, avatar_url)')
        .eq('id', postId)
        .maybeSingle();

      return { data, error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Delete a post
  async delete(postId, userId) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    try {
      const { error } = await db.from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);

      return { error };
    } catch (e) {
      return { error: e.message };
    }
  },

  // Vote on a poll
  async votePoll(postId, userId, optionIndex) {
    const db = window.db;
    if (!db || !userId) return { error: 'Not authenticated' };

    try {
      // Check if already voted
      const { data: existing } = await db.from('poll_votes')
        .select('option_index')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) return { error: 'Already voted' };

      // Get current poll options
      const { data: post } = await db.from('posts')
        .select('poll_options')
        .eq('id', postId)
        .single();

      if (!post?.poll_options) return { error: 'Poll not found' };

      const opts = [...post.poll_options];
      opts[optionIndex] = { ...opts[optionIndex], votes: (opts[optionIndex].votes || 0) + 1 };

      // Update poll
      await db.from('posts').update({ poll_options: opts }).eq('id', postId);

      // Record vote
      await db.from('poll_votes').insert([{
        post_id: postId,
        user_id: userId,
        option_index: optionIndex
      }]);

      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }
};
