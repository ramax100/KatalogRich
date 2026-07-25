import { getBotSession, getJsonBody, isSameOrigin, sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getTelegramSettings,
  isBotSessionAuthorized
} from '../lib/telegram-settings.js';
import { createCategory, deleteCategory, getCategories } from '../lib/catalog-categories.js';

export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

async function getAuthorizedBot(req) {
  const session = getBotSession(req);
  if (!session) return { error: { status: 401, message: 'Hubungkan bot dengan token Anda untuk mengelola kategori.' } };
  const settings = await getTelegramSettings(session.bot.id);
  if (!isBotSessionAuthorized(session, settings)) return { error: { status: 403, message: 'Sesi tidak memiliki akses ke kategori bot ini.' } };
  return { botId: settings.bot_id };
}

export default async function categories(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });

  try {
    const authorization = await getAuthorizedBot(req);
    if (authorization.error) return sendJson(res, authorization.error.status, { ok: false, message: authorization.error.message });

    if (req.method === 'GET') return sendJson(res, 200, { ok: true, categories: await getCategories(authorization.botId) });

    if (req.method === 'POST') {
      let body;
      try { body = getJsonBody(req); } catch { return sendJson(res, 400, { ok: false, message: 'Data kategori tidak valid.' }); }
      return sendJson(res, 201, { ok: true, category: await createCategory(authorization.botId, body.name) });
    }

    const url = new URL(req.url || '', `https://${req.headers.host || 'localhost'}`);
    return sendJson(res, 200, { ok: true, category: await deleteCategory(authorization.botId, url.searchParams.get('id')) });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 422, { ok: false, message: error.message });
    }
    return sendJson(res, 500, { ok: false, message: 'Kategori belum dapat diproses.' });
  }
}
