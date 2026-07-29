import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export const apiConfig = {
  api: { bodyParser: { sizeLimit: '8kb' } }
};

export function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; img-src 'self' data: https://api.telegram.org https://*.supabase.co; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

export function sendJson(res, status, payload) {
  setSecurityHeaders(res);
  res.status(status).json(payload);
}

export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const requestedOrigin = new URL(origin);
    const expectedHost = req.headers['x-forwarded-host'] || req.headers.host;
    return requestedOrigin.host === expectedHost && ['http:', 'https:'].includes(requestedOrigin.protocol);
  } catch {
    return false;
  }
}

export function parseCookies(header = '') {
  return header.split(';').reduce((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator > 0) cookies[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
    return cookies;
  }, {});
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export function setBotSession(res, bot) {
  const secret = getSessionSecret();
  if (!secret) return false;

  // The cookie contains only public bot metadata. The BotFather token is excluded.
  const payload = encode({ bot, exp: Date.now() + SESSION_TTL_SECONDS * 1000 });
  const signature = sign(payload, secret);
  res.setHeader('Set-Cookie', `catalog_bot=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`);
  return true;
}

export function getBotSession(req) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const cookie = parseCookies(req.headers.cookie).catalog_bot;
  if (!cookie) return null;
  const lastDot = cookie.lastIndexOf('.');
  if (lastDot < 1) return null;

  const payload = cookie.slice(0, lastDot);
  const signature = cookie.slice(lastDot + 1);
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const data = decode(payload);
    if (!data?.bot || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearBotSession(res) {
  res.setHeader('Set-Cookie', 'catalog_bot=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

// === Sesi admin ===
// Cookie terpisah dari sesi bot: login admin menggerbangi SELURUH API panel
// (konek bot, katalog, broadcast, dsb.), sedangkan sesi bot tetap menentukan
// bot mana yang sedang dikelola. Ditandatangani HMAC dengan SESSION_SECRET
// yang sama, berlaku 12 jam.

export function setAdminSession(res, username) {
  const secret = getSessionSecret();
  if (!secret) return false;
  const payload = encode({ admin: username, exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000 });
  const signature = sign(payload, secret);
  res.setHeader('Set-Cookie', `catalog_admin=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`);
  return true;
}

export function getAdminSession(req) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const cookie = parseCookies(req.headers.cookie).catalog_admin;
  if (!cookie) return null;
  const lastDot = cookie.lastIndexOf('.');
  if (lastDot < 1) return null;

  const payload = cookie.slice(0, lastDot);
  const signature = cookie.slice(lastDot + 1);
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const data = decode(payload);
    if (typeof data?.admin !== 'string' || !data.admin || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAdminSession(res) {
  res.setHeader('Set-Cookie', 'catalog_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

// Membersihkan sesi admin dan sesi bot sekaligus (logout penuh).
export function clearAllSessions(res) {
  res.setHeader('Set-Cookie', [
    'catalog_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    'catalog_bot=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  ]);
}

// Kredensial admin hanya dari environment variable — tidak pernah di-commit.
export function getConfiguredAdminCredentials() {
  const username = typeof process.env.ADMIN_USERNAME === 'string' ? process.env.ADMIN_USERNAME.trim() : '';
  const password = typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD : '';
  return username && password ? { username, password } : null;
}

// Perbandingan dilakukan lewat digest SHA-256 agar waktu respons tidak
// membocorkan isi maupun panjang kredensial. Mengembalikan null bila kredensial
// belum dikonfigurasi di server.
export function adminCredentialsMatch(username, password) {
  const expected = getConfiguredAdminCredentials();
  if (!expected) return null;
  const digest = (value) => createHash('sha256').update(String(value)).digest();
  const userOk = timingSafeEqual(digest(username), digest(expected.username));
  const passOk = timingSafeEqual(digest(password), digest(expected.password));
  return userOk && passOk;
}

// Penjaga bersama untuk semua API panel. Mengembalikan sesi admin, atau null
// setelah mengirim respons 401 (endpoint cukup `return` saat menerima null).
export function requireAdmin(req, res) {
  const session = getAdminSession(req);
  if (!session) {
    sendJson(res, 401, { ok: false, loginRequired: true, message: 'Login sebagai admin untuk melanjutkan.' });
    return null;
  }
  return session;
}

export function getJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

export async function verifyTelegramToken(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    // Never log this URL: the token is a part of the official Telegram endpoint URL.
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data.result) return null;

    return {
      id: data.result.id,
      firstName: data.result.first_name || 'Bot Telegram',
      username: data.result.username || '',
      canJoinGroups: Boolean(data.result.can_join_groups),
      canReadAllGroupMessages: Boolean(data.result.can_read_all_group_messages),
      supportsInlineQueries: Boolean(data.result.supports_inline_queries)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function tokenHasValidShape(token) {
  return /^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token);
}
