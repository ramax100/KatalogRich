import { clearAllSessions, isSameOrigin, sendJson } from '../../lib/vercel-api.js';

// Keluar sepenuhnya: sesi admin dan sesi bot keduanya dibersihkan, sehingga
// panel kembali terkunci sampai login berikutnya.
export default function logout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }

  clearAllSessions(res);
  return sendJson(res, 200, { ok: true });
}
