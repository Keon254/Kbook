// ═══════════════════════════════════════════════════════════════════
// KUDASAI CONFIG — Environment & Supabase Setup
// ═══════════════════════════════════════════════════════════════════

// Set your Supabase credentials here:
window.SUPABASE_URL = 'https://zoipwzvfkbzszpiectzb.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaXB3enZma2J6c3pwaWVjdHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODk5MjgsImV4cCI6MjA4Mjc2NTkyOH0.sML9ogavSmRiGkdsBuvoeLIaHRzyymGIDDhvXAPfHQ4';

console.log('[KUDASAI] Config loaded');
console.log('[KUDASAI] Supabase URL:', window.SUPABASE_URL ? '✓ Set' : '✗ Missing');
console.log('[KUDASAI] Supabase Key:', window.SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
