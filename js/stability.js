// KUDASAI startup diagnostics and connectivity recovery.
// A single Supabase/API failure must not replace the application with an
// offline page. Connectivity hints are advisory; the UI remains available.
window.KS = (() => {
  const startedAt = Date.now();
  const steps = {};
  const errors = [];
  const warnings = [];
  let offline = false;
  let complete = false;
  let splashTimer = null;
  let healthTimer = null;
  let checking = false;
  const $ = id => document.getElementById(id);

  function step(name, status = 'ok', detail = '') {
    const entry = { status, detail: String(detail || ''), elapsed: Date.now() - startedAt, retries: 0 };
    steps[name] = entry;
    const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : status === 'fail' ? '✗' : '—';
    const message = `[KUDASAI] ${icon} ${name}${entry.detail ? ` — ${entry.detail}` : ''} (${entry.elapsed}ms)`;
    if (status === 'fail') { console.error(message); errors.push({ name, detail: entry.detail, elapsed: entry.elapsed }); }
    else if (status === 'warn') { console.warn(message); warnings.push({ name, detail: entry.detail, elapsed: entry.elapsed }); }
    else console.info(message);
    renderDiagnostics();
  }

  function setBanner(show, text) {
    const banner = $('offlineBanner');
    if (!banner) return;
    const label = banner.querySelector('span:nth-child(2)');
    if (label && text) label.textContent = text;
    banner.style.display = show ? 'flex' : 'none';
  }

  function showLandingIfNeeded() {
    const landing = $('landingPage');
    const app = $('app');
    const auth = $('authScreen');
    if (app && getComputedStyle(app).display !== 'none') return;
    if (auth && getComputedStyle(auth).display !== 'none') return;
    if (landing) landing.style.display = '';
  }

  // Reachability means an HTTP response from the current origin OR Supabase.
  // Auth/API HTTP error codes still prove the host is reachable. This avoids
  // mistaking auth/RLS/schema errors for a device-wide network outage.
  async function probeConnectivity(timeoutMs = 4500) {
    const targets = [window.location.origin];
    if (window.SUPABASE_URL) targets.push(String(window.SUPABASE_URL).replace(/\/$/, ''));
    const results = await Promise.allSettled(targets.map(async target => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(target, {
          method: 'HEAD', mode: 'no-cors', cache: 'no-store',
          signal: controller.signal, credentials: 'omit'
        });
        return { target, reachable: !!response };
      } finally { clearTimeout(timer); }
    }));
    return results.some(result => result.status === 'fulfilled' && result.value.reachable);
  }

  async function verifyConnectivity() {
    if (checking) return false;
    checking = true;
    try {
      // A browser online event plus any successful host probe is enough.
      // navigator.onLine alone never switches KUDASAI into offline state.
      const reachable = await probeConnectivity();
      offline = !reachable;
      if (reachable) {
        setBanner(false);
        step('Network', 'ok', 'Website or Supabase host reachable');
      } else {
        setBanner(true, 'Network check failed — KUDASAI is still available; online features will retry.');
        step('Network', 'warn', 'Connectivity probes failed; app shell remains available');
      }
      return reachable;
    } catch (error) {
      offline = true;
      setBanner(true, 'Network check failed — KUDASAI is still available; online features will retry.');
      step('Network', 'warn', error?.message || 'Connectivity probe failed');
      return false;
    } finally { checking = false; }
  }

  function clearSplashTimeout() { if (splashTimer) clearTimeout(splashTimer); splashTimer = null; }
  function hideSplash() {
    const splash = $('splashScreen');
    if (!splash) return;
    splash.style.transition = 'opacity .25s';
    splash.style.opacity = '0';
    setTimeout(() => { splash.style.display = 'none'; }, 260);
  }
  function forceExitSplash() {
    hideSplash();
    if (!complete) showLandingIfNeeded();
  }
  function armSplashTimeout() {
    clearSplashTimeout();
    splashTimer = setTimeout(() => {
      step('SplashTimeout', 'warn', 'Startup took longer than expected; showing the app entry screen');
      forceExitSplash();
    }, 5000);
  }
  function markComplete() { complete = true; clearSplashTimeout(); step('StartupComplete', 'ok', `Total ${Date.now() - startedAt}ms`); }
  function validateDOM() {
    const required = ['splashScreen', 'landingPage', 'authScreen', 'app', 'feed', 'postInput'];
    const missing = required.filter(id => !$(id));
    step('DOMValidation', missing.length ? 'warn' : 'ok', missing.length ? `Missing: ${missing.join(', ')}` : `${required.length} core elements present`);
  }
  function checkConfig() {
    const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(window.SUPABASE_URL || '');
    const hasKey = !!String(window.SUPABASE_ANON_KEY || '').trim();
    step('ConfigLoad', validUrl && hasKey ? 'ok' : 'warn', validUrl && hasKey ? 'Supabase URL and publishable key present' : 'Supabase unavailable; public app shell remains usable');
  }
  async function validateDeployment() {
    const checks = ['css/style.css', 'script.js', 'config.js'];
    const results = await Promise.allSettled(checks.map(async file => {
      const response = await fetch(new URL(file, document.baseURI), { method: 'HEAD', cache: 'no-store' });
      return { file, ok: response.ok };
    }));
    const failed = results.filter(result => result.status === 'fulfilled' && !result.value.ok).map(result => result.value.file);
    const rejected = results.filter(result => result.status === 'rejected');
    if (failed.length) step('DeploymentValidation', 'warn', `Unavailable assets: ${failed.join(', ')}`);
    else if (rejected.length) step('DeploymentValidation', 'warn', 'Asset reachability could not be verified; continuing startup');
    else step('DeploymentValidation', 'ok', `${checks.length} core assets reachable`);
  }
  function initOfflineDetection() {
    // Do not act on navigator.onLine alone: mobile browsers, captive portals,
    // VPNs, and sleep/wake can produce misleading online/offline events.
    window.addEventListener('offline', () => { void verifyConnectivity(); });
    window.addEventListener('online', () => { void verifyConnectivity(); });
    void verifyConnectivity();
  }
  async function retry() {
    const button = document.querySelector('#diagPanel button[onclick*="retry"]');
    if (button) { button.disabled = true; button.textContent = 'Checking connection…'; }
    step('Retry', 'warn', 'Checking website and Supabase reachability');
    const reachable = await verifyConnectivity();
    if (reachable) {
      hideDiagPanel();
      // A reload reruns Supabase client/session initialization from clean state.
      window.location.reload();
      return;
    }
    setBanner(true, 'Still cannot reach the network. The public KUDASAI entry page remains available.');
    showLandingIfNeeded();
    step('Retry', 'warn', 'No host responded; app entry remains available');
    if (button) { button.disabled = false; button.textContent = '↺ Retry Connection'; }
  }
  function enterOfflineMode() {
    // Degraded connectivity is a banner state, never a separate page that hides
    // the existing application or landing/auth UI.
    offline = true;
    setBanner(true, 'Limited connectivity — KUDASAI remains open; online features may retry.');
    showLandingIfNeeded();
    hideSplash();
    step('OfflineMode', 'warn', 'Degraded-network banner enabled without hiding the application');
  }
  function showDiagPanel() { const panel = $('diagPanel'); if (panel) { panel.style.display = 'flex'; renderDiagnostics(); } }
  function hideDiagPanel() { const panel = $('diagPanel'); if (panel) panel.style.display = 'none'; }
  function renderDiagnostics() {
    const body = $('diagBody');
    if (body) body.innerHTML = Object.entries(steps).map(([name, value]) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px"><b style="color:${value.status === 'ok' ? '#00e676' : value.status === 'warn' ? '#ffab40' : '#ef5350'}">${value.status === 'ok' ? '✓' : value.status === 'warn' ? '⚠' : '✗'}</b><span style="color:#ccc;flex:1">${name}</span><span style="color:#777">${value.detail}</span></div>`).join('');
    const score = $('diagScore');
    if (score) {
      const checks = [steps.DOMReady?.status === 'ok', steps.ConfigLoad?.status === 'ok', steps.SupabaseInit?.status === 'ok', steps.SessionCheck?.status !== 'fail', steps.FeedLoad?.status === 'ok', !offline, steps.DOMValidation?.status !== 'fail'];
      const passed = checks.filter(Boolean).length;
      score.innerHTML = `<div style="color:#888;font-size:12px">Startup status</div><strong style="font-size:42px;color:${passed >= 5 ? '#00e676' : '#ffab40'}">${Math.round(passed / checks.length * 100)}%</strong><div style="color:#888">${passed} checks healthy</div>`;
    }
  }
  function startHealthMonitor() {
    if (healthTimer) clearInterval(healthTimer);
    healthTimer = setInterval(async () => {
      if (!window.db || !window.SUPABASE_URL) return;
      try {
        const result = await Promise.race([
          window.db.from('profiles').select('user_id').limit(1),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        if (result.error) step('SupabaseHealth', 'warn', result.error.message);
        else if (offline) void verifyConnectivity();
      } catch (error) { step('SupabaseHealth', 'warn', error?.message || 'Health check failed'); }
    }, 30000);
  }
  async function tryRecover(component) {
    if (component === 'auth') return window.db?.auth.getSession();
    if (component === 'feed' && typeof window.loadFeed === 'function') return window.loadFeed();
    if (component === 'realtime' && typeof window.startRealtime === 'function') return window.startRealtime();
  }

  window.addEventListener('unhandledrejection', event => {
    const detail = event.reason?.message || String(event.reason || 'Unknown rejection');
    console.error('[KUDASAI] Unhandled promise rejection:', detail);
    errors.push({ name: 'UnhandledRejection', detail, elapsed: Date.now() - startedAt });
    renderDiagnostics();
    // An API rejection is not evidence that the whole device is offline.
  });

  return {
    step, armSplashTimeout, clearSplashTimeout, markComplete, initOfflineDetection,
    showDiagPanel, hideDiagPanel, validateDOM, checkConfig, validateDeployment,
    startHealthMonitor, tryRecover, retry, enterOfflineMode, probeConnectivity,
    getErrors: () => [...errors], getWarnings: () => [...warnings],
    isOffline: () => offline, isComplete: () => complete
  };
})();
