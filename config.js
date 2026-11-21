// ════════════════════════════════════════════════════════════════
// KUDASAI CONFIG — Environment & Supabase Setup
// ════════════════════════════════════════════════════════════════

// Publishable keys are safe for browser/frontend use.
window.SUPABASE_URL = 'https://hbfavhagbmhlthwilvqq.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_y2d80cFH7wojJmEwik15kA_h0XtUcSj';
window.SUPABASE_MEDIA_BUCKET = 'kudasai-media';

console.log('[KUDASAI] Config loaded');
console.log('[KUDASAI] Supabase URL:', window.SUPABASE_URL ? '✓ Set' : '✗ Missing');
console.log('[KUDASAI] Supabase Key:', window.SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
