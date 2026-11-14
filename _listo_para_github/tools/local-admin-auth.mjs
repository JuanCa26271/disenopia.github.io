import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local preview authentication only. Production must use apps/api and PostgreSQL.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = resolve(root, '.local/admin-auth.sqlite');
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS admin (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1);');
const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
if (!initialPassword || initialPassword.length < 10) throw new Error('Set ADMIN_INITIAL_PASSWORD (10+ characters) before starting local admin auth.');
if (!db.prepare('SELECT 1 FROM admin WHERE username = ?').get('MAGA@ADMON')) {
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO admin (username, salt, password_hash, must_change) VALUES (?, ?, ?, 1)')
    .run('MAGA@ADMON', salt, scryptSync(initialPassword, salt, 64).toString('hex'));
}

const customOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = new Set([
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  ...customOrigins
]);
const sessions = new Map();
const attempts = new Map();
const port = Number(process.env.LOCAL_AUTH_PORT || 4000);
const json = (res, status, value, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(value));
};
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 12_000) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolveBody(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function cookieValue(req, name) {
  const entry = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
function accountFor(req) {
  const token = cookieValue(req, 'maga_preview_session');
  const username = sessions.get(token);
  return username ? { token, row: db.prepare('SELECT username, must_change FROM admin WHERE username=?').get(username) } : {};
}
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return json(res, 403, { error: 'Origin not allowed' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  const path = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
  if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true });
  if (path.startsWith('/api/v1/admin/') && req.method !== 'GET' && (!origin || !allowedOrigins.has(origin))) return json(res, 403, { error: 'A trusted local admin origin is required' });
  try {
    if (path === '/api/v1/admin/login' && req.method === 'POST') {
      const data = await readBody(req);
      const username = String(data.username || '').trim().toUpperCase();
      const password = String(data.password || '');
      const key = `${req.socket.remoteAddress}:${username}`;
      const state = attempts.get(key) || { count: 0, until: 0 };
      if (state.until > Date.now()) return json(res, 429, { error: 'Too many attempts' });
      const row = db.prepare('SELECT username, salt, password_hash, must_change FROM admin WHERE username=?').get(username);
      const hash = row ? scryptSync(password, row.salt, 64) : scryptSync(password, 'maga-preview-invalid-user', 64);
      const expected = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(64);
      if (!row || hash.length !== expected.length || !timingSafeEqual(hash, expected)) {
        state.count += 1;
        if (state.count >= 5) { state.count = 0; state.until = Date.now() + 30 * 60_000; }
        attempts.set(key, state);
        return json(res, state.until > Date.now() ? 429 : 401, { error: 'Invalid credentials' });
      }
      attempts.delete(key);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, row.username);
      return json(res, 200, { authenticated: true, passwordChangeRequired: Boolean(row.must_change) }, {
        'Set-Cookie': `maga_preview_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api/v1/admin; Max-Age=1800`
      });
    }
    if (path === '/api/v1/admin/session' && req.method === 'GET') {
      const { row } = accountFor(req);
      return json(res, row ? 200 : 401, { authenticated: Boolean(row), passwordChangeRequired: Boolean(row?.must_change) });
    }
    if (path === '/api/v1/admin/change-password' && req.method === 'POST') {
      const { token, row } = accountFor(req);
      if (!row) return json(res, 401, { error: 'Authentication required' });
      const data = await readBody(req);
      const oldPassword = String(data.currentPassword || '');
      const nextPassword = String(data.newPassword || '');
      const saved = db.prepare('SELECT salt, password_hash FROM admin WHERE username=?').get(row.username);
      const oldHash = scryptSync(oldPassword, saved.salt, 64);
      if (!timingSafeEqual(oldHash, Buffer.from(saved.password_hash, 'hex'))) return json(res, 400, { error: 'Current password is incorrect' });
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}/.test(nextPassword) || nextPassword === oldPassword) return json(res, 400, { error: 'Use a different password with at least 12 characters, upper/lowercase letters, and a number.' });
      const salt = randomBytes(16).toString('hex');
      db.prepare('UPDATE admin SET salt=?, password_hash=?, must_change=0 WHERE username=?').run(salt, scryptSync(nextPassword, salt, 64).toString('hex'), row.username);
      sessions.set(token, row.username);
      return json(res, 200, { passwordChanged: true });
    }
    if (path === '/api/v1/admin/logout' && req.method === 'POST') {
      const token = cookieValue(req, 'maga_preview_session');
      sessions.delete(token);
      return json(res, 200, { loggedOut: true }, { 'Set-Cookie': 'maga_preview_session=; HttpOnly; SameSite=Strict; Path=/api/v1/admin; Max-Age=0' });
    }
    return json(res, 404, { error: 'Not found' });
  } catch {
    return json(res, 400, { error: 'Invalid request' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`MAGA local admin auth listening on http://127.0.0.1:${port}`));
