import { getBotSession, getJsonBody, isSameOrigin, sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getCustomerChatIds,
  getDecryptedBotToken,
  getLatestTelegramSettings,
  getTelegramSettings,
  isBotSessionAuthorized,
  telegramRequest
} from '../lib/telegram-settings.js';

const BATCH_SIZE = 40;
const PARALLEL_SENDS = 10;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAuthorizedSettings(req) {
  const session = getBotSession(req);
  if (session) {
    try {
      const sessionSettings = await getTelegramSettings(session.session.bot.id);
      if (isBotSessionAuthorized(session, sessionSettings)) return { settings: sessionSettings };
    } catch {
      // Fall through to the latest configured bot below.
    }
  }
  // The panel can still send essential announcements after an expired browser
  // session. It uses the most recently configured bot, the same fallback as diagnostics.
  const settings = await getLatestTelegramSettings();
  if (!settings) return { error: { status: 404, message: 'Belum ada bot yang dapat mengirim pesan.' } };
  return { settings };
}

export default async function broadcast(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });

  try {
    const authorization = await getAuthorizedSettings(req);
    if (authorization.error) return sendJson(res, authorization.error.status, { ok: false, message: authorization.error.message });
    const { settings } = authorization;
    const customers = getCustomerChatIds(settings);

    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, audience: customers.length });
    }

    let body;
    try { body = getJsonBody(req); } catch { return sendJson(res, 400, { ok: false, message: 'Isi pesan tidak valid.' }); }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const offset = Math.max(Number(body.offset) || 0, 0);
    if (!message) return sendJson(res, 422, { ok: false, message: 'Pesan tidak boleh kosong.' });
    if (message.length > 4096) return sendJson(res, 422, { ok: false, message: 'Pesan maksimal 4.096 karakter.' });

    const batch = customers.slice(offset, offset + BATCH_SIZE);
    const token = getDecryptedBotToken(settings);
    let delivered = 0;
    let failed = 0;

    for (let index = 0; index < batch.length; index += PARALLEL_SENDS) {
      const group = batch.slice(index, index + PARALLEL_SENDS);
      const results = await Promise.all(group.map(async (chatId) => {
        const result = await telegramRequest(token, 'sendMessage', {
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true
        });
        return result.ok;
      }));
      delivered += results.filter(Boolean).length;
      failed += results.filter((value) => !value).length;
      if (index + PARALLEL_SENDS < batch.length) await delay(550);
    }

    const processed = offset + batch.length;
    return sendJson(res, 200, {
      ok: true,
      audience: customers.length,
      delivered,
      failed,
      processed,
      nextOffset: processed < customers.length ? processed : null
    });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 503, { ok: false, message: 'Pesan belum dapat dikirim. Coba lagi beberapa saat lagi.' });
  }
}
