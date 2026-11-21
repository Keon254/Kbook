const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};

function sendFile(req, res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  // Serve the committed config.js as the source of truth. Deployment variables
  // override it only when explicitly set; missing server env vars must never
  // replace a valid frontend config with empty strings.
  if (pathname === '/config.js') {
    const configPath = path.join(__dirname, 'config.js');
    fs.readFile(configPath, 'utf8', (error, source) => {
      if (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Supabase configuration file is unavailable.');
        return;
      }
      const overrides = [
        SUPABASE_URL ? `window.SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};` : '',
        SUPABASE_ANON_KEY ? `window.SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};` : ''
      ].filter(Boolean).join('\n');
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(`${source}\n${overrides}\n`);
    });
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, relativePath);
  if (filePath !== __dirname && !filePath.startsWith(__dirname + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      // Preserve the existing single-page app fallback for client-side routes.
      sendFile(req, res, path.join(__dirname, 'index.html'));
      return;
    }
    sendFile(req, res, filePath);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`KUDASAI running at http://${HOST}:${PORT}`);
  console.log('[KUDASAI] Supabase configuration source:', SUPABASE_URL || SUPABASE_ANON_KEY ? 'deployment overrides + config.js fallback' : 'config.js');
});
