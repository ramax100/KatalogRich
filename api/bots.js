import { getBotSession, isSameOrigin, sendJson,
  requireAdmin
} from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getBotList,
  getTelegramSettings,
  isBotSessionAuthorized
} from '../lib/telegram-settings.js';

// Daftar semua bot yang pernah dihubungkan ke panel ini (multi bot).
// Wajib sesi admin yang valid; hanya metadata bot yang dikembalikan.
export default async function bots(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const session = getBotSession(req);
    if (!session) {
      return sendJson(res, 401, { ok: false, message: 'Hubungkan bot dengan token Anda untuk mengelola daftar bot.' });
    }
    const settings = await getTelegramSettings(session.bot?.id);
    if (!isBotSessionAuthorized(session, settings)) {
      return sendJson(res, 403, { ok: false, message: 'Sesi tidak memiliki akses ke daftar bot ini.' });
    }

    const items = await getBotList();
    return sendJson(res, 200, { ok: true, bots: items, activeBotId: settings.bot_id });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 503, { ok: false, message: 'Daftar bot belum dapat dimuat. Coba lagi beberapa saat lagi.' });
  }
}
