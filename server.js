import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import connectBot from './api/bot/connect.js';
import disconnectBot from './api/bot/disconnect.js';
import removeBot from './api/bot/remove.js';
import session from './api/session.js';
import telegramWebhook from './api/telegram/webhook.js';
import welcome from './api/welcome.js';
import products from './api/products.js';
import contact from './api/contact.js';
import categories from './api/categories.js';
import diagnostics from './api/diagnostics.js';
import broadcast from './api/broadcast.js';
import bots from './api/bots.js';
import authLogin from './api/auth/login.js';
import authLogout from './api/auth/logout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const apiHandlers = new Map([
  ['/api/bot/connect', connectBot],
  ['/api/bot/disconnect', disconnectBot],
  ['/api/bot/remove', removeBot],
  ['/api/session', session],
  ['/api/telegram/webhook', telegramWebhook],
  ['/api/welcome', welcome],
  ['/api/products', products],
  ['/api/contact', contact],
  ['/api/categories', categories],
  ['/api/diagnostics', diagnostics],
  ['/api/broadcast', broadcast],
  ['/api/bots', bots],
  ['/api/auth/login', authLogin],
  ['/api/auth/logout', authLogout]
]);

function setStaticSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: https://api.telegram.org; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, status, payload) {
  setStaticSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function addServerlessResponseMethods(res) {
  // Vercel function handlers use Express-style methods. This adapter lets the
  // same handlers run in the local Node server, too.
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };
}

async function parseBody(req, maxBytes = 32 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // API helpers parse this on demand and will return their normal validation error.
    return text;
  }
}

async function handleApi(req, res, pathname) {
  const handler = apiHandlers.get(pathname);
  if (!handler) return sendJson(res, 404, { ok: false, message: 'Endpoint tidak ditemukan.' });

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
    try {
      // Foto produk dan gambar Kirim Pesan dienkode base64 dalam JSON sehingga
      // butuh batas body lebih besar — selaras dengan sizeLimit 3mb di config
      // bodyParser Vercel kedua endpoint itu.
      const LARGE_BODY_ENDPOINTS = ['/api/products', '/api/broadcast'];
      const maxBytes = LARGE_BODY_ENDPOINTS.includes(pathname) ? 3 * 1024 * 1024 : 32 * 1024;
      req.body = await parseBody(req, maxBytes);
    } catch {
      req.body = '{';
    }
  }

  addServerlessResponseMethods(res);
  return handler(req, res);
}

async function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const cleanPath = path.normalize(requested).replace(/^[/\\]+/, '');
  const filePath = path.join(publicDir, cleanPath);
  if (!filePath.startsWith(publicDir + path.sep) && filePath !== path.join(publicDir, 'index.html')) {
    return sendJson(res, 403, { ok: false, message: 'Akses ditolak.' });
  }

  try {
    const data = await readFile(filePath);
    setStaticSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    sendJson(res, 404, { ok: false, message: 'Halaman tidak ditemukan.' });
  }
}

const server = http.createServer(async (req, res) => {
  const base = `http://${req.headers.host || 'localhost'}`;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', base).pathname);
  } catch {
    return sendJson(res, 400, { ok: false, message: 'URL tidak valid.' });
  }

  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else await serveStatic(req, res, pathname);
  } catch {
    // Do not log request bodies; they can contain BotFather tokens.
    if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'Terjadi kesalahan pada server.' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Panel Katalog Telegram berjalan di http://localhost:${PORT}`);
});
