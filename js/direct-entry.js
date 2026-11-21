// Direct-entry override for the legacy v3 app engine.
// This script runs after script.js, allowing it to replace old welcome-page
// routing while leaving the Supabase session restoration and authorization
// checks intact. Public feed queries use the existing RLS-protected client.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const showPublicApp = () => {
    const splash = byId('splashScreen');
    const landing = byId('landingPage');
    const auth = byId('authScreen');
    const app = byId('app');
    if (splash) splash.style.display = 'none';
    if (landing) landing.style.display = 'none';
    if (auth) auth.style.display = 'none';
    if (app) app.style.display = 'grid';
    if (byId('feedTabs')) byId('feedTabs').style.display = '';
    if (byId('composer')) byId('composer').style.display = 'none';
  };
  const showAuth = () => {
    showPublicApp();
    if (byId('app')) byId('app').style.display = 'none';
    if (byId('authScreen')) byId('authScreen').style.display = 'flex';
  };

  window.showLanding = showPublicApp;
  window.enterApp = showAuth;

  function mountPublicEntry() {
    showPublicApp();
    const topbar = document.querySelector('.topbar');
    if (topbar && !byId('directEntryAuthButton')) {
      const button = document.createElement('button');
      button.id = 'directEntryAuthButton';
      button.type = 'button';
      button.textContent = 'Sign in';
      button.setAttribute('aria-label', 'Sign in or create an account');
      button.style.cssText = 'flex-shrink:0;padding:9px 16px;border:1px solid rgba(0,212,255,.35);border-radius:18px;background:rgba(0,212,255,.1);color:var(--accent);font:600 13px Inter,sans-serif;cursor:pointer';
      button.addEventListener('click', showAuth);
      topbar.appendChild(button);
    }
    const authBox = document.querySelector('#authScreen .auth-box');
    if (authBox && !byId('directEntryBackButton')) {
      const button = document.createElement('button');
      button.id = 'directEntryBackButton';
      button.type = 'button';
      button.textContent = '← Browse KUDASAI';
      button.style.cssText = 'width:100%;margin-top:12px;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:transparent;color:#aaa;font:600 14px Inter,sans-serif;cursor:pointer';
      button.addEventListener('click', showPublicApp);
      authBox.appendChild(button);
    }
  }

  // Initialize the public feed independently of auth. The app shell is visible
  // before network calls; existing auth listener still restores valid sessions.
  window.addEventListener('DOMContentLoaded', () => {
    mountPublicEntry();
    setTimeout(() => {
      mountPublicEntry(); // tolerate script.js's later startup callback
      if (typeof window.loadFeed === 'function') void window.loadFeed();
    }, 0);
  }, { once: true });
})();
