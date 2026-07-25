import { clearBotSession, getBotSession, getJsonBody, isSameOrigin, sendJson,
  requireAdmin
} from '../../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  deleteBotSettings,
  getDecryptedBotToken,
  getTelegramSettings,
  isBotSessionAuthorized,
  telegramRequest
} from '../../lib/telegram-settings.js';

// Menghapus bot dari panel (multi bot). Menghapus baris pengaturan bot juga
// menghapus seluruh katalog, kategori, dan daftar customer bot tersebut
// (foreign key ON DELETE CASCADE), sehingga wajib bukti kepemilikan: hanya
// bot yang sesinya sedang aktif yang boleh dihapus. Untuk bot lain, admin
// harus mengelolanya dulu lewat alur Ubah token.
export default async function removeBot(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }
  if (!requireAdmin(req, res)) return;

  let botId = '';
  try {
    const body = getJsonBody(req);
    botId = typeof body.botId === 'string' || typeof body.botId === 'number' ? String(body.botId).trim() : '';
  } catch {
    return sendJson(res, 400, { ok: false, message: 'Data bot tidak valid.' });
  }
  if (!/^\d{1,20}$/.test(botId)) {
    return sendJson(res, 422, { ok: false, message: 'ID bot tidak valid.' });
  }

  try {
    const session = getBotSession(req);
    if (!session) {
      return sendJson(res, 401, { ok: false, message: 'Hubungkan bot dengan token Anda untuk menghapus bot.' });
    }

    const settings = await getTelegramSettings(botId);
    if (!settings) {
      return sendJson(res, 404, { ok: false, message: 'Bot tidak ditemukan di daftar.' });
    }
    if (!isBotSessionAuthorized(session, settings)) {
      return sendJson(res, 403, {
        ok: false,
        message: 'Bot ini bukan bot aktif Anda. Kelola bot tersebut dulu lewat Ubah token, lalu ulangi penghapusan.'
      });
    }

    // Matikan webhook lebih dulu agar bot berhenti menerima update. Jika token
    // sudah tidak dapat dibaca/dipakai, penghapusan tetap dilanjutkan.
    try {
      const token = getDecryptedBotToken(settings);
      await telegramRequest(token, 'deleteWebhook', { drop_pending_updates: true });
    } catch {
      // Abaikan: baris bot yang rusak tetap boleh dihapus.
    }

    await deleteBotSettings(botId);
    clearBotSession(res);
    return sendJson(res, 200, { ok: true, removedBotId: botId });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 503, { ok: false, message: 'Bot belum dapat dihapus. Coba lagi beberapa saat lagi.' });
  }
}
