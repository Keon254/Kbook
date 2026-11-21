// KUDASAI startup diagnostics and direct-entry recovery.
// This module loads in <head> before script.js, so its DOM-ready listener can
// replace the old welcome-only fallback before the application boots.
window.KS = (() => {
  const startedAt = Date.now();
  const steps = {};
  const errors = [];
  const warnings = [];
  let offline = false;
  let complete = false;
  let healthTimer = null;
  let checking = false;
  const $ = id => document.getElementById(id);

  // Keep the original nodes for compatibility, but remove their blocking
  // presentation entirely. This preserves the app's visual system and pages.
  const directEntryStyle = document.createElement('style');
  directEntryStyle.textContent = '#splashScreen,#landingPage{display:none!important}';
  (document.head || document.documentElement).appendChild(directEntryStyle);

  function openPublicApp() {
    const splash = $('splashScreen');
    const landing = $('landingPage');
    const auth = $('authScreen');
    const app = $('app');
    if (splash) splash.style.display = 'none';
    if (landing) landing.style.display = 'none';
    if (auth) auth.style.display = 'none';
    if (app) app.style.display = 'grid';
    const tabs = $('feedTabs');
    const composer = $('composer');
    if (tabs) tabs.style.display = '';
    if (composer) composer.style.display = 'none';
  }

  function openAuth() {
    const app = $('app');
    const auth = $('authScreen');
    const splash = $('splashScreen');
    const landing = $('landingPage');
    if (app) app.style.display = 'none';
    if (splash) splash.style.display = 'none';
    if (landing) landing.style.display = 'none';
    if (auth) {
      auth.style.display = 'flex';
      auth.style.flexDirection = 'column';
      auth.style.alignItems = 'center';
      auth.style.justifyContent = 'center';
    }
  }

  function installAuthEntryControls() {
    const topbar = document.querySelector('.topbar');
    if (topbar && !$('directEntryAuthButton')) {
      const button = document.createElement('button');
      button.id = 'directEntryAuthButton';
      button.type = 'button';
      button.textContent = 'Sign in';
      button.setAttribute('aria-label', 'Sign in or create a KUDASAI account');
      button.style.cssText = 'flex-shrink:0;padding:9px 16px;border:1px solid rgba(0,212,255,.35);border-radius:18px;background:rgba(0,212,255,.1);color:var(--accent);font:600 13px Inter,sans-serif;cursor:pointer';
      button.addEventListener('click', openAuth);
      topbar.appendChild(button);
    }
    const authBox = document.querySelector('#authScreen .auth-box');
    if (authBox && !$('directEntryBackButton')) {
      const button = document.createElement('button');
      button.id = 'directEntryBackButton';
      button.type = 'button';
      button.textContent = '← Browse KUDASAI';
      button.style.cssText = 'width:100%;margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:transparent;color:#aaa;font:600 14px Inter,sans-serif;cursor:pointer';
      button.addEventListener('click', openPublicApp);
      authBox.appendChild(button);
    }
  }

  // script.js registers a later DOMContentLoaded listener. Override its old
  // showLanding() fallback: public visitors see the actual live app/feed; auth
  // remains reachable through the added Sign in button. Existing session
  // restoration still calls bootstrap() and preserves all authenticated flows.
  window.addEventListener('DOMContentLoaded', () => {
    window.showLanding = openPublicApp;
    window.enterApp = openAuth;
    openPublicApp();
    installAuthEntryControls();
    step('DirectEntry', 'ok', 'Welcome and splash screens bypassed');
    setTimeout(() => {
      installAuthEntryControls();
      try {
        if (typeof window.loadFeed === 'function') void window.loadFeed();
      } catch (error) {
        step('PublicFeed', 'warn', error?.message || 'Public feed will retry when opened');
      }
    }, 0);
  }, { once: true });

  function step(name, status = 'ok', detail = '') {
    const entry = { status, detail: String(detail || ''), elapsed: Date.now() - startedAt };
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

  async function probeConnectivity(timeoutMs = 4000) {
    const targets = [window.location.origin];
    if (window.SUPABASE_URL) targets.push(String(window.SUPABASE_URL).replace(/\/$/, ''));
    const results = await Promise.allSettled(targets.map(async target => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(target, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal, credentials: 'omit' });
        return !!response;
      } finally { clearTimeout(timer); }
    }));
    return results.some(result => result.status === 'fulfilled' && result.value);
  }

  async function verifyConnectivity() {
    if (checking) return false;
    checking = true;
    try {
      const reachable = await probeConnectivity();
      offline = !reachable;
      if (reachable) {
        setBanner(false);
        step('Network', 'ok', 'Website or Supabase host reachable');
      } else {
        setBanner(true, 'Limited connectivity — KUDASAI remains open; online features will retry.');
        step('Network', 'warn', 'Connectivity probe failed; public app remains available');
      }
      return reachable;
    } catch (error) {
      offline = true;
      setBanner(true, 'Limited connectivity — KUDASAI remains open; online features will retry.');
      step('Network', 'warn', error?.message || 'Connectivity probe failed');
      return false;
    } finally { checking = false; }
  }

  // Deprecated splash APIs are retained as no-ops for existing callers.
  function clearSplashTimeout() {}
  function armSplashTimeout() { if ($('splashScreen')) $('splashScreen').style.display = 'none'; }
  function markComplete() { complete = true; step('StartupComplete', 'ok', `Total ${Date.now() - startedAt}ms`); }
  function validateDOM() {
    const required = ['authScreen', 'app', 'feed', 'postInput'];
    const missing = required.filter(id => !$(id));
    step('DOMValidation', missing.length ? 'warn' : 'ok', missing.length ? `Missing: ${missing.join(', ')}` : `${required.length} core elements present`);
  }
  function checkConfig() {
    const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(window.SUPABASE_URL || '');
    const hasKey = !!String(window.SUPABASE_ANON_KEY || '').trim();
    step('ConfigLoad', validUrl && hasKey ? 'ok' : 'warn', validUrl && hasKey ? 'Supabase URL and publishable key present' : 'Supabase unavailable; public app remains usable');
  }
  async function validateDeployment() {
    const assets = ['css/style.css', 'script.js', 'config.js'];
    const results = await Promise.allSettled(assets.map(async asset => {
      const response = await fetch(new URL(asset, document.baseURI), { method: 'HEAD', cache: 'no-store' });
      return { asset, ok: response.ok };
    }));
    const failed = results.filter(result => result.status === 'fulfilled' && !result.value.ok).map(result => result.value.asset);
    if (failed.length) step('DeploymentValidation', 'warn', `Unavailable assets: ${failed.join(', ')}`);
    else if (results.some(result => result.status === 'rejected')) step('DeploymentValidation', 'warn', 'Could not verify assets; continuing startup');
    else step('DeploymentValidation', 'ok', `${assets.length} core assets reachable`);
  }
  function initOfflineDetection() {
    window.addEventListener('offline', () => { void verifyConnectivity(); });
    window.addEventListener('online', () => { void verifyConnectivity(); });
    void verifyConnectivity();
  }
  async function retry() {
    const button = document.querySelector('#diagPanel button[onclick*="retry"]');
    if (button) { button.disabled = true; button.textContent = 'Checking connection…'; }
    const reachable = await verifyConnectivity();
    if (reachable) { hideDiagPanel(); window.location.reload(); return; }
    openPublicApp();
    setBanner(true, 'Still cannot reach a network host. KUDASAI remains open.');
    if (button) { button.disabled = false; button.textContent = '↺ Retry Connection'; }
  }
  function enterOfflineMode() {
    offline = true;
    setBanner(true, 'Limited connectivity — KUDASAI remains open; online features may retry.');
    openPublicApp();
    step('OfflineMode', 'warn', 'Non-blocking network banner enabled');
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
        const result = await Promise.race([window.db.from('profiles').select('user_id').limit(1), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))]);
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
  });

  return {
    step, armSplashTimeout, clearSplashTimeout, markComplete, initOfflineDetection,
    showDiagPanel, hideDiagPanel, validateDOM, checkConfig, validateDeployment,
    startHealthMonitor, tryRecover, retry, enterOfflineMode, probeConnectivity,
    getErrors: () => [...errors], getWarnings: () => [...warnings],
    isOffline: () => offline, isComplete: () => complete
  };
})();
