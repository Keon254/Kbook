// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Creator Studio
// Analytics Dashboard, Audience Insights, Growth Tracking
// ═════════════════════════════════════════════════════════════════════

const CreatorStudio = {
  profile: null,
  analytics: {
    overview: null,
    followers: [],
    engagement: [],
    posts: []
  },

  // Initialize creator profile
  async init() {
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    await this.loadOrCreateProfile();
  },

  // Load or create creator profile
  async loadOrCreateProfile() {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return null;

    try {
      const { data, error } = await db
        .from('creator_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create new creator profile
        const { data: newProfile, error: createError } = await db
          .from('creator_profiles')
          .insert([{
            user_id: user.id,
            creator_level: 1,
            creator_tier: 'bronze'
          }])
          .select()
          .single();

        if (createError) throw createError;
        this.profile = newProfile;
      } else {
        this.profile = data;
      }

      // Sync stats from profiles table
      await this.syncStats();

      return this.profile;
    } catch (e) {
      console.error('[CreatorStudio]', e);
      return null;
    }
  },

  // Sync stats from related tables
  async syncStats() {
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    try {
      const db = window.db;

      // Get follower count
      const { count: followerCount } = await db
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);

      // Get total views
      const { data: posts } = await db
        .from('posts')
        .select('views_count, likes_count, comments_count')
        .eq('user_id', user.id);

      const totalViews = posts?.reduce((sum, p) => sum + (p.views_count || 0), 0) || 0;
      const totalEngagement = posts?.reduce((sum, p) => sum + (p.likes_count || 0) + (p.comments_count || 0), 0) || 0;

      // Calculate tier
      let tier = 'bronze';
      if (followerCount >= 10000) tier = 'diamond';
      else if (followerCount >= 1000) tier = 'platinum';
      else if (followerCount >= 500) tier = 'gold';
      else if (followerCount >= 100) tier = 'silver';

      const level = Math.floor(Math.log2(followerCount + 1)) + 1;

      // Update creator profile
      await db.from('creator_profiles')
        .update({
          total_followers: followerCount,
          total_views: totalViews,
          total_engagement: totalEngagement,
          creator_tier: tier,
          creator_level: level
        })
        .eq('user_id', user.id);

      if (this.profile) {
        this.profile.total_followers = followerCount;
        this.profile.total_views = totalViews;
        this.profile.total_engagement = totalEngagement;
        this.profile.creator_tier = tier;
        this.profile.creator_level = level;
      }
    } catch (e) {
      console.error('[CreatorStudio]', e);
    }
  },

  // Load analytics data
  async loadAnalytics() {
    if (!this.profile) return;

    try {
      const db = window.db;

      // Load last 30 days of analytics
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: analyticsData, error } = await db
        .from('creator_analytics')
        .select('*')
        .eq('creator_id', this.profile.id)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;

      if (analyticsData && analyticsData.length > 0) {
        // Sum totals
        const totals = analyticsData.reduce((acc, d) => ({
          followers_gained: acc.followers_gained + (d.followers_gained || 0),
          followers_lost: acc.followers_lost + (d.followers_lost || 0),
          views: acc.views + (d.views || 0),
          likes: acc.likes + (d.likes || 0),
          comments: acc.comments + (d.comments || 0),
          shares: acc.shares + (d.shares || 0),
          saves: acc.saves + (d.saves || 0)
        }), { followers_gained: 0, followers_lost: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0 });

        this.analytics.overview = totals;
        this.analytics.followers = analyticsData.map(d => ({
          date: d.date,
          net: (d.followers_gained || 0) - (d.followers_lost || 0)
        }));
        this.analytics.engagement = analyticsData.map(d => ({
          date: d.date,
          total: (d.likes || 0) + (d.comments || 0) + (d.shares || 0)
        }));
      }
    } catch (e) {
      console.error('[CreatorStudio]', e);
    }
  },

  // Get top posts
  async getTopPosts() {
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return [];

    try {
      const db = window.db;

      const { data, error } = await db
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .order('likes_count', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[CreatorStudio]', e);
      return [];
    }
  },

  // Render Creator Studio
  async render() {
    const feed = document.getElementById('feed');
    if (!feed) return;

    await this.init();
    await this.loadAnalytics();

    const p = this.profile || {};
    const a = this.analytics.overview || {};

    const tierColors = {
      bronze: 'linear-gradient(135deg, #cd7f32, #8b4513)',
      silver: 'linear-gradient(135deg, #c0c0c0, #808080)',
      gold: 'linear-gradient(135deg, #ffd700, #daa520)',
      platinum: 'linear-gradient(135deg, #e5e4e2, #b0c4de)',
      diamond: 'linear-gradient(135deg, #b9f2ff, #00d4ff)'
    };

    feed.innerHTML = `
      <div class="creator-header glass-card" style="padding:32px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:20px">
          <div style="width:80px;height:80px;border-radius:50%;background:${tierColors[p.creator_tier] || tierColors.bronze};display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 0 30px ${p.creator_tier === 'diamond' ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.2)'}">
            ${p.creator_tier === 'diamond' ? '💎' : p.creator_tier === 'platinum' ? '💠' : p.creator_tier === 'gold' ? '🥇' : p.creator_tier === 'silver' ? '🥈' : '🥉'}
          </div>
          <div style="flex:1">
            <h2 style="font-size:24px;font-weight:900;margin:0 0 4px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Creator Studio</h2>
            <p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0">Level ${p.creator_level || 1} Creator • ${p.creator_tier?.charAt(0).toUpperCase() + p.creator_tier?.slice(1)} Tier</p>
          </div>
          <div style="text-align:right">
            <div style="font-size:32px;font-weight:900;color:var(--accent)">${p.total_followers?.toLocaleString() || 0}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5)">followers</div>
          </div>
        </div>
      </div>

      <div class="creator-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px">
        <div class="stat-card glass-card" style="padding:20px;border-radius:16px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#00d4ff">${a.views?.toLocaleString() || 0}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">Total Views</div>
        </div>
        <div class="stat-card glass-card" style="padding:20px;border-radius:16px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#a855f7">${a.likes?.toLocaleString() || 0}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">Total Likes</div>
        </div>
        <div class="stat-card glass-card" style="padding:20px;border-radius:16px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#00ff88">${(((a.followers_gained || 0) - (a.followers_lost || 0))).toLocaleString()}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">Net Followers</div>
        </div>
        <div class="stat-card glass-card" style="padding:20px;border-radius:16px;text-align:center">
          <div style="font-size:28px;font-weight:900;color:#ffd700">${a.shares?.toLocaleString() || 0}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">Shares</div>
        </div>
      </div>

      <div class="creator-sections" style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="section-card glass-card" style="padding:20px;border-radius:16px">
          <h3 style="font-size:16px;font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">📊</span> Growth This Month
          </h3>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${this.analytics.followers?.slice(-7).map((f, i) => `
              <div style="display:flex;align-items:center;font-size:13px">
                <span style="flex:1;color:rgba(255,255,255,0.5)">${new Date(f.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span style="font-weight:700;color:${f.net >= 0 ? '#00ff88' : '#f55'}">${f.net >= 0 ? '+' : ''}${f.net}</span>
              </div>
            `).join('') || '<div style="color:#555">No data yet</div>'}
          </div>
        </div>

        <div class="section-card glass-card" style="padding:20px;border-radius:16px">
          <h3 style="font-size:16px;font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">📈</span> Engagement Trend
          </h3>
          <div style="height:100px;display:flex;align-items:flex-end;gap:4px">
            ${this.analytics.engagement?.map(e => `
              <div style="flex:1;background:linear-gradient(to top, rgba(0,212,255,0.3), rgba(168,85,247,0.5));border-radius:4px 4px 0 0;transition:height 0.3s" style="height:${Math.min(100, (e.total / Math.max(...(this.analytics.engagement?.map(x => x.total) || [1]))) * 100)}%"></div>
            `).join('') || '<div style="color:#555;width:100%;text-align:center">No data yet</div>'}
          </div>
        </div>
      </div>

      <div class="section-card glass-card" style="padding:20px;border-radius:16px;margin-top:20px">
        <h3 style="font-size:16px;font-weight:700;margin:0 0:16px;display:flex;align-items:center;gap:8px">
          <span style="font-size:20px">🏆</span> Top Performing Posts
        </h3>
        <div id="topPosts" style="display:flex;flex-direction:column;gap:12px">
          <div style="text-align:center;padding:24px;color:#555">Loading...</div>
        </div>
      </div>

      <div class="section-card glass-card" style="padding:20px;border-radius:16px;margin-top:20px">
        <h3 style="font-size:16px;font-weight:700;margin:0 0:16px;display:flex;align-items:center;gap:8px">
          <span style="font-size:20px">🎯</span> Creator Goals
        </h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:150px;padding:16px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px">Next Milestone</div>
            <div style="font-size:18px;font-weight:700">100 followers</div>
            <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:8px;overflow:hidden">
              <div style="height:100%;width:${Math.min(100, (p.total_followers / 100) * 100)}%;background:linear-gradient(90deg,#00d4ff,#a855f7)"></div>
            </div>
          </div>
          <div style="flex:1;min-width:150px;padding:16px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px">Engagement Rate</div>
            <div style="font-size:18px;font-weight:700">${p.total_followers > 0 ? ((p.total_engagement / p.total_followers) * 100).toFixed(1) : 0}%</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">Target: 5%+</div>
          </div>
          <div style="flex:1;min-width:150px;padding:16px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px">Creator Score</div>
            <div style="font-size:18px;font-weight:700">${(p.creator_level || 1) * 100}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">Based on engagement</div>
          </div>
        </div>
      </div>
    `;

    // Load top posts
    const topPostsContainer = document.getElementById('topPosts');
    const topPosts = await this.getTopPosts();

    if (topPostsContainer && topPosts.length > 0) {
      topPostsContainer.innerHTML = topPosts.slice(0, 5).map((post, i) => {
        const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
        const date = new Date(post.created_at).toLocaleDateString();
        return `
          <div style="display:flex;gap:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.02)">
            <div style="font-size:20px;font-weight:900;color:rgba(255,255,255,0.3)">#${i + 1}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(post.content?.slice(0, 80) || 'Untitled')}</div>
              <div style="display:flex;gap:12px;margin-top:6px;font-size:12px;color:rgba(255,255,255,0.5)">
                <span>❤️ ${post.likes_count || 0}</span>
                <span>💬 ${post.comments_count || 0}</span>
                <span>🔁 ${post.reposts_count || 0}</span>
                <span>${date}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else if (topPostsContainer) {
      topPostsContainer.innerHTML = '<div style="text-align:center;padding:24px;color:#555">Start posting to see your top content here!</div>';
    }
  }
};

window.CreatorStudio = CreatorStudio;
console.log('[KUDASAI] Creator Studio module loaded');
