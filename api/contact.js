import { getBotSession, getJsonBody, isSameOrigin, sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getTelegramSettings,
  isBotSessionAuthorized,
  normalizeWhatsAppNumber,
  updateWhatsAppNumber
} from '../lib/telegram-settings.js';

export const config = {
  api: { bodyParser: { sizeLimit: '8kb' } }
};

export default async function contact(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });

  try {
    const session = getBotSession(req);
    if (!session) return sendJson(res, 401, { ok: false, message: 'Hubungkan bot dengan token Anda untuk mengatur nomor WhatsApp.' });
    const settings = await getTelegramSettings(session.bot.id);
    if (!isBotSessionAuthorized(session, settings)) {
      return sendJson(res, 403, { ok: false, message: 'Sesi tidak memiliki akses ke konfigurasi bot ini.' });
    }

    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, whatsappNumber: settings.whatsapp_number || '' });
    }

    let body;
    try {
      body = getJsonBody(req);
    } catch {
      return sendJson(res, 400, { ok: false, message: 'Data nomor WhatsApp tidak valid.' });
    }
    const whatsappNumber = normalizeWhatsAppNumber(body.whatsappNumber);
    const updated = await updateWhatsAppNumber(settings.bot_id, whatsappNumber);
    return sendJson(res, 200, { ok: true, whatsappNumber: updated.whatsapp_number });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 422, { ok: false, message: error.message });
    }
    return sendJson(res, 500, { ok: false, message: 'Nomor WhatsApp belum dapat disimpan.' });
  }
}
