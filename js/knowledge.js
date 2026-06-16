// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Knowledge System
// Articles, Tutorials, Guides, Books, Research Collections
// ═════════════════════════════════════════════════════════════════════

const Knowledge = {
  articles: [],
  categories: ['article', 'tutorial', 'guide', 'book', 'research'],

  // Load articles
  async loadArticles(category = null, limit = 20) {
    try {
      const db = window.db;
      let query = db
        .from('knowledge_articles')
        .select('*, profiles(username, avatar_url, display_name), worlds(name, icon)')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(limit);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      this.articles = data || [];
      return this.articles;
    } catch (e) {
      console.error('[Knowledge]', e);
      return [];
    }
  },

  // Load single article
  async loadArticle(slug) {
    try {
      const db = window.db;
      const { data, error } = await db
        .from('knowledge_articles')
        .select('*, profiles(username, avatar_url, display_name, user_id, verified), worlds(name, icon)')
        .eq('slug', slug)
        .single();

      if (error) throw error;

      // Increment view count
      await db.rpc('increment_article_views', { aid: data.id }).catch(() => {});

      return data;
    } catch (e) {
      console.error('[Knowledge]', e);
      return null;
    }
  },

  // Save article
  async saveArticle(articleId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return { success: false };

    try {
      const { data, error } = await db
        .from('saved_posts')
        .insert([{
          user_id: user.id,
          post_id: articleId, // Using saved_posts for articles too
          collection_name: 'knowledge'
        }])
        .maybeSingle();

      return { success: true };
    } catch (e) {
      console.error('[Knowledge]', e);
      return { success: false };
    }
  },

  // Create article
  async createArticle(articleData) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return { success: false, message: 'Please sign in' };

    try {
      const { data, error } = await db
        .from('knowledge_articles')
        .insert([{
          ...articleData,
          author_id: user.id,
          slug: this.generateSlug(articleData.title)
        }])
        .select()
        .single();

      if (error) throw error;
      return { success: true, article: data };
    } catch (e) {
      console.error('[Knowledge]', e);
      return { success: false, message: e.message };
    }
  },

  // Generate URL slug
  generateSlug(title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  },

  // Render article card
  renderArticleCard(article) {
    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
    const date = new Date(article.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
      <div class="article-card glass-card" onclick="Knowledge.openArticle('${article.slug}')" style="border-radius:16px;overflow:hidden;cursor:pointer;transition:all .2s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
        <div style="background:${article.cover_image ? `url(${esc(article.cover_image)})` : 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(168,85,247,0.2))'};background-size:cover;background-position:center;height:160px"></div>
        <div style="padding:16px">
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(0,212,255,0.1);color:#00d4ff;font-size:11px;font-weight:600">${esc(article.category || 'article')}</span>
            ${article.worlds ? `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:11px">${esc(article.worlds.name)}</span>` : ''}
          </div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px;line-height:1.3">${esc(article.title)}</h3>
          <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0 0 12px;line-height:1.5">${esc(article.summary || article.content?.slice(0, 120) + '...' || '')}</p>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">
              ${article.profiles?.avatar_url
                ? `<img src="${esc(article.profiles.avatar_url)}" style="width:24px;height:24px;border-radius:50%">`
                : `<div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff">${esc((article.profiles?.username || 'A')[0].toUpperCase())}</div>`
              }
              <span style="font-size:12px;color:rgba(255,255,255,0.5)">@${esc(article.profiles?.username || 'author')}</span>
            </div>
            <span style="font-size:12px;color:rgba(255,255,255,0.4)">${article.views_count || 0} views</span>
          </div>
        </div>
      </div>
    `;
  },

  // Show knowledge page
  showKnowledge() {
    const feed = document.getElementById('feed');
    if (!feed) return;

    feed.innerHTML = `
      <div class="knowledge-header glass-card" style="padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <h2 style="font-size:24px;font-weight:900;margin:0 0 4px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Knowledge Hub</h2>
            <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0">Articles, tutorials, guides and research</p>
          </div>
          <button onclick="Knowledge.showCreateModal()" style="padding:12px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">+ Write</button>
        </div>
      </div>
      <div class="knowledge-tabs" style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
        <button onclick="Knowledge.filterCategory(null)" style="padding:10px 16px;border-radius:10px;border:1px solid rgba(0,212,255,0.3);background:rgba(0,212,255,0.1);color:#00d4ff;font-weight:600;cursor:pointer">All</button>
        ${this.categories.map(c => `<button onclick="Knowledge.filterCategory('${c}')" style="padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;font-weight:600;cursor:pointer">${c.charAt(0).toUpperCase() + c.slice(1)}s</button>`).join('')}
      </div>
      <div id="articlesList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
        <div style="grid-column:1/-1;text-align:center;padding:48px;color:#555">Loading...</div>
      </div>
    `;

    this.loadArticles().then(() => {
      const list = document.getElementById('articlesList');
      if (list) {
        if (!this.articles.length) {
          list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#555">No articles yet. Be the first to write something!</div>';
        } else {
          list.innerHTML = this.articles.map(a => this.renderArticleCard(a)).join('');
        }
      }
    });
  },

  // Filter by category
  filterCategory(category) {
    // Update tab styles
    document.querySelectorAll('.knowledge-tabs button').forEach((btn, i) => {
      if ((category === null && i === 0) || btn.textContent.toLowerCase().includes(category || 'all')) {
        btn.style.background = 'rgba(0,212,255,0.1)';
        btn.style.borderColor = 'rgba(0,212,255,0.3)';
        btn.style.color = '#00d4ff';
      } else {
        btn.style.background = 'transparent';
        btn.style.borderColor = 'rgba(255,255,255,0.1)';
        btn.style.color = '#888';
      }
    });

    const list = document.getElementById('articlesList');
    if (!list) return;

    list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#555">Loading...</div>';

    this.loadArticles(category).then(() => {
      if (!this.articles.length) {
        list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:#555">No articles in this category.</div>';
      } else {
        list.innerHTML = this.articles.map(a => this.renderArticleCard(a)).join('');
      }
    });
  },

  // Open article
  async openArticle(slug) {
    const article = await this.loadArticle(slug);
    if (!article) return;

    const feed = document.getElementById('feed');
    if (!feed) return;

    const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

    feed.innerHTML = `
      <button onclick="Knowledge.showKnowledge()" style="background:none;border:none;color:#888;font-size:14px;cursor:pointer;margin-bottom:16px">← Back to Knowledge</button>
      <article class="article-view glass-card" style="padding:24px;border-radius:16px">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:rgba(0,212,255,0.1);color:#00d4ff;font-size:11px;font-weight:600">${esc(article.category || 'article')}</span>
        </div>
        <h1 style="font-size:28px;font-weight:900;margin:0 0 16px;line-height:1.3">${esc(article.title)}</h1>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px">
            ${article.profiles?.avatar_url
              ? `<img src="${esc(article.profiles.avatar_url)}" style="width:40px;height:40px;border-radius:50%">`
              : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#a855f7);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff">${esc((article.profiles?.username || 'A')[0].toUpperCase())}</div>`
            }
            <div>
              <div style="font-weight:600">@${esc(article.profiles?.username || 'author')}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5)">${new Date(article.published_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div style="margin-left:auto;display:flex;gap:16px;font-size:12px;color:rgba(255,255,255,0.5)">
            <span>${article.views_count || 0} views</span>
            <span>${article.likes_count || 0} likes</span>
            <span>${article.saves_count || 0} saves</span>
          </div>
        </div>
        ${article.cover_image ? `<img src="${esc(article.cover_image)}" style="width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-bottom:24px">` : ''}
        <div class="article-content" style="font-size:16px;line-height:1.8;color:rgba(255,255,255,0.9);white-space:pre-wrap">${esc(article.content)}</div>
        ${article.tags?.length ? `
          <div style="margin-top:24px;display:flex;gap:8px;flex-wrap:wrap">
            ${article.tags.map(t => `<span style="padding:6px 12px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:12px">#${esc(t)}</span>`).join('')}
          </div>
        ` : ''}
      </article>
    `;
  },

  // Show create modal
  showCreateModal() {
    const modal = document.getElementById('postModal');
    const box = document.getElementById('postModalBox');
    if (!modal || !box) return;

    box.innerHTML = `
      <div class="modal-header">
        <span>Write Article</span>
        <button class="modal-close" onclick="closePostModal()">✕</button>
      </div>
      <div class="modal-body">
        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Title</label>
        <input id="articleTitle" placeholder="Article title" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Category</label>
        <select id="articleCategory" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">
          ${this.categories.map(c => `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}
        </select>

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Summary (optional)</label>
        <input id="articleSummary" placeholder="Brief description..." style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Content</label>
        <textarea id="articleContent" placeholder="Write your article here... (supports plain text)" style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px;resize:none;min-height:200px" rows="10"></textarea>

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Cover Image URL (optional)</label>
        <input id="articleCover" placeholder="https://..." style="width:100%;margin-bottom:12px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Tags (comma separated)</label>
        <input id="articleTags" placeholder="tech, tutorial, beginner" style="width:100%;margin-bottom:16px;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#fff;font-size:14px">

        <button onclick="Knowledge.createAndClose()" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:700;cursor:pointer">Publish Article</button>
      </div>
    `;

    modal.style.display = 'flex';
  },

  async createAndClose() {
    const title = document.getElementById('articleTitle')?.value.trim();
    const category = document.getElementById('articleCategory')?.value;
    const summary = document.getElementById('articleSummary')?.value.trim();
    const content = document.getElementById('articleContent')?.value.trim();
    const cover_image = document.getElementById('articleCover')?.value.trim();
    const tagsStr = document.getElementById('articleTags')?.value.trim();

    if (!title || !content) {
      alert('Please fill in the title and content');
      return;
    }

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    const result = await this.createArticle({
      title,
      category,
      summary,
      content,
      cover_image,
      tags
    });

    if (result.success) {
      closePostModal();
      this.showKnowledge();
    } else {
      alert(result.message);
    }
  }
};

window.Knowledge = Knowledge;
console.log('[KUDASAI] Knowledge module loaded');
