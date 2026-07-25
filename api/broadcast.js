import { getBotSession, getJsonBody, isSameOrigin, sendJson,
  requireAdmin
} from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getDecryptedBotToken,
  getTelegramSettings,
  isBotSessionAuthorized,
  telegramRequest
} from '../lib/telegram-settings.js';
import {
  getCustomerAudienceBatch,
  getCustomerAudienceCount,
  isUnreachableCustomerError,
  markCustomersBlocked
} from '../lib/customer-chats.js';

const BATCH_SIZE = 40;
const PARALLEL_SENDS = 10;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Kirim Pesan mengirim pesan ke SEMUA customer sekaligus, sehingga wajib
// selalu memakai sesi admin yang terverifikasi. Tidak ada fallback ke bot
// terakhir seperti diagnostik — fallback itu membuat siapa pun dapat
// broadcast tanpa login, dan jumlah customer ikut bocor ke pengunjung anonim.
// Catatan: getBotSession mengembalikan payload sesi langsung ({ bot, exp }),
// akses bot via session.bot — sama seperti api/products.js.
async function getAuthorizedSettings(req) {
  const session = getBotSession(req);
  if (!session) {
    return { error: { status: 401, message: 'Hubungkan bot dengan token Anda untuk mengirim pesan.' } };
  }
  const settings = await getTelegramSettings(session.bot?.id);
  if (!isBotSessionAuthorized(session, settings)) {
    return { error: { status: 403, message: 'Sesi tidak memiliki akses ke customer bot ini.' } };
  }
  return { settings };
}

export default async function broadcast(req, res) {
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
      const audience = await getCustomerAudienceCount(settings.bot_id);
      return sendJson(res, 200, { ok: true, audience });
    }

    let body;
    try { body = getJsonBody(req); } catch { return sendJson(res, 400, { ok: false, message: 'Isi pesan tidak valid.' }); }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const offset = Math.max(Number(body.offset) || 0, 0);
    if (!message) return sendJson(res, 422, { ok: false, message: 'Pesan tidak boleh kosong.' });
    if (message.length > 4096) return sendJson(res, 422, { ok: false, message: 'Pesan maksimal 4.096 karakter.' });

    const audience = await getCustomerAudienceCount(settings.bot_id);
    const batch = await getCustomerAudienceBatch(settings.bot_id, { offset, limit: BATCH_SIZE });
    const token = getDecryptedBotToken(settings);
    let delivered = 0;
    let failed = 0;
    const blockedChatIds = [];

    for (let index = 0; index < batch.length; index += PARALLEL_SENDS) {
      const group = batch.slice(index, index + PARALLEL_SENDS);
      const results = await Promise.all(group.map(async (chatId) => {
        const result = await telegramRequest(token, 'sendMessage', {
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true
        });
        return { chatId, result };
      }));
      for (const { chatId, result } of results) {
        if (result.ok) {
          delivered += 1;
        } else if (isUnreachableCustomerError(result)) {
          blockedChatIds.push(chatId);
        } else {
          failed += 1;
        }
      }
      if (index + PARALLEL_SENDS < batch.length) await delay(550);
    }

    // Customer yang chatnya sudah tidak terjangkau (memblokir bot atau akun
    // hilang) otomatis dinonaktifkan agar tidak dicoba lagi di kirim berikutnya.
    // Jangan biarkan kegagalan pembersihan menggugurkan hasil pengiriman.
    const blockedRemoved = blockedChatIds.length
      ? await markCustomersBlocked(settings.bot_id, blockedChatIds).catch(() => 0)
      : 0;

    const processed = offset + batch.length;
    return sendJson(res, 200, {
      ok: true,
      audience,
      delivered,
      failed,
      blockedRemoved,
      processed,
      nextOffset: batch.length && processed < audience ? processed : null
    });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 503, { ok: false, message: 'Pesan belum dapat dikirim. Coba lagi beberapa saat lagi.' });
  }
}
