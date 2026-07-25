import {
  apiConfig,
  getJsonBody,
  isSameOrigin,
  sendJson,
  setBotSession,
  tokenHasValidShape,
  verifyTelegramToken,
  requireAdmin
} from '../../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  configureTelegramWebhook,
  createBotSettings,
  getTelegramSettings,
  promoteBotSettings,
  saveTelegramSettings
} from '../../lib/telegram-settings.js';

export const config = apiConfig;

function getWebhookUrl(req) {
  const configuredUrl = typeof process.env.APP_URL === 'string' ? process.env.APP_URL.trim().replace(/\/$/, '') : '';
  if (/^https:\/\/.+/i.test(configuredUrl)) return `${configuredUrl}/api/telegram/webhook`;

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;
  const forwardedProtocol = req.headers['x-forwarded-proto'];
  const protocol = forwardedProtocol === 'http' ? 'http' : 'https';
  return `${protocol}://${host}/api/telegram/webhook`;
}

export default async function connectBot(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }
  if (!requireAdmin(req, res)) return;

  let token = '';
  let expectedBotId = null;
  let registerBot = false;
  try {
    const body = getJsonBody(req);
    token = typeof body.token === 'string' ? body.token.trim() : '';
    expectedBotId = body.expectedBotId === undefined || body.expectedBotId === null ? null : String(body.expectedBotId);
    registerBot = Boolean(body.registerBot);
  } catch {
    return sendJson(res, 400, { ok: false, message: 'Data formulir tidak valid.' });
  }

  if (!tokenHasValidShape(token)) {
    return sendJson(res, 422, { ok: false, message: 'Format token belum sesuai. Salin token lengkap dari @BotFather.' });
  }

  const webhookUrl = getWebhookUrl(req);
  if (!webhookUrl) return sendJson(res, 503, { ok: false, message: 'URL webhook belum dapat ditentukan.' });

  try {
    const bot = await verifyTelegramToken(token);
    if (!bot) {
      return sendJson(res, 401, {
        ok: false,
        message: 'Token tidak dapat diverifikasi. Periksa kembali token atau buat token baru di @BotFather.'
      });
    }

    // Each BotFather token owns its own setting row. Re-entering a token for
    // the same bot replaces only the encrypted token and preserves its catalog.
    if (expectedBotId && String(bot.id) !== expectedBotId) {
      return sendJson(res, 422, {
        ok: false,
        message: 'Token tersebut milik bot lain. Gunakan token dari bot yang dipilih agar data katalog tetap aman.'
      });
    }

    let currentSettings = await getTelegramSettings(bot.id);
    const isNewBot = !currentSettings;
    // Any successful token connection explicitly registers the bot for the
    // management screen. This avoids relying on a browser-only “Tambah bot” flag.
    if (currentSettings?.id === 'primary') {
      currentSettings = await promoteBotSettings(bot.id);
    }
    const newSettings = createBotSettings({ bot, token, currentSettings, webhookUrl });
    const savedSettings = await saveTelegramSettings(newSettings);
    const webhookConfigured = await configureTelegramWebhook(token, webhookUrl, savedSettings.webhook_secret);
    if (!webhookConfigured) {
      return sendJson(res, 503, {
        ok: false,
        message: 'Bot tersimpan, tetapi webhook Telegram belum dapat diaktifkan. Coba hubungkan kembali beberapa saat lagi.'
      });
    }

    if (!setBotSession(res, bot)) {
      return sendJson(res, 503, {
        ok: false,
        message: 'Konfigurasi server belum lengkap. Tambahkan SESSION_SECRET di Vercel Environment Variables.'
      });
    }

    return sendJson(res, 200, { ok: true, bot, webhookConfigured: true, isNewBot });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    const message = error?.name === 'AbortError'
      ? 'Koneksi ke Telegram terlalu lama. Coba lagi beberapa saat lagi.'
      : 'Belum bisa menghubungi layanan. Periksa konfigurasi server lalu coba lagi.';
    return sendJson(res, 503, { ok: false, message });
  }
}
