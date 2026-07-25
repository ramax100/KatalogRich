import { getBotSession, getJsonBody, isSameOrigin, sendJson,
  requireAdmin
} from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getTelegramSettings,
  isBotSessionAuthorized,
  safeSettings,
  updateWelcomeText
} from '../lib/telegram-settings.js';

export const config = {
  api: { bodyParser: { sizeLimit: '12kb' } }
};

function requireAuthorizedSettings(req) {
  const session = getBotSession(req);
  if (!session) return { error: { status: 401, message: 'Hubungkan bot dengan token Anda untuk mengubah pesan welcome.' } };
  return { session };
}

export default async function welcome(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }
  if (!requireAdmin(req, res)) return;

  const authorization = requireAuthorizedSettings(req);
  if (authorization.error) return sendJson(res, authorization.error.status, { ok: false, message: authorization.error.message });

  try {
    const settings = await getTelegramSettings(authorization.session.bot.id);
    if (!isBotSessionAuthorized(authorization.session, settings)) {
      return sendJson(res, 403, { ok: false, message: 'Sesi tidak memiliki akses ke konfigurasi bot ini.' });
    }

    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, settings: safeSettings(settings) });
    }

    let welcomeText = '';
    try {
      const body = getJsonBody(req);
      welcomeText = typeof body.welcomeText === 'string' ? body.welcomeText.trim() : '';
    } catch {
      return sendJson(res, 400, { ok: false, message: 'Data pesan tidak valid.' });
    }

    if (!welcomeText) return sendJson(res, 422, { ok: false, message: 'Pesan welcome tidak boleh kosong.' });
    if (welcomeText.length > 4096) return sendJson(res, 422, { ok: false, message: 'Pesan welcome maksimal 4.096 karakter.' });

    const updated = await updateWelcomeText(settings.bot_id, welcomeText);
    return sendJson(res, 200, { ok: true, settings: safeSettings(updated) });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 500, { ok: false, message: 'Pesan welcome belum dapat disimpan.' });
  }
}
