// ═══════════════════════════════════════════
// KUDASAI — Messaging System
// Realtime chat with all features
// ═══════════════════════════════════════════

const Messaging = {
  conversations: [],
  currentConversation: null,
  messages: [],
  typingUsers: [],
  channel: null,

  // Initialize messaging
  async init() {
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    await this.loadConversations();

    // Subscribe to realtime messages
    this.subscribeToMessages();
  },

  // Load all conversations
  async loadConversations() {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return [];

    try {
      // Get conversation memberships
      const { data: memberships } = await db
        .from('conversation_members')
        .select('*, conversations(*, world_members!inner(world_id))')
        .eq('user_id', user.id);

      if (!memberships) return [];

      // For direct messages, get other user info
      const convos = await Promise.all((memberships || []).map(async m => {
        const convo = m.conversations;

        if (convo.type === 'direct') {
          // Get other member
          const { data: otherMember } = await db
            .from('conversation_members')
            .select('*, profiles(username, avatar_url, display_name)')
            .eq('conversation_id', convo.id)
            .neq('user_id', user.id)
            .maybeSingle();

          convo.other_user = otherMember?.profiles;
          convo.display_name = otherMember?.profiles?.display_name || otherMember?.profiles?.username || 'User';
          convo.avatar_url = otherMember?.profiles?.avatar_url;
        } else if (convo.type === 'world') {
          convo.display_name = convo.name || 'World Chat';
        } else {
          convo.display_name = convo.name || 'Group Chat';
        }

        return { ...convo, membership: m };
      }));

      this.conversations = convos;
      return convos;
    } catch (e) {
      console.error('[Messaging]', e);
      return [];
    }
  },

  // Get or create direct message conversation
  async getOrCreateDirectConversation(otherUserId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return null;

    try {
      // Check for existing conversation
      const { data: existing } = await db
        .from('conversation_members')
        .select('conversation_id, conversations(*)')
        .eq('user_id', user.id);

      if (existing && existing.length > 0) {
        const convIds = existing.map(e => e.conversation_id);

        // Check if any of these also have the other user
        for (const conv of existing) {
          const { data: other } = await db
            .from('conversation_members')
            .select('*')
            .eq('conversation_id', conv.conversation_id)
            .eq('user_id', otherUserId)
            .maybeSingle();

          if (other && conv.conversations?.type === 'direct') {
            return conv.conversations;
          }
        }
      }

      // Create new conversation
      const { data: newConvo, error: convError } = await db
        .from('conversations')
        .insert([{
          type: 'direct',
          created_by: user.id
        }])
        .select()
        .single();

      if (convError) throw convError;

      // Add both members
      await db.from('conversation_members').insert([
        { conversation_id: newConvo.id, user_id: user.id },
        { conversation_id: newConvo.id, user_id: otherUserId }
      ]);

      return newConvo;
    } catch (e) {
      console.error('[Messaging]', e);
      return null;
    }
  },

  // Load messages for a conversation
  async loadMessages(conversationId) {
    const db = window.db;

    try {
      const { data, error } = await db
        .from('messages')
        .select('*, profiles(username, avatar_url, display_name)')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      this.messages = data || [];
      return this.messages;
    } catch (e) {
      console.error('[Messaging]', e);
      return [];
    }
  },

  // Send a message
  async sendMessage(conversationId, content, attachments = []) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user || !content.trim()) return null;

    try {
      const { data, error } = await db
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
          attachments
        }])
        .select('*, profiles(username, avatar_url, display_name)')
        .single();

      if (error) throw error;

      // Update conversation timestamp
      await db.from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    } catch (e) {
      console.error('[Messaging]', e);
      return null;
    }
  },

  // Mark messages as read
  async markAsRead(conversationId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    try {
      await db.from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);
    } catch (e) {
      console.error('[Messaging]', e);
    }
  },

  // Subscribe to realtime messages
  subscribeToMessages() {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user || this.channel) return;

    this.channel = db.channel('messaging')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, payload => {
        const msg = payload.new;
        if (this.currentConversation?.id === msg.conversation_id) {
          this.appendMessage(msg);
        }
        this.updateConversationPreview(msg);
      })
      .subscribe();
  },

  // Append new message to UI
  appendMessage(msg) {
    this.messages.push(msg);
    const container = document.getElementById('messagesList');
    if (!container) return;

    container.insertAdjacentHTML('beforeend', this.renderMessage(msg));
    container.scrollTop = container.scrollHeight;
  },

  // Update conversation list preview
  updateConversationPreview(msg) {
    const convo = this.conversations.find(c => c.id === msg.conversation_id);
    if (!convo) return;

    convo.last_message = msg.content;
    convo.updated_at = msg.created_at;
  },

  // Render message
  renderMessage(msg, isOwn = false) {
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    const profile = msg.profiles;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="message ${isOwn ? 'own' : ''}" style="display:flex;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.03)">
        ${profile?.avatar_url
          ? `<img src="${esc(profile.avatar_url)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">`
          : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex-shrink:0">${(profile?.username || 'U')[0].toUpperCase()}</div>`
        }
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-weight:600;font-size:14px;color:${isOwn ? 'var(--accent)' : '#fff'}">${esc(profile?.display_name || profile?.username || 'User')}</span>
            <span style="font-size:11px;color:rgba(255,255,255,0.3)">${time}</span>
          </div>
          <div style="font-size:15px;line-height:1.5;word-break:break-word">${esc(msg.content)}</div>
          ${msg.attachments?.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">${msg.attachments.map(a => `<img src="${esc(a)}" style="max-width:200px;border-radius:8px">`).join('')}</div>` : ''}
        </div>
      </div>
    `;
  },

  // Render conversations list
  renderConversationsList(containerId = 'feed') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="messages-header glass-card" style="padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h2 style="font-size:24px;font-weight:900;margin:0 0 4px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Messages</h2>
            <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0">Real-time conversations with anyone</p>
          </div>
          <button onclick="Messaging.showNewMessageModal()" style="padding:12px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">+ New</button>
        </div>
      </div>
      <div class="conversations-list" id="convosList" style="display:flex;flex-direction:column;gap:8px">
        <div style="text-align:center;padding:48px;color:#555">Loading conversations...</div>
      </div>
    `;

    this.loadConversations().then(() => {
      const list = document.getElementById('convosList');
      if (!list) return;

      if (!this.conversations.length) {
        list.innerHTML = '<div style="text-align:center;padding:48px;color:#555">No conversations yet. Start a new message!</div>';
        return;
      }

      list.innerHTML = this.conversations.map(convo => {
        const time = new Date(convo.updated_at).toLocaleDateString();
        return `
          <div class="convo-item glass-card" onclick="Messaging.openConversation('${convo.id}')" style="padding:16px;border-radius:12px;cursor:pointer;transition:all .2s;font-size:15px" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">
            <div style="display:flex;align-items:center;gap:12px">
              ${convo.avatar_url
                ? `<img src="${convo.avatar_url}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`
                : `<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-size:20px">${convo.type === 'direct' ? '💬' : '👥'}</div>`
              }
              <div style="flex:1;min-width:0">
                <div style="font-weight:600">${convo.display_name}</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${convo.last_message || 'No messages yet'}</div>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,0.3)">${time}</div>
            </div>
          </div>
        `;
      }).join('');
    });
  },

  // Open a conversation
  async openConversation(conversationId) {
    const user = window.KS?.state?.user || window.state?.user;
    const convo = this.conversations.find(c => c.id === conversationId);
    if (!convo) return;

    this.currentConversation = convo;

    const feed = document.getElementById('feed');
    if (!feed) return;

    feed.innerHTML = `
      <div class="chat-header glass-card" style="padding:16px;margin-bottom:0;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;background:rgba(5,5,12,0.95);border-bottom:1px solid rgba(255,255,255,0.06)">
        <button onclick="Messaging.renderConversationsList()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer">←</button>
        ${convo.avatar_url
          ? `<img src="${convo.avatar_url}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
          : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center">💬</div>`
        }
        <div style="flex:1">
          <div style="font-weight:700">${convo.display_name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4)">${convo.type === 'direct' ? 'Direct Message' : convo.type}</div>
        </div>
        <span id="typingIndicator" style="font-size:12px;color:rgba(255,255,255,0.4)"></span>
      </div>
      <div id="messagesList" style="padding:16px;max-height:calc(100vh - 250px);overflow-y:auto"></div>
      <div class="chat-input-wrap" style="padding:16px;position:sticky;bottom:0;background:rgba(5,5,12,0.95);border-top:1px solid rgba(255,255,255,0.06)">
        <div style="display:flex;gap:12px;align-items:flex-end">
          <textarea id="messageInput" placeholder="Type a message..." rows="1" style="flex:1;padding:12px 16px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:15px;resize:none;max-height:120px" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();Messaging.sendMessageFromUI()}"></textarea>
          <button onclick="Messaging.sendMessageFromUI()" style="padding:12px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">Send</button>
        </div>
      </div>
    `;

    await this.loadMessages(conversationId);
    this.markAsRead(conversationId);

    const list = document.getElementById('messagesList');
    if (list) {
      list.innerHTML = this.messages.map(msg => this.renderMessage(msg, msg.sender_id === user?.id)).join('');
      list.scrollTop = list.scrollHeight;
    }
  },

  // Send message from UI
  async sendMessageFromUI() {
    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim() || !this.currentConversation) return;

    const content = input.value.trim();
    input.value = '';

    await this.sendMessage(this.currentConversation.id, content);
  },

  // Show new message modal
  showNewMessageModal() {
    const modal = document.getElementById('postModal');
    const box = document.getElementById('postModalBox');
    if (!modal || !box) return;

    box.innerHTML = `
      <div class="modal-header">
        <span>New Message</span>
        <button class="modal-close" onclick="closePostModal()">✕</button>
      </div>
      <div class="modal-body">
        <input id="newMessageUser" class="comment-input" placeholder="Find a user by @username..." style="width:100%;margin-bottom:12px" oninput="Messaging.searchUsers(this.value)">
        <div id="userSearchResults" style="margin-bottom:12px"></div>
      </div>
    `;

    modal.style.display = 'flex';
  },

  // Search users
  async searchUsers(query) {
    const db = window.db;
    const results = document.getElementById('userSearchResults');
    if (!results || query.length < 2) {
      if (results) results.innerHTML = '';
      return;
    }

    try {
      const { data } = await db
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .ilike('username', `%${query}%`)
        .limit(5);

      results.innerHTML = (data || []).map(u => {
        const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
        return `
          <div onclick="Messaging.startConversationWith('${u.user_id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:pointer;transition:background .2s" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">
            ${u.avatar_url
              ? `<img src="${esc(u.avatar_url)}" style="width:32px;height:32px;border-radius:50%">`
              : `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff">${esc(u.username[0].toUpperCase())}</div>`
            }
            <div>
              <div style="font-weight:600">${esc(u.display_name || u.username)}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5)">@${esc(u.username)}</div>
            </div>
          </div>
        `;
      }).join('') || '<div style="color:#555;padding:10px">No users found</div>';
    } catch (e) {
      console.error('[Messaging]', e);
    }
  },

  // Start conversation with user
  async startConversationWith(userId) {
    const convo = await this.getOrCreateDirectConversation(userId);
    if (convo) {
      closePostModal();
      await this.loadConversations();
      this.openConversation(convo.id);
    }
  }
};

window.Messaging = Messaging;
console.log('[KUDASAI] Messaging module loaded');
