// ═════════════════════════════════════════════════════════════════════
// KUDASAI — UI Module (Toasts, Modals, Animations)
// ═════════════════════════════════════════════════════════════════════

window.KSUI = {
  // Toast notifications
  toast(msg, duration = 2500, type = 'info') {
    const container = document.getElementById('notifToastContainer');
    if (!container) return;

    const colors = {
      info: 'rgba(0,212,255,0.15)',
      success: 'rgba(0,230,118,0.15)',
      error: 'rgba(239,83,80,0.15)',
      warning: 'rgba(255,171,64,0.15)'
    };

    const borders = {
      info: 'rgba(0,212,255,0.3)',
      success: 'rgba(0,230,118,0.3)',
      error: 'rgba(255,83,83,0.3)',
      warning: 'rgba(255,171,64,0.3)'
    };

    const t = document.createElement('div');
    t.className = 'notif-toast';
    t.textContent = msg;
    t.style.cssText = `
      padding:10px 18px;
      margin-bottom:8px;
      border-radius:12px;
      background:${colors[type] || colors.info};
      border:1px solid ${borders[type] || borders.info};
      color:#fff;
      font-size:14px;
      backdrop-filter:blur(12px);
      animation:fadeIn .2s ease;
    `;

    container.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s';
      setTimeout(() => t.remove(), 300);
    }, duration);
  },

  // Open modal
  openModal(id, content) {
    const modal = document.getElementById(id);
    if (!modal) return;

    const box = modal.querySelector('.modal-box');
    if (box && content) box.innerHTML = content;

    modal.style.display = 'flex';
    modal.style.opacity = '0';
    requestAnimationFrame(() => {
      modal.style.transition = 'opacity .2s';
      modal.style.opacity = '1';
    });
  },

  // Close modal
  closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    modal.style.transition = 'opacity .2s';
    modal.style.opacity = '0';
    setTimeout(() => modal.style.display = 'none', 200);
  },

  // Lightbox for images
  openLightbox(src, sources = []) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    if (!lightbox || !img) return;

    img.src = src;
    img.style.display = '';
    lightbox.style.display = 'flex';

    // Store gallery sources for navigation
    lightbox.dataset.gallery = JSON.stringify(sources);
    lightbox.dataset.current = sources.indexOf(src).toString();
  },

  closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) lightbox.style.display = 'none';
  },

  // Render a post card
  renderPost(p, currentUser) {
    const esc = window.KSHelpers?.esc || ((s) => {
      const d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    });

    const uname = p.profiles?.username || 'user';
    const avatar = p.profiles?.avatar_url
      ? `<img src="${esc(p.profiles.avatar_url)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0">`
      : `<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:17px;flex-shrink:0">${uname[0].toUpperCase()}</div>`;

    const time = new Date(p.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const media = p.image_url
      ? `<img src="${esc(p.image_url)}" style="width:100%;border-radius:14px;margin-top:10px;max-height:420px;object-fit:cover;cursor:pointer" onclick="openLightbox('${esc(p.image_url)}')">`
      : p.video_url
      ? `<video src="${esc(p.video_url)}" controls style="width:100%;border-radius:14px;margin-top:10px"></video>`
      : '';

    const isOwn = p.user_id === currentUser?.id;
    const deleteBtn = isOwn
      ? `<button onclick="deletePost('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s;margin-left:auto" onmouseover="this.style.color='#f55'" onmouseout="this.style.color='#666'" title="Delete">🗑</button>`
      : '';

    return `<div class="post-card" id="post-${p.id}" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="cursor:pointer;flex-shrink:0" onclick="viewProfile('${esc(p.user_id)}')">${avatar}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:700;cursor:pointer;color:var(--accent)" onclick="viewProfile('${esc(p.user_id)}')">@${esc(uname)}</span>
            <span style="color:#444;font-size:12px">${esc(time)}</span>
          </div>
          <div style="margin-top:6px;line-height:1.6;word-break:break-word;font-size:15px">${esc(p.content || '')}</div>
          ${media}
          <div style="display:flex;gap:20px;margin-top:12px;align-items:center">
            <button onclick="toggleLike('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#e05'" onmouseout="this.style.color='#666'">❤️ <span id="likes-${p.id}">${p.likes_count || 0}</span></button>
            <button onclick="openPost('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#00d4ff'" onmouseout="this.style.color='#666'">💬 <span id="comments-${p.id}">${p.comments_count || 0}</span></button>
            <button onclick="repost('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#0f0'" onmouseout="this.style.color='#666'">🔁 <span id="reposts-${p.id}">${p.reposts_count || 0}</span></button>
            <button onclick="bookmark('${p.id}')" style="background:none;border:none;color:#666;cursor:pointer;font-size:13px;padding:4px 0;transition:color .2s" onmouseover="this.style.color='#fa0'" onmouseout="this.style.color='#666'" title="Bookmark">🔖</button>
            ${deleteBtn}
          </div>
        </div>
      </div>
    </div>`;
  }
};
