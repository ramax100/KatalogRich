import { getBotSession, getJsonBody, isSameOrigin, requireAdmin, sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getTelegramSettings,
  isBotSessionAuthorized,
  supabaseRequest
} from '../lib/telegram-settings.js';
import { deleteStoreLogo, getStoreLogoUrl, storeLogoExists, uploadStoreLogo } from '../lib/product-images.js';

export const config = {
  api: { bodyParser: { sizeLimit: '6mb' } }
};

async function getAuthorizedSettings(req) {
  const session = getBotSession(req);
  if (!session) return { error: { status: 401, message: 'Hubungkan bot terlebih dahulu untuk mengubah logo toko.' } };
  const settings = await getTelegramSettings(session.bot.id);
  if (!isBotSessionAuthorized(session, settings)) {
    return { error: { status: 403, message: 'Sesi tidak memiliki akses ke toko ini.' } };
  }
  return { settings };
}

async function touchSettings(botId) {
  const updatedAt = new Date().toISOString();
  await supabaseRequest(`telegram_bot_settings?bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    body: JSON.stringify({ updated_at: updatedAt })
  });
  return updatedAt;
}

export default async function storeLogo(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  if (!requireAdmin(req, res)) return;

  try {
    const authorization = await getAuthorizedSettings(req);
    if (authorization.error) return sendJson(res, authorization.error.status, { ok: false, message: authorization.error.message });
    const { settings } = authorization;

    if (req.method === 'GET') {
      const exists = await storeLogoExists(settings.bot_id);
      return sendJson(res, 200, {
        ok: true,
        exists,
        logoUrl: exists ? getStoreLogoUrl(settings.bot_id, settings.updated_at || '') : ''
      });
    }

    let body;
    try {
      body = getJsonBody(req);
    } catch {
      return sendJson(res, 400, { ok: false, message: 'Data logo tidak valid.' });
    }

    let logoUrl = '';
    let exists = false;
    if (body.removeLogo === true) {
      await deleteStoreLogo(settings.bot_id).catch(() => false);
      await touchSettings(settings.bot_id).catch(() => null);
    } else {
      const uploaded = await uploadStoreLogo(settings.bot_id, body.imageData);
      if (!uploaded) return sendJson(res, 422, { ok: false, message: 'Pilih gambar logo terlebih dahulu.' });
      const version = await touchSettings(settings.bot_id).catch(() => new Date().toISOString());
      logoUrl = getStoreLogoUrl(settings.bot_id, version);
      exists = true;
    }

    return sendJson(res, 200, { ok: true, exists, logoUrl });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 500, { ok: false, message: 'Logo toko belum dapat disimpan.' });
  }
}
