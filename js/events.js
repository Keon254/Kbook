// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Events System
// Creator Events, World Events, Workshops, Livestreams
// ═════════════════════════════════════════════════════════════════════

const Events = {
  events: [],
  userEvents: [],

  // Load upcoming events
  async loadEvents() {
    try {
      const db = window.db;
      const now = new Date().toISOString();

      const { data, error } = await db
        .from('events')
        .select('*, profiles(username, avatar_url, display_name, user_id), worlds(name, icon)')
        .eq('is_virtual', true)
        .or(`visibility.eq.public,visibility.is.null`)
        .gte('starts_at', now)
        .order('starts_at', { ascending: true })
        .limit(20);

      if (error) throw error;
      this.events = data || [];
      return this.events;
    } catch (e) {
      console.error('[Events]', e);
      return [];
    }
  },

  // Load user's registered events
  async loadUserEvents() {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return [];

    try {
      const { data, error } = await db
        .from('event_registrations')
        .select('*, events(*, profiles(username, avatar_url), worlds(name, icon))')
        .eq('user_id', user.id)
        .order('registered_at', { ascending: false });

      if (error) throw error;
      this.userEvents = data || [];
      return this.userEvents;
    } catch (e) {
      console.error('[Events]', e);
      return [];
    }
  },

  // Register for event
  async register(eventId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return { success: false, message: 'Please sign in' };

    try {
      // Check if already registered
      const { data: existing } = await db
        .from('event_registrations')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        return { success: false, message: 'Already registered' };
      }

      // Register
      const { error } = await db
        .from('event_registrations')
        .insert([{
          event_id: eventId,
          user_id: user.id
        }]);

      if (error) throw error;

      // Update count
      await db.rpc('increment_event_registrations', { eid: eventId }).catch(() => {});

      return { success: true };
    } catch (e) {
      console.error('[Events]', e);
      return { success: false, message: e.message };
    }
  },

  // Cancel registration
  async cancelRegistration(eventId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return { success: false };

    try {
      const { error } = await db
        .from('event_registrations')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', user.id);

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error('[Events]', e);
      return { success: false, message: e.message };
    }
  },

  // Create event
  async createEvent(eventData) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return { success: false, message: 'Please sign in' };

    try {
      const { data, error } = await db
        .from('events')
        .insert([{
          ...eventData,
          host_id: user.id
        }])
        .select()
        .single();

      if (error) throw error;

      // Auto-register host
      await db.from('event_registrations').insert([{
        event_id: data.id,
        user_id: user.id,
        attended: true
      }]);

      return { success: true, event: data };
    } catch (e) {
      console.error('[Events]', e);
      return { success: false, message: e.message };
    }
  },

  // Render event card
  renderEventCard(event, isRegistered = false) {
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    const start = new Date(event.starts_at);
    const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const relative = this.getRelativeTime(start);

    return `
      <div class="event-card glass-card" style="border-radius:16px;overflow:hidden;margin-bottom:16px">
        <div style="background:${event.image_url ? `url(${esc(event.image_url)})` : 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(168,85,247,0.3))'};background-size:cover;background-position:center;height:140px;position:relative;display:flex;align-items:flex-end;padding:16px">
          <div style="background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);padding:8px 14px;border-radius:10px;display:flex;gap:16px">
            <div style="text-align:center">
              <div style="font-size:20px;font-weight:900;color:#00d4ff">${dateStr.split(' ')[0]}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.7)">${dateStr.split(' ')[1] || ''}</div>
            </div>
            <div style="width:1px;background:rgba(255,255,255,0.1)"></div>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:700">${timeStr}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.6)">${relative}</div>
            </div>
          </div>
        </div>
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(0,212,255,0.1);color:#00d4ff;font-size:11px;font-weight:600">${esc(event.event_type || 'event')}</span>
            ${event.worlds ? `<span style="color:rgba(255,255,255,0.5);font-size:12px">in ${esc(event.worlds.name)}</span>` : ''}
          </div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px">${esc(event.title)}</h3>
          <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0 0 16px;line-height:1.5">${esc(event.description || 'No description')}</p>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.5)">
              <span>${event.registered_count || 0} registered</span>
              ${event.capacity ? `<span>• ${event.capacity} max</span>` : ''}
            </div>
            <button onclick="Events.toggleRegistration('${event.id}')" style="padding:10px 20px;border-radius:10px;border:none;background:${isRegistered ? 'rgba(255,100,100,0.2)' : 'linear-gradient(135deg,#00d4ff,#a855f7)'};color:${isRegistered ? '#f88' : '#fff'};font-weight:600;cursor:pointer;transition:all .2s">
              ${isRegistered ? 'Cancel' : 'Register'}
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // Toggle registration
  async toggleRegistration(eventId) {
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) {
      alert('Please sign in to register for events');
      return;
    }

    const isRegistered = this.userEvents.some(ue => ue.event_id === eventId);

    if (isRegistered) {
      await this.cancelRegistration(eventId);
    } else {
      await this.register(eventId);
    }

    await this.loadUserEvents();
    this.showEvents();
  },

  // Get relative time string
  getRelativeTime(date) {
    const now = new Date();
    const diff = date - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    return 'starting soon';
  },

  // Show events page
  showEvents() {
    const feed = document.getElementById('feed');
    if (!feed) return;

    feed.innerHTML = `
      <div class="events-header glass-card" style="padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h2 style="font-size:24px;font-weight:900;margin:0 0 4px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Events</h2>
            <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0">Join workshops, livestreams, and creator events</p>
          </div>
          <button onclick="Events.showCreateModal()" style="padding:12px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">+ Create</button>
        </div>
      </div>
      <div class="events-tabs" style="display:flex;gap:12px;margin-bottom:20px">
        <button onclick="Events.showUpcoming()" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(0,212,255,0.3);background:rgba(0,212,255,0.1);color:#00d4ff;font-weight:600;cursor:pointer">Upcoming</button>
        <button onclick="Events.showMyEvents()" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;font-weight:600;cursor:pointer">My Events</button>
      </div>
      <div id="eventsList"></div>
    `;

    this.showUpcoming();
  },

  showUpcoming() {
    const list = document.getElementById('eventsList');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center;padding:48px;color:#555">Loading events...</div>';

    this.loadEvents().then(() => {
      if (!this.events.length) {
        list.innerHTML = '<div style="text-align:center;padding:48px;color:#555">No upcoming events. Create one!</div>';
        return;
      }

      const registeredIds = new Set(this.userEvents.map(ue => ue.event_id));
      list.innerHTML = this.events.map(e => this.renderEventCard(e, registeredIds.has(e.id))).join('');
    });
  },

  showMyEvents() {
    const list = document.getElementById('eventsList');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center;padding:48px;color:#555">Loading...</div>';

    this.loadUserEvents().then(() => {
      if (!this.userEvents.length) {
        list.innerHTML = '<div style="text-align:center;padding:48px;color:#555">You haven\'t registered for any events yet.</div>';
        return;
      }

      list.innerHTML = this.userEvents.map(ue => this.renderEventCard(ue.events, true)).join('');
    });
  },

  showCreateModal() {
    const modal = document.getElementById('postModal');
    const box = document.getElementById('postModalBox');
    if (!modal || !box) return;

    box.innerHTML = `
      <div class="modal-header">
        <span>Create Event</span>
        <button class="modal-close" onclick="closePostModal()">✕</button>
      </div>
      <div class="modal-body">
        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Title</label>
        <input id="eventTitle" placeholder="Event name" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Description</label>
        <textarea id="eventDescription" placeholder="What's this event about?" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px;resize:none" rows="3"></textarea>

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Event Type</label>
        <select id="eventType" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">
          <option value="general">General</option>
          <option value="livestream">Livestream</option>
          <option value="workshop">Workshop</option>
          <option value="voice_session">Voice Session</option>
          <option value="world_event">World Event</option>
          <option value="creator_event">Creator Event</option>
        </select>

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Date & Time</label>
        <input id="eventDateTime" type="datetime-local" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Join URL (optional)</label>
        <input id="eventJoinUrl" placeholder="https://..." style="width:100%;margin-bottom:16px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <button onclick="Events.createAndClose()" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">Create Event</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async createAndClose() {
    const title = document.getElementById('eventTitle')?.value.trim();
    const description = document.getElementById('eventDescription')?.value.trim();
    const event_type = document.getElementById('eventType')?.value;
    const starts_at = document.getElementById('eventDateTime')?.value;
    const join_url = document.getElementById('eventJoinUrl')?.value.trim();

    if (!title || !starts_at) {
      alert('Please fill in the title and date/time');
      return;
    }

    const result = await this.createEvent({
      title,
      description,
      event_type,
      starts_at: new Date(starts_at).toISOString(),
      join_url,
      is_virtual: true
    });

    if (result.success) {
      closePostModal();
      this.showEvents();
    } else {
      alert(result.message);
    }
  }
};

window.Events = Events;
console.log('[KUDASAI] Events module loaded');
