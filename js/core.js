// ═════════════════════════════════════════════════════════════════════
// KUDASAI — Core Utilities Module
// NOTE: This file provides helper functions. The main Supabase client
// is initialized in script.js and exposed as window.db
// ═════════════════════════════════════════════════════════════════════

// Reference to global db (initialized by script.js)
// This prevents creating duplicate Supabase clients
const getDb = () => window.db;

// Shared state (supplements script.js state)
const KS = {
  user: null,
  posts: [],
  profilesMap: {},
  lastAction: {},
  pendingRequests: new Set()
};

const $ = id => document.getElementById(id);

// ── Safe async wrapper with error logging ──────────────────────────
function safe(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error('[KUDASAI]', e);
      if (window.KS?.step) {
        window.KS.step('AsyncError', 'warn', e.message?.slice(0, 80) || 'Unknown error');
      } else {
        alert(e.message || 'An error occurred');
      }
    }
  };
}

// ── Rate limiting / cooldown helper ─────────────────────────────────
function cooldown(key, ms) {
  const now = Date.now();
  if (KS.lastAction[key] && now - KS.lastAction[key] < ms) return false;
  KS.lastAction[key] = now;
  return true;
}

// ── Debounce helper ─────────────────────────────────────────────────
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Escape HTML ─────────────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Format relative time ─────────────────────────────────────────────
function formatTime(date) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ── Export for global use ────────────────────────────────────────────
window.KSHelpers = { safe, cooldown, debounce, esc, formatTime, $, getDb };
