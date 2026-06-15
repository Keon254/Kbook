// ═══════════════════════════════════════════════════════════════════
// KUDASAI — Self-Healing Stability & Recovery System v2.0
// • Startup logging • Splash timeout • Offline mode
// • Auto-retry with exponential backoff
// • Error boundary • Health monitoring • Self-fix diagnostics
// ═══════════════════════════════════════════════════════════════════

window.KS = (() => {
  const t0 = Date.now();
  const _steps = {};
  const _errors = [];
  const _warnings = [];
  const _retryQueue = [];
  let _splashTimer = null;
  let _startupComplete = false;
  let _offlineMode = false;
  let _healthCheckInterval = null;
  let _consecutiveFailures = 0;
  const MAX_RETRIES = 3;
  const HEALTH_CHECK_INTERVAL = 30000; // 30s

  // ── Step logger with self-healing ────────────────────────────────────
  function step(name, status = 'ok', detail = '', retryFn = null) {
    const elapsed = Date.now() - t0;
    _steps[name] = { status, detail, elapsed, retries: 0 };

    const icons = { ok: '✓', warn: '⚠', fail: '✗', skip: '—' };
    const label = `[KUDASAI] ${icons[status] || '?'} ${name}${detail ? ' — ' + detail : ''} (${elapsed}ms)`;

    if (status === 'fail') {
      console.error(label);
      _errors.push({ name, detail, elapsed, retryFn });
      _consecutiveFailures++;

      // Auto-schedule retry if function provided
      if (retryFn && _steps[name].retries < MAX_RETRIES) {
        scheduleRetry(name, retryFn);
      }
    } else if (status === 'warn') {
      console.warn(label);
      _warnings.push({ name, detail, elapsed });
    } else {
      console.log(label);
      if (status === 'ok') _consecutiveFailures = Math.max(0, _consecutiveFailures - 1);
    }

    _updateDiagPanel();
    _checkCriticalFailures();
  }

  // ── Auto-retry with exponential backoff ──────────────────────────────
  function scheduleRetry(name, fn, attempt = 0) {
    if (attempt >= MAX_RETRIES) {
      step(name, 'fail', 'Max retries exceeded', null);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
    console.log(`[KUDASAI] 🔄 Scheduling retry for "${name}" in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);

    setTimeout(async () => {
      try {
        if (_steps[name]) _steps[name].retries = attempt + 1;
        await fn();
        step(name, 'ok', `Recovered after ${attempt + 1} retry(es)`);
      } catch (e) {
        scheduleRetry(name, fn, attempt + 1);
      }
    }, delay);
  }

  // ── Splash safety timeout (5 s max) ─────────────────────────────
  function armSplashTimeout() {
    clearSplashTimeout();
    _splashTimer = setTimeout(() => {
      const splash = document.getElementById('splashScreen');
      if (!splash || splash.style.display === 'none') return;
      console.warn('[KUDASAI] ⏱ Splash timeout (5s) — forcing exit');
      step('SplashTimeout', 'warn', 'Forced after 5 s — startup hung');
      _forceExitSplash();
    }, 5000);
  }

  function clearSplashTimeout() {
    if (_splashTimer) { clearTimeout(_splashTimer); _splashTimer = null; }
  }

  function _forceExitSplash() {
    // Fade out splash
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.style.transition = 'opacity 0.3s';
      splash.style.opacity = '0';
      setTimeout(() => { if (splash) splash.style.display = 'none'; }, 300);
    }
    // Fall back to landing if no session was bootstrapped
    if (!_startupComplete) {
      const landing = document.getElementById('landingPage');
      const app     = document.getElementById('app');
      const auth    = document.getElementById('authScreen');
      if (landing) { landing.style.display = ''; }
      if (app)     { app.style.display     = 'none'; }
      if (auth)    { auth.style.display    = 'none'; }
      // Show diagnostic panel if there are failures
      if (_errors.length > 0) setTimeout(showDiagPanel, 700);
    }
  }

  // ── Offline detection ────────────────────────────────────────────
  function initOfflineDetection() {
    function onOffline() {
      if (_offlineMode) return;
      _offlineMode = true;
      const b = document.getElementById('offlineBanner');
      if (b) { b.style.display = 'flex'; b.style.opacity = '0'; requestAnimationFrame(() => { b.style.transition = 'opacity .3s'; b.style.opacity = '1'; }); }
      step('Network', 'warn', 'Connection lost — offline mode');
    }
    function onOnline() {
      if (!_offlineMode) return;
      _offlineMode = false;
      const b = document.getElementById('offlineBanner');
      if (b) { b.style.transition = 'opacity .4s'; b.style.opacity = '0'; setTimeout(() => { b.style.display = 'none'; b.style.opacity = '1'; }, 400); }
      step('Network', 'ok', 'Connection restored');
      // Auto-dismiss network step after 3s so score updates
      setTimeout(_updateDiagPanel, 3100);
    }
    window.addEventListener('offline', onOffline);
    window.addEventListener('online',  onOnline);
    if (!navigator.onLine) onOffline();
  }

  // ── Diagnostic panel ─────────────────────────────────────────────
  function showDiagPanel() {
    const panel = document.getElementById('diagPanel');
    if (panel) { panel.style.display = 'flex'; _renderDiag(); }
  }

  function hideDiagPanel() {
    const panel = document.getElementById('diagPanel');
    if (panel) panel.style.display = 'none';
  }

  function _renderDiag() {
    const body = document.getElementById('diagBody');
    if (!body) return;
    const rows = Object.entries(_steps).map(([name, s]) => {
      const color = s.status === 'ok' ? '#00e676' : s.status === 'warn' ? '#ffab40' : '#ef5350';
      const icon  = s.status === 'ok' ? '✓' : s.status === 'warn' ? '⚠' : '✗';
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px">
        <span style="color:${color};font-size:14px;width:16px;flex-shrink:0">${icon}</span>
        <span style="flex:1;color:#ccc;font-weight:500">${name}</span>
        <span style="color:#555;font-size:11px;flex-shrink:0">${s.elapsed}ms</span>
        ${s.detail ? `<span style="color:#666;font-size:11px;flex-shrink:0;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${s.detail}">${s.detail}</span>` : ''}
      </div>`;
    });
    body.innerHTML = rows.length
      ? rows.join('')
      : '<div style="color:#555;padding:16px 0;text-align:center;font-size:13px">No startup steps recorded yet.</div>';
    _renderScore();
  }

  function _updateDiagPanel() {
    const panel = document.getElementById('diagPanel');
    if (panel && panel.style.display !== 'none') _renderDiag();
  }

  // ── Production Stability Score ───────────────────────────────────
  function _renderScore() {
    const scoreEl = document.getElementById('diagScore');
    if (!scoreEl) return;

    const checks = {
      'Startup Health':  _steps['DOMReady']?.status       === 'ok',
      'Config Health':   _steps['ConfigLoad']?.status     === 'ok',
      'Supabase Health': _steps['SupabaseInit']?.status   === 'ok',
      'Auth Health':     _steps['SessionCheck']?.status   !== 'fail',
      'Feed Health':     _steps['FeedLoad']?.status       === 'ok',
      'Network Health':  !_offlineMode,
      'DOM Health':      _steps['DOMValidation']?.status  === 'ok',
    };
    const passed = Object.values(checks).filter(Boolean).length;
    const total  = Object.keys(checks).length;
    const pct    = Math.round(passed / total * 100);
    const col    = pct >= 85 ? '#00e676' : pct >= 55 ? '#ffab40' : '#ef5350';
    const grade  = pct >= 85 ? 'Excellent' : pct >= 70 ? 'Good' : pct >= 50 ? 'Fair' : 'Critical';

    scoreEl.innerHTML = `
      <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#555;margin-bottom:10px">Production Stability Score</div>
      <div style="font-size:52px;font-weight:900;color:${col};line-height:1;margin-bottom:4px">${pct}<span style="font-size:22px">%</span></div>
      <div style="font-size:13px;color:${col};font-weight:700;margin-bottom:4px">${grade}</div>
      <div style="font-size:11px;color:#555;margin-bottom:16px">${passed} of ${total} systems healthy</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${Object.entries(checks).map(([label, ok]) => `
          <div style="display:flex;align-items:center;gap:8px;font-size:12px">
            <span style="color:${ok ? '#00e676' : '#ef5350'};flex-shrink:0">${ok ? '●' : '●'}</span>
            <span style="color:${ok ? '#aaa' : '#f88'}">${label}</span>
            <span style="margin-left:auto;color:${ok ? '#555' : '#f55'};font-size:11px;font-weight:600">${ok ? 'OK' : 'FAIL'}</span>
          </div>`).join('')}
      </div>`;
  }

  // ── Mark startup complete ────────────────────────────────────────
  function markComplete() {
    _startupComplete = true;
    clearSplashTimeout();
    step('StartupComplete', 'ok', `Total ${Date.now() - t0}ms`);
  }

  // ── Validate DOM ─────────────────────────────────────────────────
  function validateDOM() {
    const critical = ['splashScreen', 'landingPage', 'authScreen', 'app', 'feed', 'postInput'];
    const missing  = critical.filter(id => !document.getElementById(id));
    if (missing.length) step('DOMValidation', 'fail', 'Missing IDs: ' + missing.join(', '));
    else step('DOMValidation', 'ok', `${critical.length} critical elements present`);
  }

  // ── Check config.js ──────────────────────────────────────────────
  function checkConfig() {
    const hasUrl = !!window.SUPABASE_URL?.trim();
    const hasKey = !!window.SUPABASE_ANON_KEY?.trim();
    if (hasUrl && hasKey) step('ConfigLoad', 'ok', 'URL + ANON_KEY present');
    else step('ConfigLoad', 'warn', `URL:${hasUrl ? '✓' : '✗'} KEY:${hasKey ? '✓' : '✗'} — check config.js`);
  }

  // ── Deployment validation ────────────────────────────────────────
  async function validateDeployment() {
    const files = ['css/style.css', 'script.js', 'config.js'];
    const results = await Promise.allSettled(
      files.map(f => fetch(f, { method: 'HEAD' }).then(r => ({ f, ok: r.ok, status: r.status })))
    );
    const failed = results
      .filter(r => r.status === 'fulfilled' && !r.value.ok)
      .map(r => r.value.f);
    if (failed.length) step('DeploymentValidation', 'fail', '404: ' + failed.join(', '));
    else step('DeploymentValidation', 'ok', `${files.length} critical files reachable`);
  }

  // ── Check critical failures & auto-trigger recovery ──────────────
  function _checkCriticalFailures() {
    // If too many consecutive failures, show diagnostics
    if (_consecutiveFailures >= 3 && !_startupComplete) {
      console.error('[KUDASAI] 🚨 Critical failure threshold reached');
      showDiagPanel();
    }

    // If network is offline and we're waiting on something, suggest offline mode
    if (_offlineMode && Object.values(_steps).some(s => s.status === 'fail' && s.detail?.includes('network'))) {
      const banner = document.getElementById('offlineBanner');
      if (banner) banner.style.display = 'flex';
    }
  }

  // ── Periodic health monitoring ───────────────────────────────────
  function startHealthMonitor() {
    if (_healthCheckInterval) clearInterval(_healthCheckInterval);

    _healthCheckInterval = setInterval(async () => {
      if (_offlineMode || !_startupComplete) return;

      // Check Supabase connection
      try {
        const { error } = await window.db?.from('profiles').select('user_id').limit(1) || { error: 'No DB' };
        if (error && !_offlineMode) {
          step('HealthCheck', 'warn', 'DB unreachable — may need reconnect');
        }
      } catch (e) {
        step('HealthCheck', 'warn', 'Health ping failed: ' + e.message?.slice(0, 50));
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  // ── Attempt automatic recovery ───────────────────────────────────
  async function tryRecover(component) {
    console.log(`[KUDASAI] 🔧 Attempting recovery for: ${component}`);

    switch (component) {
      case 'feed':
        try {
          if (typeof window.loadFeed === 'function') {
            await window.loadFeed();
            step('FeedRecovery', 'ok', 'Feed recovered');
          }
        } catch (e) {
          step('FeedRecovery', 'fail', e.message);
        }
        break;

      case 'auth':
        try {
          const { data } = await window.db?.auth.getSession() || { data: { session: null } };
          if (data?.session) {
            step('AuthRecovery', 'ok', 'Session restored');
            return data.session;
          }
        } catch (e) {
          step('AuthRecovery', 'fail', e.message);
        }
        break;

      case 'realtime':
        try {
          if (typeof window.startRealtime === 'function') {
            window.startRealtime();
            step('RealtimeRecovery', 'ok', 'Realtime reconnected');
          }
        } catch (e) {
          step('RealtimeRecovery', 'fail', e.message);
        }
        break;
    }
  }

  // ── Error boundary for unhandled errors ──────────────────────────
  function installErrorBoundary() {
    window.addEventListener('error', (event) => {
      const msg = event.message || 'Unknown error';
      console.error('[KUDASAI] Uncaught error:', msg);

      // Don't show diag for minor/script errors
      if (msg.includes('Script error') || msg.includes('Extension')) return;

      _errors.push({ name: 'UncaughtError', detail: msg.slice(0, 100), elapsed: Date.now() - t0 });
      _updateDiagPanel();
    });

    window.addEventListener('unhandledrejection', (event) => {
      const msg = event.reason?.message || String(event.reason);
      console.error('[KUDASAI] Unhandled promise rejection:', msg);

      _errors.push({ name: 'UnhandledRejection', detail: msg.slice(0, 100), elapsed: Date.now() - t0 });
      _updateDiagPanel();

      // If auth-related, try recovery
      if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('session')) {
        tryRecover('auth');
      }
    });
  }

  // ── Retry / offline mode ─────────────────────────────────────────
  function retry() {
    hideDiagPanel();
    window.location.reload();
  }

  function enterOfflineMode() {
    hideDiagPanel();
    _offlineMode = true;
    const b = document.getElementById('offlineBanner');
    if (b) b.style.display = 'flex';
    // Show landing so the user at least sees the app shell
    const landing = document.getElementById('landingPage');
    const app     = document.getElementById('app');
    if (landing) landing.style.display = '';
    if (app)     app.style.display     = 'none';
    const splash = document.getElementById('splashScreen');
    if (splash)  splash.style.display  = 'none';
  }

  // ── Install error boundary immediately ──────────────────────────
  installErrorBoundary();

  // ── Reveal emergency recovery buttons after 4 s ─────────────────
  setTimeout(() => {
    const splash    = document.getElementById('splashScreen');
    const recovery  = document.getElementById('splashRecovery');
    if (splash && splash.style.display !== 'none' && splash.style.opacity !== '0' && recovery) {
      recovery.style.display = 'flex';
      requestAnimationFrame(() => { recovery.style.opacity = '1'; });
    }
  }, 4000);

  // ── Public API ───────────────────────────────────────────────────
  return {
    step,
    scheduleRetry,
    armSplashTimeout,
    clearSplashTimeout,
    markComplete,
    initOfflineDetection,
    showDiagPanel,
    hideDiagPanel,
    validateDOM,
    checkConfig,
    validateDeployment,
    startHealthMonitor,
    tryRecover,
    retry,
    enterOfflineMode,
    getErrors: () => [..._errors],
    getWarnings: () => [..._warnings],
    isOffline: () => _offlineMode,
    isComplete: () => _startupComplete,
  };
})();
