// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Worlds System
// Communities evolve into Worlds — living digital spaces
// ═════════════════════════════════════════════════════════════════════

const Worlds = {
  currentWorld: null,
  worlds: [],

  // Load all worlds
  async loadWorlds() {
    try {
      const db = window.db;
      const { data, error } = await db
        .from('worlds')
        .select('*')
        .is('is_private', false)
        .order('member_count', { ascending: false });

      if (error) throw error;
      this.worlds = data || [];
      return data;
    } catch (e) {
      console.error('[Worlds]', e);
      return [];
    }
  },

  // Get featured worlds
  async getFeatured() {
    try {
      const db = window.db;
      const { data, error } = await db
        .from('worlds')
        .select('*')
        .eq('is_featured', true)
        .order('member_count', { ascending: false })
        .limit(8);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[Worlds]', e);
      return [];
    }
  },

  // Join a world
  async joinWorld(worldId) {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;
      if (!user) throw new Error('Please sign in to join worlds');

      // Check if already a member
      const { data: existing } = await db
        .from('world_members')
        .select('id')
        .eq('world_id', worldId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        return { success: false, message: 'Already a member' };
      }

      // Join the world
      const { error } = await db
        .from('world_members')
        .insert([{
          world_id: worldId,
          user_id: user.id,
          role: 'member'
        }]);

      if (error) throw error;

      // Update member count
      await db.rpc('increment_world_members', { wid: worldId }).catch(() => {});

      return { success: true };
    } catch (e) {
      console.error('[Worlds]', e);
      return { success: false, message: e.message };
    }
  },

  // Leave a world
  async leaveWorld(worldId) {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;
      if (!user) throw new Error('Not signed in');

      const { error } = await db
        .from('world_members')
        .delete()
        .eq('world_id', worldId)
        .eq('user_id', user.id);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error('[Worlds]', e);
      return { success: false, message: e.message };
    }
  },

  // Get world posts
  async getWorldPosts(worldId, page = 0, limit = 20) {
    try {
      const db = window.db;
      const offset = page * limit;

      const { data, error } = await db
        .from('posts')
        .select('*, profiles(username, avatar_url, display_name)')
        .eq('world_id', worldId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[Worlds]', e);
      return [];
    }
  },

  // Get world members
  async getMembers(worldId) {
    try {
      const db = window.db;
      const { data, error } = await db
        .from('world_members')
        .select('*, profiles(username, avatar_url, display_name)')
        .eq('world_id', worldId);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[Worlds]', e);
      return [];
    }
  },

  // Create a new world
  async createWorld(name, description, category, icon, isPrivate = false) {
    try {
      const db = window.db;
      const user = window.KS?.state?.user || window.state?.user;
      if (!user) throw new Error('Please sign in to create worlds');

      const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);

      const { data, error } = await db
        .from('worlds')
        .insert([{
          name,
          slug,
          description,
          category: category || 'general',
          icon: icon || '🌐',
          is_private: isPrivate,
          created_by: user.id
        }])
        .select()
        .single();

      if (error) throw error;

      // Auto-join as owner
      await db.from('world_members').insert([{
        world_id: data.id,
        user_id: user.id,
        role: 'owner'
      }]);

      return { success: true, world: data };
    } catch (e) {
      console.error('[Worlds]', e);
      return { success: false, message: e.message };
    }
  },

  // Render world card
  renderWorldCard(world, isMember = false) {
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    return `
      <div class="world-card glass-card" onclick="Worlds.openWorld('${world.id}')" style="cursor:pointer">
        <div class="world-banner" style="background:${world.banner_url ? `url(${esc(world.banner_url)})` : 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(168,85,247,0.2))'};background-size:cover;background-position:center">
          <div class="world-icon" style="font-size:48px;text-shadow:0 4px 20px rgba(0,0,0,0.5)">${esc(world.icon || '🌐')}</div>
        </div>
        <div class="world-info" style="padding:16px">
          <h3 style="font-size:18px;font-weight:700;margin:0 0 4px;color:var(--accent)">${esc(world.name)}</h3>
          <p style="font-size:13px;color:rgba(255,255,255,0.6);margin:0 0 12px;line-height:1.5">${esc(world.description || 'No description')}</p>
          <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:rgba(255,255,255,0.5)">
            <span>${world.member_count || 0} members</span>
            <span>${world.category || 'general'}</span>
          </div>
          <button class="world-join-btn" onclick="event.stopPropagation(); ${isMember ? `Worlds.leaveWorld('${world.id}')` : `Worlds.joinWorld('${world.id}')`}" style="margin-top:12px;width:100%;padding:10px;border-radius:12px;border:1px solid ${isMember ? 'rgba(255,100,100,0.3)' : 'rgba(0,212,255,0.3)'};background:${isMember ? 'rgba(255,100,100,0.1)' : 'rgba(0,212,255,0.1)'};color:${isMember ? '#f88' : '#00d4ff'};font-weight:600;cursor:pointer;transition:all .2s">
            ${isMember ? 'Leave World' : 'Enter World'}
          </button>
        </div>
      </div>
    `;
  },

  // Open world view
  openWorld(worldId) {
    const world = this.worlds.find(w => w.id === worldId);
    if (!world) return;

    this.currentWorld = world;

    // Update feed to show world posts
    if (window.goToWorld) {
      window.goToWorld(worldId);
    }
  },

  // Render worlds list page
  renderWorldsPage(containerId = 'feed') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="worlds-header glass-card" style="padding:24px;margin-bottom:20px;text-align:center">
        <h2 style="font-size:28px;font-weight:900;margin:0 0 8px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Explore Worlds</h2>
        <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0">Communities evolve into living digital spaces</p>
      </div>
      <div class="worlds-grid" id="worldsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        <div style="text-align:center;padding:48px;color:#555">Loading worlds...</div>
      </div>
    `;

    this.loadWorlds().then(worlds => {
      const grid = document.getElementById('worldsGrid');
      if (!grid) return;

      if (!worlds.length) {
        grid.innerHTML = '<div style="text-align:center;padding:48px;color:#555">No worlds found</div>';
        return;
      }

      grid.innerHTML = worlds.map(w => this.renderWorldCard(w)).join('');
    });
  }
};

window.Worlds = Worlds;
console.log('[KUDASAI] Worlds module loaded');
