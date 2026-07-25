import { supabaseRequest } from './telegram-settings.js';

const TABLE = 'catalog_customer_chats';

// Telegram chat id adalah angka (negatif untuk grup, tetapi grup tidak pernah
// dicatat — webhook hanya mendaftarkan chat privat).
function normalizeChatId(value) {
  const chatId = String(value ?? '').trim();
  return /^-?\d{1,20}$/.test(chatId) ? chatId : null;
}

// Dicatat pada setiap interaksi customer dengan bot (bukan hanya /start),
// supaya daftar Kirim Pesan mencerminkan semua orang yang pernah menghubungi
// bot. Upsert atomik di database — aman dari race condition antar pesan yang
// tiba bersamaan, tidak ada lagi chat yang hilang seperti pada implementasi
// array JSON sebelumnya.
export async function rememberCustomerChat(botId, chatId) {
  const normalized = normalizeChatId(chatId);
  if (botId === undefined || botId === null || !normalized) return;
  await supabaseRequest('rpc/touch_catalog_customer', {
    method: 'POST',
    body: JSON.stringify({ p_bot_id: Number(botId), p_chat_id: normalized })
  });
}

export async function getCustomerAudienceCount(botId) {
  const response = await supabaseRequest(
    `${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&is_blocked=eq.false&select=chat_id&limit=1`,
    { headers: { Prefer: 'count=exact' } }
  );
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  if (Number.isSafeInteger(total)) return total;
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

// Urutan deterministik supaya pembagian batch bertahap (offset) stabil.
export async function getCustomerAudienceBatch(botId, { offset = 0, limit = 40 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const response = await supabaseRequest(
    `${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&is_blocked=eq.false&select=chat_id&order=first_seen_at.asc,chat_id.asc&limit=${safeLimit}&offset=${safeOffset}`
  );
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map((row) => normalizeChatId(row.chat_id)).filter(Boolean) : [];
}

// Konteks menu terakhir yang tampil di sebuah chat. Ini yang membuat customer
// bisa membuka kategori cukup dengan mengetik angkanya: setelah bot menampilkan
// daftar kategori konteksnya 'categories', setelah daftar produk konteksnya
// menyimpan daftar persis yang terlihat ('products', 'products:category:ID',
// 'products:popular', atau 'products:search:QUERY'). Saat bot meminta kata
// kunci pencarian, konteksnya 'search_prompt' sehingga angka seperti "123"
// tetap dipakai sebagai kata kunci, bukan nomor produk. KONTEKS BERLAKU TANPA
// BATAS WAKTU — ia selalu ditimpa setiap kali bot menampilkan menu baru,
// sehingga input polos selalu mengikuti layar terakhir yang benar-benar dilihat
// customer.
function normalizeMenuContext(context) {
  const value = String(context || '').trim();
  if (value === 'categories' || value === 'products' || value === 'products:popular' || value === 'search_prompt') return value;
  if (/^products:category:\d+$/.test(value)) return value;
  if (value.startsWith('products:search:')) {
    const query = value.slice('products:search:'.length).trim().slice(0, 70);
    return query ? `products:search:${query}` : null;
  }
  return null;
}

export async function setChatMenuContext(botId, chatId, context) {
  const normalized = normalizeChatId(chatId);
  const menuContext = normalizeMenuContext(context);
  if (botId === undefined || botId === null || !normalized || !menuContext) return;
  // Best effort: kalau kolom migrasi belum dibuat, gagalnya diabaikan pemanggil
  // dan bot berperilaku seperti semula.
  await supabaseRequest(
    `${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&chat_id=eq.${encodeURIComponent(normalized)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ menu_context: menuContext, menu_context_at: new Date().toISOString() })
    }
  );
}

export async function getChatMenuContext(botId, chatId) {
  const normalized = normalizeChatId(chatId);
  if (botId === undefined || botId === null || !normalized) return null;
  const response = await supabaseRequest(
    `${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&chat_id=eq.${encodeURIComponent(normalized)}&select=menu_context,menu_context_at&limit=1`
  );
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return { context: normalizeMenuContext(rows[0].menu_context), at: rows[0].menu_context_at || null };
}

// Menandai customer yang chatnya sudah tidak terjangkau (memblokir bot atau
// akun hilang) agar broadcast berikutnya tidak mencoba chat mati lagi.
export async function markCustomersBlocked(botId, chatIds) {
  const ids = [...new Set((Array.isArray(chatIds) ? chatIds : []).map(normalizeChatId).filter(Boolean))];
  if (!ids.length) return 0;
  const response = await supabaseRequest(
    `${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&chat_id=in.(${ids.join(',')})&select=chat_id`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ is_blocked: true, blocked_at: new Date().toISOString() })
    }
  );
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

// Menentukan apakah kegagalan sendMessage bersifat permanen untuk chat ini
// (bukan gangguan sementara yang masih layak dicoba lagi di broadcast berikutnya).
export function isUnreachableCustomerError(telegramResult) {
  const errorCode = Number(telegramResult?.result?.error_code);
  const description = String(telegramResult?.result?.description || '').toLowerCase();
  // 403: customer memblokir bot / menonaktifkan akun / bot dikeluarkan.
  if (errorCode === 403) return true;
  // 400: chat tidak ditemukan — akun customer sudah tidak ada.
  if (errorCode === 400 && (description.includes('chat not found') || description.includes('user not found'))) return true;
  return false;
}
