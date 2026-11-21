/* KUDASAI Supabase browser integration layer.
 * Loaded after the original app engine through js/core.js. It reuses the
 * existing window.db client and never elevates privileges or bypasses RLS.
 */
(() => {
  'use strict';

  const db = window.db;
  const bucket = window.SUPABASE_MEDIA_BUCKET || 'kudasai-media';
  const byId = id => document.getElementById(id);
  const escapeHtml = value => {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  };
  const currentUser = () => window.state?.user || null;
  const toast = message => window.showToast?.(message) || console.info('[KUDASAI]', message);

  if (!db || typeof db.from !== 'function') {
    console.error('[KUDASAI] Supabase client is unavailable; integrations were not initialized.');
    return;
  }

  async function upload(file, kind) {
    const user = currentUser();
    if (!user) throw new Error('Sign in before uploading media.');
    if (!(file instanceof File)) throw new Error('Choose a valid file.');
    const video = kind === 'video';
    const maxBytes = video ? 100 * 1024 * 1024 : 12 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error(`File is too large (maximum ${video ? '100 MB' : '12 MB'}).`);
    if (video ? !file.type.startsWith('video/') : !file.type.startsWith('image/')) {
      throw new Error(`Choose a valid ${video ? 'video' : 'image'} file.`);
    }
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || 'upload';
    const path = `${user.id}/${kind}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await db.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    const { data: publicUrl } = db.storage.from(bucket).getPublicUrl(data.path);
    if (!publicUrl?.publicUrl) throw new Error('Storage returned no public media URL.');
    return { path: data.path, url: publicUrl.publicUrl };
  }

  function setUploadProgress(visible, percent = 0) {
    const wrap = byId('uploadProgress');
    const bar = byId('uploadProgressBar');
    if (wrap) wrap.style.display = visible ? '' : 'none';
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  // Add real file uploads to the existing composer without changing its layout.
  const composerActions = document.querySelector('.composer-actions');
  if (composerActions && !byId('kudasaiImageUpload')) {
    const controls = document.createElement('span');
    controls.style.cssText = 'display:contents';
    controls.innerHTML = `
      <label class="file-label" for="kudasaiImageUpload">📷 Upload image</label>
      <input id="kudasaiImageUpload" type="file" accept="image/*" hidden>
      <label class="file-label" for="kudasaiVideoUpload">🎞 Upload video</label>
      <input id="kudasaiVideoUpload" type="file" accept="video/*" hidden>`;
    composerActions.insertBefore(controls, byId('postBtn'));
  }

  // Retain original actions for older clients, but intercept the actual submit
  // click so attached files are uploaded before a real posts-table insert.
  const postButton = byId('postBtn');
  if (postButton) {
    postButton.addEventListener('click', async event => {
      const image = byId('kudasaiImageUpload')?.files?.[0] || null;
      const video = byId('kudasaiVideoUpload')?.files?.[0] || null;
      if (!image && !video) return; // the existing application handles text-only posts
      event.preventDefault();
      event.stopImmediatePropagation();
      const user = currentUser();
      if (!user) { toast('Sign in to post media.'); return; }
      const content = byId('postInput')?.value.trim() || '';
      const imageUrl = byId('postImageUrl')?.value.trim();
      if (!content && !image && !video && !imageUrl) { toast('Add text or media to your post.'); return; }
      const button = byId('postBtn');
      const uploaded = [];
      if (button) { button.disabled = true; button.textContent = 'Uploading…'; }
      setUploadProgress(true, 5);
      try {
        let image_url = imageUrl || null;
        let video_url = null;
        if (image) { const result = await upload(image, 'images'); uploaded.push(result.path); image_url = result.url; }
        setUploadProgress(true, image && video ? 55 : 75);
        if (video) { const result = await upload(video, 'videos'); uploaded.push(result.path); video_url = result.url; }
        const post = { user_id: user.id, content, image_url, video_url };
        const poll = byId('pollBuilder');
        if (poll && poll.style.display !== 'none') {
          const options = Array.from(byId('pollOptionsList')?.querySelectorAll('input') || [])
            .map(input => input.value.trim()).filter(Boolean);
          if (options.length >= 2) post.poll_options = options.map(text => ({ text, votes: 0 }));
        }
        const { error } = await db.from('posts').insert([post]);
        if (error) throw error;
        if (byId('postInput')) byId('postInput').value = '';
        if (byId('postImageUrl')) byId('postImageUrl').value = '';
        if (byId('kudasaiImageUpload')) byId('kudasaiImageUpload').value = '';
        if (byId('kudasaiVideoUpload')) byId('kudasaiVideoUpload').value = '';
        localStorage.removeItem('kd_draft');
        setUploadProgress(true, 100);
        toast('Post published.');
        await window.loadFeed?.();
      } catch (error) {
        // Avoid orphaned files when the post insert is rejected by RLS/schema.
        if (uploaded.length) await db.storage.from(bucket).remove(uploaded).catch(() => {});
        console.error('[KUDASAI] Media post failed:', error);
        toast(error.message || 'Media post failed. Check Storage policies and try again.');
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Post'; }
        setTimeout(() => setUploadProgress(false), 350);
      }
    }, true);
  }

  // Stories must store durable Storage URLs, never browser-local object URLs.
  window.uploadStory = async function(input) {
    const file = input?.files?.[0];
    if (!file || !currentUser()) return;
    let path;
    try {
      const result = await upload(file, 'stories');
      path = result.path;
      const caption = window.prompt('Add a caption (optional):') || '';
      const { error } = await db.from('stories').insert([{
        user_id: currentUser().id,
        image_url: result.url,
        caption,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }]);
      if (error) throw error;
      toast('Story posted.');
      await window.loadStoriesBar?.();
    } catch (error) {
      if (path) await db.storage.from(bucket).remove([path]).catch(() => {});
      console.error('[KUDASAI] Story upload failed:', error);
      toast(error.message || 'Story upload failed.');
    } finally {
      if (input) input.value = '';
    }
  };

  // Durable profile image uploads; profile fields remain guarded by Supabase RLS.
  const originalSaveProfile = window.saveProfile;
  if (typeof originalSaveProfile === 'function') {
    window.saveProfile = async function() {
      const user = currentUser();
      if (!user) return toast('Sign in to edit your profile.');
      const avatarFile = byId('editAvatarFile')?.files?.[0];
      const bannerFile = byId('editBannerFile')?.files?.[0];
      if (!avatarFile && !bannerFile) return originalSaveProfile.apply(this, arguments);
      const button = document.querySelector('#editModal .comment-btn');
      if (button) { button.disabled = true; button.textContent = 'Uploading…'; }
      const paths = [];
      try {
        const updates = {
          username: byId('editUsername')?.value.trim(),
          bio: byId('editBio')?.value.trim()
        };
        if (!updates.username) throw new Error('Username cannot be empty.');
        if (avatarFile) { const result = await upload(avatarFile, 'avatars'); paths.push(result.path); updates.avatar_url = result.url; }
        if (bannerFile) { const result = await upload(bannerFile, 'banners'); paths.push(result.path); updates.banner_url = result.url; }
        const { data, error } = await db.from('profiles').update(updates).eq('user_id', user.id).select('*').single();
        if (error) throw error;
        if (window.state) window.state.profile = data;
        byId('userTag') && (byId('userTag').textContent = `@${data.username}`);
        window.closeEditModal?.();
        toast('Profile updated.');
      } catch (error) {
        if (paths.length) await db.storage.from(bucket).remove(paths).catch(() => {});
        console.error('[KUDASAI] Profile update failed:', error);
        toast(error.message || 'Profile update failed.');
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Save Changes'; }
      }
    };
  }

  // The committed core schema uses sender_id/receiver_id direct messages.
  // Use that schema instead of the separate conversations-table Omega model.
  window.goMessages = async function() {
    const feed = byId('feed');
    if (!feed || !currentUser()) return;
    window.setActiveNav?.('messages');
    byId('feedTabs') && (byId('feedTabs').style.display = 'none');
    byId('composer') && (byId('composer').style.display = 'none');
    byId('storiesBar') && (byId('storiesBar').style.display = 'none');
    feed.innerHTML = '<div style="padding:40px;text-align:center;color:#888">Loading messages…</div>';
    try {
      const user = currentUser();
      const { data: messages, error } = await db.from('messages').select('id,sender_id,receiver_id,content,created_at,read')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const latest = new Map();
      for (const message of messages || []) {
        const otherId = message.sender_id === user.id ? message.receiver_id : message.sender_id;
        if (otherId && !latest.has(otherId)) latest.set(otherId, message);
      }
      const ids = [...latest.keys()];
      let profiles = [];
      if (ids.length) {
        const result = await db.from('profiles').select('user_id,username,avatar_url').in('user_id', ids);
        if (result.error) throw result.error;
        profiles = result.data || [];
      }
      const profileMap = new Map(profiles.map(profile => [profile.user_id, profile]));
      const rows = ids.map(id => {
        const profile = profileMap.get(id) || { username: 'user' };
        const message = latest.get(id);
        return `<button type="button" onclick="openDM('${escapeHtml(id)}','${escapeHtml(profile.username)}')" style="width:100%;text-align:left;display:flex;align-items:center;gap:12px;padding:14px 18px;background:transparent;color:inherit;border:0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer">
          ${profile.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover">` : '<span aria-hidden="true">💬</span>'}
          <span style="min-width:0;flex:1"><strong>@${escapeHtml(profile.username)}</strong><br><span style="color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${escapeHtml(message.content)}</span></span>
          <time style="font-size:11px;color:#777">${escapeHtml(new Date(message.created_at).toLocaleDateString())}</time>
        </button>`;
      }).join('');
      feed.innerHTML = `<section style="max-width:680px;margin:auto"><h2 style="padding:16px 20px;color:var(--accent)">💬 Messages</h2><div style="padding:0 16px 12px"><input class="search" placeholder="New message — @username…" id="dmSearchInput" oninput="dmUserSearch(this.value)" style="width:100%;box-sizing:border-box"><div id="dmUserResults"></div></div>${rows || '<div style="padding:45px;text-align:center;color:#777">No messages yet. Search for someone to start a conversation.</div>'}</section>`;
    } catch (error) {
      console.error('[KUDASAI] Message list failed:', error);
      feed.innerHTML = `<div role="alert" style="padding:40px;text-align:center;color:#f88">Could not load messages: ${escapeHtml(error.message)}</div>`;
    }
  };

  // No admin/superadmin/GOD columns or role table exist in the checked-in
  // schema. Only server-set JWT app_metadata is considered authoritative;
  // user-editable profile metadata is deliberately ignored.
  window.KUDASAIAuthority = Object.freeze({
    async getRole() {
      const { data, error } = await db.auth.getUser();
      if (error) throw error;
      return String(data.user?.app_metadata?.role || '').toLowerCase();
    },
    async hasAny(roles = []) {
      const role = await this.getRole();
      return roles.map(value => String(value).toLowerCase()).includes(role);
    }
  });
  window.KUDASAIStorage = Object.freeze({ bucket, upload });
  console.info('[KUDASAI] Storage, direct-message schema adapter and trusted-role helper initialized.');
})();
