import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

const TABLE = 'telegram_bot_settings';
const DEFAULT_WELCOME = 'Halo {mention}! 👋\n\n📝 Nama: {name}\n\n👤 Username: {username}\n\n🆔 ID: {id}';

export class SettingsConfigurationError extends Error {
  constructor(message = 'Konfigurasi penyimpanan belum lengkap.') {
    super(message);
    this.name = 'SettingsConfigurationError';
  }
}

export class SettingsStorageError extends Error {
  constructor(message = 'Penyimpanan konfigurasi tidak dapat diakses.') {
    super(message);
    this.name = 'SettingsStorageError';
  }
}

function getSupabaseConfig() {
  const url = typeof process.env.SUPABASE_URL === 'string' ? process.env.SUPABASE_URL.replace(/\/$/, '') : '';
  const serviceRoleKey = typeof process.env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? process.env.SUPABASE_SERVICE_ROLE_KEY : '';
  if (!/^https:\/\/.+/i.test(url) || !serviceRoleKey) {
    throw new SettingsConfigurationError('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum tersedia.');
  }
  return { url, serviceRoleKey };
}

function getEncryptionKey() {
  const encoded = typeof process.env.BOT_ENCRYPTION_KEY === 'string' ? process.env.BOT_ENCRYPTION_KEY : '';
  let key;
  try {
    key = Buffer.from(encoded, 'base64');
  } catch {
    key = null;
  }
  if (!key || key.length !== 32) {
    throw new SettingsConfigurationError('BOT_ENCRYPTION_KEY harus berupa kunci Base64 32-byte.');
  }
  return key;
}

function encrypt(value) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decrypt(value) {
  const key = getEncryptionKey();
  const [version, ivValue, tagValue, ciphertextValue] = String(value).split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
    throw new SettingsStorageError('Format token terenkripsi tidak dapat dibaca.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new SettingsStorageError('Token bot tidak dapat didekripsi. Periksa BOT_ENCRYPTION_KEY.');
  }
}

export function getSupabaseServerConfig() {
  return getSupabaseConfig();
}

export async function supabaseRequest(path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  let response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new SettingsStorageError('Tidak dapat menghubungi Supabase.');
  }

  if (!response.ok) {
    // The response may contain schema details; never pass it directly to the client.
    throw new SettingsStorageError('Supabase belum siap. Jalankan migration tabel telegram_bot_settings.');
  }
  return response;
}

export async function getTelegramSettings(botId) {
  if (botId === undefined || botId === null) return null;
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&select=*&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function getLatestTelegramSettings() {
  const response = await supabaseRequest(`${TABLE}?select=*&order=updated_at.desc&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function getTelegramSettingsByWebhookSecret(webhookSecret) {
  if (!webhookSecret) return null;
  const response = await supabaseRequest(`${TABLE}?webhook_secret=eq.${encodeURIComponent(String(webhookSecret))}&select=*&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function promoteBotSettings(botId) {
  const targetId = `bot-${botId}`;
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id: targetId, updated_at: new Date().toISOString() })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Data bot belum dapat ditambahkan ke daftar kelola bot.');
  return rows[0];
}

export async function getBotList() {
  // Semua bot yang tersimpan tampil di pengelola multi bot, termasuk baris
  // legacy 'primary' dari instalasi awal (akan otomatis bermigrasi ke
  // id 'bot-<bot_id>' saat tokennya diverifikasi ulang).
  const response = await supabaseRequest(`${TABLE}?select=id,bot_id,bot_first_name,bot_username,updated_at&order=updated_at.desc`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map((row) => ({
    id: row.id,
    bot: { id: row.bot_id, firstName: row.bot_first_name, username: row.bot_username || '' },
    updatedAt: row.updated_at
  })) : [];
}

export async function deleteBotSettings(botId) {
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Bot tidak ditemukan atau belum dapat dihapus.');
  return rows[0];
}

export async function saveTelegramSettings(settings) {
  const record = {
    id: settings.settingsId || `bot-${settings.botId}`,
    bot_id: settings.botId,
    bot_first_name: settings.botFirstName,
    bot_username: settings.botUsername || null,
    token_encrypted: settings.tokenEncrypted,
    webhook_secret: settings.webhookSecret,
    webhook_url: settings.webhookUrl,
    welcome_text: settings.welcomeText,
    updated_at: new Date().toISOString()
  };

  const response = await supabaseRequest(TABLE, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(record)
  });
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : record;
}

export async function updateWelcomeText(botId, welcomeText) {
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ welcome_text: welcomeText, updated_at: new Date().toISOString() })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Konfigurasi bot tidak ditemukan.');
  return rows[0];
}

export function normalizeWhatsAppNumber(value) {
  let digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (digits.startsWith('8')) digits = `62${digits}`;
  if (!/^\d{8,15}$/.test(digits)) {
    throw new SettingsStorageError('Masukkan nomor WhatsApp dengan format internasional, misalnya 628123456789.');
  }
  return digits;
}

export async function updateWhatsAppNumber(botId, whatsappNumber) {
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ whatsapp_number: whatsappNumber, updated_at: new Date().toISOString() })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Konfigurasi bot tidak ditemukan.');
  return rows[0];
}

export function createBotSettings({ bot, token, currentSettings, webhookUrl }) {
  return {
    settingsId: currentSettings?.id || `bot-${bot.id}`,
    botId: bot.id,
    botFirstName: bot.firstName,
    botUsername: bot.username,
    tokenEncrypted: encrypt(token),
    webhookSecret: currentSettings?.webhook_secret || randomBytes(32).toString('base64url'),
    webhookUrl,
    welcomeText: currentSettings?.welcome_text || DEFAULT_WELCOME
  };
}

export function getDecryptedBotToken(settings) {
  return decrypt(settings.token_encrypted);
}

export function isBotSessionAuthorized(session, settings) {
  // getBotSession returns { sid, session }, while a few internal callers pass
  // the nested session object directly. Support both shapes consistently.
  const bot = session?.bot || session?.session?.bot;
  return Boolean(bot && settings && String(bot.id) === String(settings.bot_id));
}

export function safeSettings(settings) {
  return {
    bot: {
      id: settings.bot_id,
      firstName: settings.bot_first_name,
      username: settings.bot_username || ''
    },
    welcomeText: settings.welcome_text,
    whatsappNumber: settings.whatsapp_number || '',
    updatedAt: settings.updated_at,
    webhookUrl: settings.webhook_url
  };
}

export function getDefaultWelcomeText() {
  return DEFAULT_WELCOME;
}

export function secretMatches(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const actual = Buffer.from(received);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

// Variabel template welcome:
//   {mention}    → nama lengkap yang BISA DIKLIK ke profil customer
//                  (entitas text_mention, sehingga tidak butuh parse_mode).
//   {name}       → nama lengkap (sama dengan {full_name}).
//   {username}   → @username (otomatis bisa diklik oleh Telegram).
//   {id}         → ID numerik customer.
//   {first_name}/{last_name}/{full_name}/{chat_id} tetap didukung.
// Offset & length entitas dihitung dalam unit UTF-16 — di JavaScript itu
// persis String.length — sehingga emoji sebelum {mention} tidak merusak posisi.
export function renderWelcomeMessage(template, message) {
  const from = message?.from || {};
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Teman';
  const replacements = {
    first_name: firstName || 'Teman',
    last_name: lastName,
    full_name: fullName,
    name: fullName,
    username: from.username ? `@${from.username}` : '-',
    mention: fullName,
    id: String(from.id || message?.chat?.id || '-'),
    chat_id: String(message?.chat?.id || '')
  };

  // Template kosong/null (mis. baris lama di database) tidak boleh terkirim
  // apa adanya ke customer — gunakan pesan bawaan sebagai gantinya.
  const source = String(template || DEFAULT_WELCOME);
  const entities = [];
  let output = '';
  let cursor = 0;
  const pattern = /\{(mention|first_name|last_name|username|full_name|name|id|chat_id)\}/g;
  for (const match of source.matchAll(pattern)) {
    output += source.slice(cursor, match.index);
    const value = replacements[match[1]];
    if (match[1] === 'mention' && from.id) {
      entities.push({
        type: 'text_mention',
        offset: output.length,
        length: value.length,
        user: { id: Number(from.id), first_name: firstName || fullName }
      });
    }
    output += value;
    cursor = match.index + match[0].length;
  }
  output += source.slice(cursor);
  const text = output.slice(0, 4096);
  const safeEntities = text.length === output.length
    ? entities
    : entities.filter((entity) => entity.offset + entity.length <= text.length);
  return { text, entities: safeEntities };
}

export function renderWelcomeText(template, message) {
  return renderWelcomeMessage(template, message).text;
}

export async function telegramRequest(token, method, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    // This official endpoint embeds the BotFather token. Do not log its URL.
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    return { ok: Boolean(response.ok && result?.ok), result };
  } finally {
    clearTimeout(timeout);
  }
}

export async function configureTelegramWebhook(token, webhookUrl, webhookSecret) {
  const { ok } = await telegramRequest(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: webhookSecret,
    // Catalog buttons send callback_query updates; restricting this to only
    // messages causes Telegram's inline buttons to keep loading forever.
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false
  });
  return ok;
}

export async function sendTelegramMessage(token, chatId, text, replyMarkup = undefined) {
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const { ok } = await telegramRequest(token, 'sendMessage', payload);
  return ok;
}

export async function sendWelcomeMessage(token, chatId, text) {
  return sendTelegramMessage(token, chatId, text, {
    inline_keyboard: [[
      { text: '🛍 Lihat katalog', callback_data: 'open_catalog' }
    ]]
  });
}

export async function editTelegramMessage(token, chatId, messageId, text, replyMarkup = undefined) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const { ok } = await telegramRequest(token, 'editMessageText', payload);
  return ok;
}

export async function sendTelegramPhoto(token, chatId, photoUrl) {
  const { ok } = await telegramRequest(token, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl
  });
  return ok;
}

export async function answerCatalogCallback(token, callbackQueryId, text = '') {
  const payload = { callback_query_id: callbackQueryId };
  // Teks opsional tampil sebagai toast kecil sesaat tombol ditekan — umpan
  // balik loading instan sementara animasi matrix 1%→100% disiapkan.
  if (text) payload.text = String(text).slice(0, 190);
  const { ok } = await telegramRequest(token, 'answerCallbackQuery', payload);
  return ok;
}
