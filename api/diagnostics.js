import { getBotSession, isSameOrigin, sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  configureTelegramWebhook,
  getDecryptedBotToken,
  getLatestTelegramSettings,
  getTelegramSettings,
  isBotSessionAuthorized,
  telegramRequest
} from '../lib/telegram-settings.js';
import { getCategories } from '../lib/catalog-categories.js';
import { getProducts } from '../lib/catalog-products.js';

function errorCheck(id, label, detail) {
  return { id, label, status: 'error', detail };
}

export default async function diagnostics(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });

  const session = getBotSession(req);

  try {
    let settings = null;
    if (session) {
      try {
        const sessionSettings = await getTelegramSettings(session.session.bot.id);
        if (isBotSessionAuthorized(session, sessionSettings)) settings = sessionSettings;
      } catch {
        // A stale cookie must not stop the fallback diagnostic below.
      }
    }
    // Diagnostics is read-only except for webhook repair. Falling back to the
    // latest configured bot lets an expired browser session repair the panel
    // rather than failing before it can explain the issue.
    if (!settings) settings = await getLatestTelegramSettings();
    if (!settings) return sendJson(res, 404, { ok: false, message: 'Belum ada bot yang dapat diperiksa.' });

    const checks = [];
    let token = null;
    try {
      token = getDecryptedBotToken(settings);
    } catch {
      checks.push(errorCheck('token', 'Token bot', 'Token tersimpan tidak dapat dibaca. Masukkan ulang token BotFather untuk bot ini.'));
    }

    if (token) {
      try {
        const webhookInfo = await telegramRequest(token, 'getWebhookInfo', {});
        const info = webhookInfo.result?.result || {};
        const needsRepair = !webhookInfo.ok || info.url !== settings.webhook_url || Boolean(info.last_error_message);
        if (needsRepair) {
          const repaired = await configureTelegramWebhook(token, settings.webhook_url, settings.webhook_secret);
          checks.push({
            id: 'webhook',
            label: 'Webhook Telegram',
            status: repaired ? 'repaired' : 'error',
            detail: repaired ? 'Webhook diperbarui otomatis dan siap menerima pesan.' : 'Webhook belum dapat diperbaiki. Hubungkan token kembali untuk mencoba ulang.'
          });
        } else {
          checks.push({ id: 'webhook', label: 'Webhook Telegram', status: 'healthy', detail: 'Webhook aktif dan tidak menemukan error Telegram.' });
        }
      } catch {
        checks.push(errorCheck('webhook', 'Webhook Telegram', 'Telegram belum dapat dihubungi. Coba jalankan diagnostik lagi beberapa saat lagi.'));
      }
    }

    try {
      const [products, categories] = await Promise.all([
        getProducts(settings.bot_id, { limit: 50 }),
        getCategories(settings.bot_id)
      ]);
      checks.push({
        id: 'catalog',
        label: 'Data katalog',
        status: 'healthy',
        detail: `${products.length} produk dan ${categories.length} kategori berhasil dibaca dari database.`
      });
    } catch {
      checks.push(errorCheck('catalog', 'Data katalog', 'Data katalog belum dapat dibaca. Periksa kembali konfigurasi database.'));
    }

    checks.push({
      id: 'whatsapp',
      label: 'WhatsApp pemesanan',
      status: settings.whatsapp_number ? 'healthy' : 'warning',
      detail: settings.whatsapp_number ? `Nomor +${settings.whatsapp_number} siap digunakan.` : 'Nomor WhatsApp belum diatur. Tombol Pesan sekarang belum akan tampil.'
    });

    const repaired = checks.some((check) => check.status === 'repaired');
    return sendJson(res, 200, { ok: true, checks, repaired });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 503, { ok: false, message: 'Diagnostik belum dapat memuat data bot. Masukkan ulang token bot lalu coba lagi.' });
  }
}
