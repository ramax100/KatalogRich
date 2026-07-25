import { clearBotSession, isSameOrigin, sendJson } from '../../lib/vercel-api.js';

export default function disconnectBot(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }

  clearBotSession(res);
  return sendJson(res, 200, { ok: true });
}
