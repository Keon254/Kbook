// ═════════════════════════════════════════════════════════════════════
// KUDASAI — KAI Intelligence Engine
// Not a chatbot — the intelligence layer powering discovery
// ═════════════════════════════════════════════════════════════════════

const KAI = {
  conversations: [],
  isProcessing: false,
  context: {
    userInterests: [],
    visitedWorlds: [],
    recentSearches: [],
    connections: []
  },

  // Initialize KAI
  async init() {
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    await this.loadUserContext();
  },

  // Load user context for personalization
  async loadUserContext() {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;
      if (!user) return;

      // Get user memory/preferences
      const { data: memory } = await db
        .from('user_memory')
        .select('*')
        .eq('user_id', user.id);

      if (memory) {
        memory.forEach(m => {
          if (m.memory_type === 'preference') this.context.userInterests.push(m.key);
          if (m.memory_type === 'favorite_world') this.context.visitedWorlds.push(m.value);
          if (m.memory_type === 'reading_history') this.context.recentSearches.push(m.key);
        });
      }

      // Get followed users
      const { data: follows } = await db
        .from('follows')
        .select('*, profiles!follows_following_id_fkey(username)')
        .eq('follower_id', user.id);

      if (follows) {
        this.context.connections = follows.map(f => f.profiles?.username).filter(Boolean);
      }
    } catch (e) {
      console.error('[KAI]', e);
    }
  },

  // Save to user memory
  async remember(key, value, type = 'preference') {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;
      if (!user) return;

      await db.from('user_memory').upsert({
        user_id: user.id,
        memory_type: type,
        key,
        value: typeof value === 'object' ? value : { data: value }
      }, { onConflict: 'user_id,memory_type,key' });
    } catch (e) {
      console.error('[KAI]', e);
    }
  },

  // Generate homepage feed
  async generateFeed() {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;

      // Personalized recommendations based on:
      // 1. Following
      // 2. Worlds user is member of
      // 3. Trending posts
      // 4. User's interests

      let posts = [];

      // Posts from followed users
      if (user) {
        const { data: following } = await db
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        if (following?.length) {
          const ids = following.map(f => f.following_id);
          const { data } = await db
            .from('posts')
            .select('*, profiles(username, avatar_url, display_name)')
            .in('user_id', ids)
            .order('created_at', { ascending: false })
            .limit(15);
          posts = posts.concat(data || []);
        }

        // Posts from user's worlds
        const { data: worldMemberships } = await db
          .from('world_members')
          .select('world_id')
          .eq('user_id', user.id);

        if (worldMemberships?.length) {
          const worldIds = worldMemberships.map(w => w.world_id);
          const { data } = await db
            .from('posts')
            .select('*, profiles(username, avatar_url, display_name)')
            .in('world_id', worldIds)
            .order('created_at', { ascending: false })
            .limit(10);
          posts = posts.concat(data || []);
        }
      }

      // Add trending posts
      const { data: trending } = await db
        .from('posts')
        .select('*, profiles(username, avatar_url, display_name)')
        .order('likes_count', { ascending: false })
        .limit(10);
      posts = posts.concat(trending || []);

      // Remove duplicates
      const seen = new Set();
      posts = posts.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      return posts;
    } catch (e) {
      console.error('[KAI]', e);
      return [];
    }
  },

  // Search across all content
  async search(query, type = 'all') {
    try {
      const db = window.db;
      const results = {
        posts: [],
        users: [],
        worlds: [],
        knowledge: []
      };

      // Save search history
      this.remember(query, { query, timestamp: Date.now() }, 'reading_history');

      if (type === 'all' || type === 'posts') {
        const { data } = await db
          .from('posts')
          .select('*, profiles(username, avatar_url, display_name)')
          .ilike('content', `%${query}%`)
          .limit(10);
        results.posts = data || [];
      }

      if (type === 'all' || type === 'users') {
        const { data } = await db
          .from('profiles')
          .select('*')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(10);
        results.users = data || [];
      }

      if (type === 'all' || type === 'worlds') {
        const { data } = await db
          .from('worlds')
          .select('*')
          .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
          .limit(10);
        results.worlds = data || [];
      }

      if (type === 'all' || type === 'knowledge') {
        const { data } = await db
          .from('knowledge_articles')
          .select('*')
          .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
          .eq('is_published', true)
          .limit(10);
        results.knowledge = data || [];
      }

      return results;
    } catch (e) {
      console.error('[KAI]', e);
      return { posts: [], users: [], worlds: [], knowledge: [] };
    }
  },

  // Get recommendations for user
  async getRecommendations() {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;
      const recs = {
        worlds: [],
        users: [],
        posts: []
      };

      // Recommended worlds (not yet joined)
      if (user) {
        const { data: joined } = await db
          .from('world_members')
          .select('world_id')
          .eq('user_id', user.id);

        const joinedIds = (joined || []).map(j => j.world_id);

        const { data: worlds } = await db
          .from('worlds')
          .select('*')
          .not('id', 'in', `(${joinedIds.join(',') || 'null'})`)
          .eq('is_featured', true)
          .order('member_count', { ascending: false })
          .limit(4);

        recs.worlds = worlds || [];

        // Recommended users (not yet following)
        const { data: following } = await db
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id);

        const followingIds = (following || []).map(f => f.following_id);
        followingIds.push(user.id); // Exclude self

        const { data: users } = await db
          .from('profiles')
          .select('*')
          .not('user_id', 'in', `(${followingIds.join(',') || 'null'})`)
          .order('xp', { ascending: false })
          .limit(5);

        recs.users = users || [];
      }

      return recs;
    } catch (e) {
      console.error('[KAI]', e);
      return { worlds: [], users: [], posts: [] };
    }
  },

  // KAI Conversation (for assistance)
  async converse(message) {
    try {
      // Store conversation
      this.conversations.push({ role: 'user', content: message });

      // Simple response logic (can be enhanced with AI later)
      const lower = message.toLowerCase();
      let response = '';

      // Help commands
      if (lower.includes('help') || lower === '?') {
        response = `I'm KAI, your KUDASAI Intelligence Engine. I can help you:

• Discover worlds to join
• Find people to connect with
• Search for content
• Explain how things work
• Navigate the platform

Just ask me anything!`;
      }
      else if (lower.includes('world') || lower.includes('community')) {
        response = `Worlds are communities evolved into living digital spaces. Would you like me to show you some popular worlds to join?`;
        this.showWorldRecommendations();
      }
      else if (lower.includes('level') || lower.includes('xp')) {
        const user = window.KS?.state?.user || window.state?.user;
        if (user) {
          const { data: profile } = await window.db
            .from('profiles')
            .select('xp, level')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profile) {
            const nextLevel = profile.level + 1;
            const xpNeeded = nextLevel * 1000;
            const xpProgress = profile.xp % 1000;

            response = `You're Level ${profile.level} with ${profile.xp} XP. You need ${1000 - xpProgress} more XP to reach Level ${nextLevel}. Keep posting, engaging, and completing quests!`;
          }
        }
      }
      else if (lower.includes('quest')) {
        response = `Quests are daily and weekly challenges that reward you with XP. Complete them to level up faster! Want to see your current quests?`;
      }
      else if (lower.includes('search') || lower.includes('find')) {
        const query = message.replace(/search|find|for|me|show/gi, '').trim();
        if (query) {
          response = `Searching for "${query}"...`;
          const results = await this.search(query);
          const total = results.posts.length + results.users.length + results.worlds.length;
          response = `Found ${total} results for "${query}":
• ${results.posts.length} posts
• ${results.users.length} users
• ${results.worlds.length} worlds`;
        }
      }
      else if (lower.includes('who') && lower.includes('follow')) {
        const recs = await this.getRecommendations();
        if (recs.users.length) {
          response = `Here are some people you might like to connect with:\n\n${recs.users.slice(0, 3).map(u => `• @${u.username} (Level ${u.level})`).join('\n')}`;
        } else {
          response = `You're already following a great network! Keep exploring to find more creators.`;
        }
      }
      else {
        response = `I understand you're asking about "${message}". I'm here to help you discover and navigate KUDASAI. Try asking me about worlds, quests, your level, or to search for something specific!`;
      }

      this.conversations.push({ role: 'assistant', content: response });
      return response;
    } catch (e) {
      console.error('[KAI]', e);
      return "I'm having trouble processing that right now. Please try again.";
    }
  },

  // Show world recommendations
  async showWorldRecommendations() {
    const recs = await this.getRecommendations();
    // This would trigger a UI update in the KAI panel
    return recs.worlds;
  },

  // Render KAI panel
  renderKAIPanel(containerId = 'feed') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="kai-header glass-card" style="padding:32px;margin-bottom:20px;text-align:center">
        <div style="font-size:48px;margin-bottom:8px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">✦</div>
        <h2 style="font-size:28px;font-weight:900;margin:0 0 8px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">KAI</h2>
        <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0">KUDASAI Intelligence Engine</p>
      </div>
      <div class="kai-chat" id="kaiChat" style="padding:16px;min-height:300px;margin-bottom:16px">
        <div class="kai-message assistant" style="margin-bottom:16px">
          <div style="display:flex;gap:12px">
            <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">✦</div>
            <div style="flex:1;padding:16px;border-radius:16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
              <div style="font-size:15px;line-height:1.6">Hello! I'm KAI, your KUDASAI Intelligence Engine. I can help you discover worlds, find people, search for content, and navigate the platform. What would you like to explore?</div>
            </div>
          </div>
        </div>
      </div>
      <div class="kai-input-wrap" style="padding:16px;border-top:1px solid rgba(255,255,255,0.06)">
        <div style="display:flex;gap:12px">
          <input id="kaiInput" class="comment-input" placeholder="Ask KAI anything..." style="flex:1;padding:14px 18px;border-radius:20px" onkeydown="if(event.key==='Enter')KAI.sendMessage()">
          <button onclick="KAI.sendMessage()" style="padding:14px 24px;border-radius:20px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">Ask</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button onclick="KAI.quickAsk('Show me worlds')" style="padding:8px 16px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;cursor:pointer;font-size:13px">🌍 Worlds</button>
          <button onclick="KAI.quickAsk('Suggest people to follow')" style="padding:8px 16px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;cursor:pointer;font-size:13px">👥 People</button>
          <button onclick="KAI.quickAsk('My level and XP')" style="padding:8px 16px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;cursor:pointer;font-size:13px">📊 Level</button>
          <button onclick="KAI.quickAsk('Show my quests')" style="padding:8px 16px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;cursor:pointer;font-size:13px">📋 Quests</button>
        </div>
      </div>
    `;
  },

  // Send message from UI
  async sendMessage() {
    const input = document.getElementById('kaiInput');
    if (!input || !input.value.trim()) return;

    const message = input.value.trim();
    input.value = '';

    this.appendMessage(message, 'user');
    this.setProcessing(true);

    const response = await this.converse(message);

    setTimeout(() => {
      this.appendMessage(response, 'assistant');
      this.setProcessing(false);
    }, 300);
  },

  // Quick ask shortcut
  quickAsk(message) {
    const input = document.getElementById('kaiInput');
    if (input) input.value = message;
    this.sendMessage();
  },

  // Append message to chat
  appendMessage(content, role) {
    const chat = document.getElementById('kaiChat');
    if (!chat) return;

    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

    const html = role === 'user' ? `
      <div class="kai-message user" style="margin-bottom:16px">
        <div style="display:flex;gap:12px;justify-content:flex-end">
          <div style="max-width:70%;padding:14px 18px;border-radius:20px;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-size:15px;line-height:1.5">${esc(content)}</div>
        </div>
      </div>
    ` : `
      <div class="kai-message assistant" style="margin-bottom:16px">
        <div style="display:flex;gap:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">✦</div>
          <div style="flex:1;padding:16px;border-radius:16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
            <div style="font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(content)}</div>
          </div>
        </div>
      </div>
    `;

    chat.insertAdjacentHTML('beforeend', html);
    chat.scrollTop = chat.scrollHeight;
  },

  // Set processing state
  setProcessing(processing) {
    this.isProcessing = processing;
    const btn = document.querySelector('.kai-input-wrap button');
    if (btn) {
      btn.disabled = processing;
      btn.textContent = processing ? '...' : 'Ask';
    }
  }
};

window.KAI = KAI;
console.log('[KUDASAI] KAI module loaded');
