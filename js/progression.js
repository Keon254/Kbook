// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Quests & Progression System
// Replace Likes with Progression — XP, Levels, Achievements
// ═════════════════════════════════════════════════════════════════════

const Progression = {
  achievements: [],
  userAchievements: [],
  quests: [],
  userQuests: [],

  // Check and award achievement
  async checkAchievement(achievementName) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return null;

    try {
      // Get achievement
      const { data: achievement } = await db
        .from('achievements')
        .select('*')
        .eq('name', achievementName)
        .single();

      if (!achievement) return null;

      // Check if already earned
      const { data: existing } = await db
        .from('user_achievements')
        .select('id')
        .eq('user_id', user.id)
        .eq('achievement_id', achievement.id)
        .maybeSingle();

      if (existing) return { earned: true, achievement };

      // Award achievement
      await db.from('user_achievements').insert([{
        user_id: user.id,
        achievement_id: achievement.id
      }]);

      // Award XP
      await this.awardXP(achievement.xp_reward);

      // Create notification
      await db.from('notifications').insert([{
        user_id: user.id,
        type: 'achievement',
        title: 'Achievement Unlocked!',
        content: `You earned "${achievement.title}" +${achievement.xp_reward} XP`,
        reference_id: achievement.id,
        reference_type: 'achievement'
      }]);

      return { earned: true, achievement, justEarned: true };
    } catch (e) {
      console.error('[Progression]', e);
      return null;
    }
  },

  // Award XP
  async awardXP(amount) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user || amount <= 0) return;

    try {
      // Get current profile
      const { data: profile } = await db
        .from('profiles')
        .select('xp, level')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const newXP = (profile.xp || 0) + amount;
      const newLevel = Math.floor(newXP / 1000) + 1;

      // Update profile
      await db.from('profiles')
        .update({ xp: newXP, level: newLevel })
        .eq('user_id', user.id);

      // Show XP gain animation
      this.showXPGain(amount, newLevel !== profile.level);

      return { xp: newXP, level: newLevel, levelUp: newLevel !== profile.level };
    } catch (e) {
      console.error('[Progression]', e);
    }
  },

  // Show XP gain animation
  showXPGain(amount, isLevelUp) {
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:24px">${isLevelUp ? '🎉' : '✨'}</span>
        <div>
          <div style="font-weight:700;color:${isLevelUp ? '#ffd700' : '#00d4ff'}">+${amount} XP</div>
          ${isLevelUp ? '<div style="font-size:11px;color:#ffd700">LEVEL UP!</div>' : ''}
        </div>
      </div>
    `;
    toast.style.cssText = 'position:fixed;bottom:100px;right:20px;padding:12px 20px;border-radius:12px;background:rgba(0,0,0,0.9);border:1px solid rgba(0,212,255,0.3);z-index:9999;animation:slideUp 0.3s ease';

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  // Load user quests
  async loadUserQuests() {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return [];

    try {
      const now = new Date().toISOString();

      // Get active quests
      const { data: quests } = await db
        .from('quests')
        .select('*')
        .eq('is_active', true)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order('created_at', { ascending: false });

      // Get user's quest progress
      const { data: userQuests } = await db
        .from('user_quests')
        .select('*')
        .eq('user_id', user.id);

      this.quests = quests || [];
      this.userQuests = userQuests || [];

      return this.quests;
    } catch (e) {
      console.error('[Progression]', e);
      return [];
    }
  },

  // Start tracking a quest
  async startQuest(questId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return null;

    try {
      const { data, error } = await db
        .from('user_quests')
        .insert([{
          user_id: user.id,
          quest_id: questId,
          progress: 0
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('[Progression]', e);
      return null;
    }
  },

  // Update quest progress
  async updateProgress(questId, amount = 1) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    try {
      const quest = this.quests.find(q => q.id === questId);
      const userQuest = this.userQuests.find(uq => uq.quest_id === questId);

      if (!quest) return;

      // Start quest if not started
      if (!userQuest) {
        await this.startQuest(questId);
      }

      // Update progress
      const newProgress = (userQuest?.progress || 0) + amount;
      const target = quest.requirement?.count || 1;
      const completed = newProgress >= target;

      await db.from('user_quests')
        .upsert({
          user_id: user.id,
          quest_id: questId,
          progress: Math.min(newProgress, target),
          completed,
          completed_at: completed ? new Date().toISOString() : null
        });

      if (completed && !userQuest?.claimed) {
        // Show quest completed
        this.showQuestComplete(quest);
      }
    } catch (e) {
      console.error('[Progression]', e);
    }
  },

  // Claim quest rewards
  async claimReward(questId) {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return;

    try {
      const userQuest = this.userQuests.find(uq => uq.quest_id === questId);
      const quest = this.quests.find(q => q.id === questId);

      if (!userQuest?.completed || userQuest?.claimed || !quest) return;

      // Mark as claimed
      await db.from('user_quests')
        .update({ claimed: true })
        .eq('id', userQuest.id);

      // Award XP
      await this.awardXP(quest.xp_reward);

      return { success: true, xp: quest.xp_reward };
    } catch (e) {
      console.error('[Progression]', e);
      return { success: false };
    }
  },

  // Show quest completed notification
  showQuestComplete(quest) {
    const toast = document.createElement('div');
    toast.className = 'quest-toast';
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:28px">${quest.icon || '📋'}</span>
        <div>
          <div style="font-weight:700;color:#00d4ff">Quest Complete!</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.7)">${quest.title} +${quest.xp_reward} XP</div>
        </div>
        <button onclick="Progression.claimReward('${quest.id}')" style="margin-left:auto;padding:6px 12px;border-radius:6px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:600;cursor:pointer">Claim</button>
      </div>
    `;
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:16px 24px;border-radius:16px;background:rgba(10,10,20,0.95);border:1px solid rgba(0,212,255,0.4);z-index:9999;animation:slideUp 0.3s ease;min-width:300px';

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  },

  // Load achievements
  async loadAchievements() {
    const db = window.db;

    try {
      const { data: achievements } = await db
        .from('achievements')
        .select('*')
        .order('xp_reward', { ascending: false });

      this.achievements = achievements || [];
      return this.achievements;
    } catch (e) {
      console.error('[Progression]', e);
      return [];
    }
  },

  // Load user achievements
  async loadUserAchievements() {
    const db = window.db;
    const user = window.KS?.state?.user || window.state?.user;
    if (!user) return [];

    try {
      const { data } = await db
        .from('user_achievements')
        .select('*, achievements(*)')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false });

      this.userAchievements = data || [];
      return this.userAchievements;
    } catch (e) {
      console.error('[Progression]', e);
      return [];
    }
  },

  // Render quests panel
  renderQuestsPanel(containerId = 'feed') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="quests-header glass-card" style="padding:24px;margin-bottom:20px">
        <h2 style="font-size:24px;font-weight:900;margin:0 0 4px;background:linear-gradient(135deg,#00d4ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Quests & Progression</h2>
        <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0">Complete quests to earn XP and level up</p>
      </div>
      <div class="quests-tabs" style="display:flex;gap:12px;margin-bottom:20px">
        <button class="quest-tab active" onclick="Progression.showDailyQuests()" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(0,212,255,0.3);background:rgba(0,212,255,0.1);color:#00d4ff;font-weight:600;cursor:pointer">Daily</button>
        <button class="quest-tab" onclick="Progression.showWeeklyQuests()" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;font-weight:600;cursor:pointer">Weekly</button>
        <button class="quest-tab" onclick="Progression.showAchievements()" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#888;font-weight:600;cursor:pointer">Achievements</button>
      </div>
      <div id="questsList"></div>
    `;

    this.showDailyQuests();
  },

  showDailyQuests() {
    this._updateTabs(0);
    this._renderQuestList('daily');
  },

  showWeeklyQuests() {
    this._updateTabs(1);
    this._renderQuestList('weekly');
  },

  showAchievements() {
    this._updateTabs(2);
    this._renderAchievementsList();
  },

  _updateTabs(activeIndex) {
    const tabs = document.querySelectorAll('.quest-tab');
    tabs.forEach((tab, i) => {
      if (i === activeIndex) {
        tab.style.background = 'rgba(0,212,255,0.1)';
        tab.style.borderColor = 'rgba(0,212,255,0.3)';
        tab.style.color = '#00d4ff';
      } else {
        tab.style.background = 'transparent';
        tab.style.borderColor = 'rgba(255,255,255,0.1)';
        tab.style.color = '#888';
      }
    });
  },

  _renderQuestList(type) {
    const list = document.getElementById('questsList');
    if (!list) return;

    const quests = this.quests.filter(q => q.quest_type === type);
    const now = new Date();

    if (!quests.length) {
      list.innerHTML = `<div style="text-align:center;padding:48px;color:#555">No ${type} quests available</div>`;
      return;
    }

    list.innerHTML = quests.map(quest => {
      const userQuest = this.userQuests.find(uq => uq.quest_id === quest.id);
      const progress = userQuest?.progress || 0;
      const target = quest.requirement?.count || 1;
      const pct = Math.min(100, (progress / target) * 100);
      const completed = userQuest?.completed;
      const claimed = userQuest?.claimed;

      return `
        <div class="quest-card glass-card" style="padding:16px;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:32px">${quest.icon || '📋'}</div>
            <div style="flex:1">
              <div style="font-weight:700;margin-bottom:4px">${quest.title}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:8px">${quest.description || ''}</div>
              <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${completed ? 'linear-gradient(90deg,#00ff88,#00d4ff)' : 'linear-gradient(90deg,#00d4ff,#a855f7)'};transition:width 0.3s"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:rgba(255,255,255,0.4)">
                <span>${progress}/${target}</span>
                <span>+${quest.xp_reward} XP</span>
              </div>
            </div>
            ${completed && !claimed ? `<button onclick="Progression.claimReward('${quest.id}')" style="padding:8px 16px;border-radius:8px;border:none;background:linear-gradient(135deg,#00d4ff,#a855f7);color:#fff;font-weight:600;cursor:pointer">Claim</button>` : ''}
            ${claimed ? '<span style="color:#00ff88;font-weight:600">✓</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  _renderAchievementsList() {
    const list = document.getElementById('questsList');
    if (!list) return;

    this.loadUserAchievements().then(() => {
      const earnedIds = new Set(this.userAchievements.map(ua => ua.achievement_id));

      list.innerHTML = this.achievements.map(ach => {
        const earned = earnedIds.has(ach.id);
        return `
          <div class="achievement-card ${earned ? 'earned' : ''}" style="padding:16px;margin-bottom:12px;background:${earned ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.02)'};border:1px solid ${earned ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'};border-radius:12px;${!earned ? 'opacity:0.5' : ''}">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="font-size:32px;filter:${earned ? 'none' : 'grayscale(1)'}">${ach.icon || '🏆'}</div>
              <div style="flex:1">
                <div style="font-weight:700;color:${earned ? 'var(--accent)' : 'inherit'}">${ach.title}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">${ach.description || ''}</div>
                <div style="display:flex;gap:12px;margin-top:8px;font-size:11px">
                  <span style="color:${ach.rarity === 'legendary' ? '#ffd700' : ach.rarity === 'epic' ? '#a855f7' : ach.rarity === 'rare' ? '#00d4ff' : '#888'}">${ach.rarity}</span>
                  <span style="color:rgba(255,255,255,0.4)">+${ach.xp_reward} XP</span>
                </div>
              </div>
              ${earned ? '<span style="color:#00ff88;font-size:24px">✓</span>' : ''}
            </div>
          </div>
        `;
      }).join('');
    });
  }
};

window.Progression = Progression;
console.log('[KUDASAI] Progression module loaded');
