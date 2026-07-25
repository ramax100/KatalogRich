import { getAdminSession, getBotSession, isSameOrigin, sendJson } from '../lib/vercel-api.js';

export default function session(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }

  const admin = getAdminSession(req);
  if (!admin) return sendJson(res, 200, { ok: true, authed: false, connected: false });

  const session = getBotSession(req);
  if (!session) return sendJson(res, 200, { ok: true, authed: true, admin: admin.admin, connected: false });
  return sendJson(res, 200, { ok: true, authed: true, admin: admin.admin, connected: true, bot: session.bot, expiresAt: session.exp });
}
