import {
  adminCredentialsMatch,
  getConfiguredAdminCredentials,
  getJsonBody,
  isSameOrigin,
  sendJson,
  setAdminSession
} from '../../lib/vercel-api.js';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };

// Pembatas percobaan login per IP (best effort: tiap instance serverless punya
// memorinya sendiri). Maksimal 5 percobaan gagal per 10 menit.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function requesterKey(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.headers.host || 'local');
}

function isLimited(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
  // Cegah memori membengkak pada instance yang berumur panjang.
  if (attempts.size > 500) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
  }
}

export default async function login(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }

  const key = requesterKey(req);
  if (isLimited(key)) {
    return sendJson(res, 429, { ok: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 10 menit.' });
  }

  let username = '';
  let password = '';
  try {
    const body = getJsonBody(req);
    username = typeof body.username === 'string' ? body.username.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return sendJson(res, 400, { ok: false, message: 'Data login tidak valid.' });
  }

  if (!getConfiguredAdminCredentials()) {
    return sendJson(res, 503, { ok: false, message: 'Login admin belum dikonfigurasi. Tambahkan ADMIN_USERNAME dan ADMIN_PASSWORD di Environment Variables.' });
  }

  const matched = adminCredentialsMatch(username, password);
  if (matched !== true) {
    recordFailure(key);
    return sendJson(res, 401, { ok: false, message: 'Username atau password salah.' });
  }

  attempts.delete(key);
  if (!setAdminSession(res, username)) {
    return sendJson(res, 503, { ok: false, message: 'Konfigurasi server belum lengkap. Tambahkan SESSION_SECRET di Environment Variables.' });
  }
  return sendJson(res, 200, { ok: true, username });
}
