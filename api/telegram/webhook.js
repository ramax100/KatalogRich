import { getJsonBody, sendJson } from '../../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  answerCatalogCallback,
  getDecryptedBotToken,
  getTelegramSettingsByWebhookSecret,
  renderWelcomeText,
  secretMatches,
  sendTelegramMessage,
  sendTelegramPhoto,
  telegramRequest
} from '../../lib/telegram-settings.js';
import {
  MAX_PRODUCTS,
  catalogListText,
  getProducts,
  getPopularProducts,
  incrementProductView,
  productDetailText,
  whatsappOrderUrl
} from '../../lib/catalog-products.js';
import { categoryListText, getCategories, getCategoryById, resolveCategoryByNumber } from '../../lib/catalog-categories.js';
import { getChatMenuContext, rememberCustomerChat, setChatMenuContext } from '../../lib/customer-chats.js';

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } }
};

const PAGE_SIZE = 10;

function safeOffset(value) {
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 ? Math.floor(offset / PAGE_SIZE) * PAGE_SIZE : 0;
}

function compactSearchQuery(value) {
  const source = String(value || '').trim().slice(0, 70);
  const bytes = Buffer.from(source, 'utf8').subarray(0, 30);
  return bytes.toString('utf8').trim();
}

function encodeSearchQuery(query) {
  return Buffer.from(compactSearchQuery(query), 'utf8').toString('base64url');
}

function decodeSearchQuery(encoded) {
  try {
    return compactSearchQuery(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return '';
  }
}

function callbackFor(kind, offset, state = {}) {
  if (kind === 'catalog') return `catalog_page:${offset}`;
  if (kind === 'popular') return `popular_page:${offset}`;
  if (kind === 'category') return `category_page:${state.categoryId}:${offset}`;
  if (kind === 'search') return `search_page:${encodeSearchQuery(state.query)}:${offset}`;
  return 'catalog_page:0';
}

// === Loading matrix 1% → 100% ============================================
// Setiap konten yang dimuat bot (katalog, populer, kategori, pencarian,
// detail produk, sapaan) didahului pesan loading dengan bar matrix yang berjalan
// dari 1% hingga 100%; pesan yang sama kemudian berubah menjadi konten akhir,
// sehingga chat tetap rapi. Semua bingkai bersifat best effort — kegagalan satu
// bingkai (mis. dibatasi Telegram) tidak pernah menggagalkan konten akhir.
const LOADING_STEPS = [35, 70, 100];
const LOADING_STEP_DELAY_MS = 420;
const LOADING_LABELS = {
  catalog: 'Memuat katalog',
  popular: 'Memuat produk populer',
  category: 'Memuat kategori',
  search: 'Memuat hasil pencarian'
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadingFrameText(label, percent) {
  const filled = Math.max(1, Math.min(10, Math.round(percent / 10)));
  return `⏳ ${label}\n${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${percent}%`;
}

async function startLoadingMessage(token, chatId, label) {
  try {
    const { ok, result } = await telegramRequest(token, 'sendMessage', { chat_id: chatId, text: loadingFrameText(label, 1) });
    return ok && result?.result?.message_id ? result.result.message_id : null;
  } catch {
    return null;
  }
}

async function playLoadingFrames(token, chatId, messageId, label) {
  for (const step of LOADING_STEPS) {
    await sleep(LOADING_STEP_DELAY_MS);
    await telegramRequest(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text: loadingFrameText(label, step) }).catch(() => null);
  }
}

// Kirim loading 1% → bingkai lanjutan → 100%, lalu pesan yang sama berubah
// menjadi konten hasil loadContent(). Bila pesan loading gagal terkirim,
// konten dikirim langsung sebagai pesan baru (pengalaman lama tetap utuh).
async function sendWithLoading(token, chatId, label, loadContent) {
  const loadingId = await startLoadingMessage(token, chatId, label);
  const content = await loadContent();
  if (!loadingId) {
    const payload = { chat_id: chatId, text: content.text, disable_web_page_preview: true };
    if (content.replyMarkup) payload.reply_markup = content.replyMarkup;
    const { ok } = await telegramRequest(token, 'sendMessage', payload).catch(() => ({ ok: false }));
    return Boolean(ok);
  }
  await playLoadingFrames(token, chatId, loadingId, label);
  const payload = { chat_id: chatId, message_id: loadingId, text: content.text, disable_web_page_preview: true };
  if (content.replyMarkup) payload.reply_markup = content.replyMarkup;
  const { ok } = await telegramRequest(token, 'editMessageText', payload).catch(() => ({ ok: false }));
  return Boolean(ok);
}

// Versi in-place untuk pesan yang sudah ada (navigasi halaman, menu kategori
// dari tombol, tombol Kembali ke katalog): pesan itu sendiri yang memutar
// animasi 1% → 100% lalu menjadi konten baru.
async function editWithLoading(token, chatId, messageId, label, loadContent) {
  await telegramRequest(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text: loadingFrameText(label, 1) }).catch(() => null);
  const content = await loadContent();
  await playLoadingFrames(token, chatId, messageId, label);
  const payload = { chat_id: chatId, message_id: messageId, text: content.text, disable_web_page_preview: true };
  if (content.replyMarkup) payload.reply_markup = content.replyMarkup;
  const { ok } = await telegramRequest(token, 'editMessageText', payload).catch(() => ({ ok: false }));
  return Boolean(ok);
}

function pageKeyboard(kind, offset, hasMore, state = {}) {
  const navigation = [];
  if (offset > 0) navigation.push({ text: '‹ Sebelumnya', callback_data: callbackFor(kind, Math.max(0, offset - PAGE_SIZE), state) });
  if (hasMore) navigation.push({ text: 'Selanjutnya ›', callback_data: callbackFor(kind, offset + PAGE_SIZE, state) });

  // Tombol box untuk melompat kembali ke halaman pertama — hanya muncul saat
  // customer sudah sampai di produk-produk terakhir (tidak ada Selanjutnya
  // lagi) supaya tidak perlu menekan Sebelumnya berkali-kali.
  const backToStartRow = offset > 0 && !hasMore
    ? [{ text: '⏮ Kembali ke produk awal', callback_data: callbackFor(kind, 0, state) }]
    : null;

  // On the main catalog, show exactly the requested navigation and popular boxes.
  if (kind === 'catalog') {
    const navigationRow = [...navigation, { text: '🔥 Produk populer', callback_data: 'popular_page:0' }];
    const rows = [
      navigationRow,
      [
        { text: '📂 Kategori', callback_data: 'category_menu' },
        { text: '🔎 Cari produk', callback_data: 'search_help' }
      ]
    ];
    if (backToStartRow) rows.splice(1, 0, backToStartRow);
    return { inline_keyboard: rows };
  }

  const rows = navigation.length ? [navigation] : [];
  if (backToStartRow) rows.push(backToStartRow);
  rows.push([{ text: '📋 Semua produk', callback_data: 'catalog_page:0' }]);
  return { inline_keyboard: rows };
}

async function getCatalogPage(botId, kind, offset = 0, state = {}) {
  const safePageOffset = safeOffset(offset);
  const fetchOptions = { activeOnly: true, limit: PAGE_SIZE + 1, offset: safePageOffset };
  let products;
  let title = '🛍 Katalog Produk';

  if (kind === 'popular') {
    products = await getPopularProducts(botId, { limit: PAGE_SIZE + 1, offset: safePageOffset });
    title = '🔥 Produk Populer';
  } else if (kind === 'category') {
    const category = await getCategoryById(botId, state.categoryId);
    if (!category) return { products: [], title: '📂 Kategori tidak ditemukan', keyboard: { inline_keyboard: [[{ text: '📋 Semua produk', callback_data: 'catalog_page:0' }]] } };
    products = await getProducts(botId, { ...fetchOptions, categoryId: category.id });
    title = `📂 ${category.name}`;
  } else if (kind === 'search') {
    const query = compactSearchQuery(state.query);
    products = await getProducts(botId, { ...fetchOptions, query });
    title = `🔎 Hasil pencarian: ${query || '-'}`;
  } else {
    products = await getProducts(botId, fetchOptions);
  }

  const hasMore = products.length > PAGE_SIZE;
  const pageProducts = products.slice(0, PAGE_SIZE);
  return {
    products: pageProducts,
    title,
    startNumber: safePageOffset + 1,
    keyboard: pageKeyboard(kind, safePageOffset, hasMore, state)
  };
}

// Konteks menu mencatat daftar mana yang barusan tampil sehingga angka polos
// berikut dibaca pada daftar yang sama: nomor mengikuti URUTAN TAMPIL (produk
// tersembunyi tidak pernah menyisakan lubang nomor). Nilai disimpan sebagai
// teks pendek; format lama ('products' / 'categories') tetap valid.
function contextForPage(kind, state = {}) {
  if (kind === 'popular') return 'products:popular';
  if (kind === 'category') {
    const categoryId = Number(state.categoryId);
    return Number.isSafeInteger(categoryId) && categoryId > 0 ? `products:category:${categoryId}` : 'products';
  }
  if (kind === 'search') {
    const query = compactSearchQuery(state.query);
    return query ? `products:search:${query}` : 'products';
  }
  return 'products';
}

// Ambil produk ke-N dari daftar yang sama dengan yang barusan ditampilkan ke
// customer. Urutan query persis sama dengan pembuatan halaman (sort_order.asc,
// atau peringkat populer), sehingga nomor [N] di pesan selalu produk ke-N di
// daftar tersebut.
async function findProductByListNumber(botId, context, number) {
  const position = Number(number);
  if (!Number.isSafeInteger(position) || position < 1) return null;
  const page = { limit: 1, offset: position - 1 };
  if (typeof context === 'string') {
    if (context === 'products:popular') {
      return (await getPopularProducts(botId, page))[0] || null;
    }
    if (context.startsWith('products:category:')) {
      const categoryId = Number(context.slice('products:category:'.length));
      if (Number.isSafeInteger(categoryId) && categoryId > 0) {
        return (await getProducts(botId, { activeOnly: true, categoryId, ...page }))[0] || null;
      }
    } else if (context.startsWith('products:search:')) {
      return (await getProducts(botId, { activeOnly: true, query: context.slice('products:search:'.length), ...page }))[0] || null;
    }
  }
  return (await getProducts(botId, { activeOnly: true, ...page }))[0] || null;
}

// Catat konteks menu yang baru ditampilkan (best effort — kegagalan pencatatan
// tidak pernah mengganggu balasan bot). Inilah yang membuat angka polos berikut
// bermakna benar: nomor kategori saat daftar kategori barusan tampil, nomor
// produk saat daftar produk barusan tampil.
async function noteMenuContext(botId, chatId, context) {
  await setChatMenuContext(botId, chatId, context).catch(() => {});
}

async function sendCatalogPage(token, chatId, botId, kind = 'catalog', offset = 0, state = {}) {
  const label = LOADING_LABELS[kind] || 'Memuat katalog';
  const delivered = await sendWithLoading(token, chatId, label, async () => {
    const page = await getCatalogPage(botId, kind, offset, state);
    return { text: catalogListText(page.products, page.title, page.startNumber), replyMarkup: page.keyboard };
  });
  if (delivered) await noteMenuContext(botId, chatId, contextForPage(kind, state));
  return delivered;
}

async function editCatalogPage(token, message, botId, kind, offset = 0, state = {}) {
  if (!message?.chat?.id || !message?.message_id) return false;
  const label = LOADING_LABELS[kind] || 'Memuat katalog';
  const delivered = await editWithLoading(token, message.chat.id, message.message_id, label, async () => {
    const page = await getCatalogPage(botId, kind, offset, state);
    return { text: catalogListText(page.products, page.title, page.startNumber), replyMarkup: page.keyboard };
  });
  if (delivered) await noteMenuContext(botId, message.chat.id, contextForPage(kind, state));
  return delivered;
}

function parsePageCallback(data) {
  let match = /^catalog_page:(\d+)$/.exec(data);
  if (match) return { kind: 'catalog', offset: safeOffset(match[1]), state: {} };
  match = /^popular_page:(\d+)$/.exec(data);
  if (match) return { kind: 'popular', offset: safeOffset(match[1]), state: {} };
  match = /^category_page:(\d+):(\d+)$/.exec(data);
  if (match) return { kind: 'category', offset: safeOffset(match[2]), state: { categoryId: Number(match[1]) } };
  match = /^search_page:([A-Za-z0-9_-]+):(\d+)$/.exec(data);
  if (match) {
    const query = decodeSearchQuery(match[1]);
    return query ? { kind: 'search', offset: safeOffset(match[2]), state: { query } } : null;
  }
  return null;
}

async function sendProductDetail(token, chatId, botId, product, whatsappNumber) {
  if (product.imageUrl) {
    const photoSent = await sendTelegramPhoto(token, chatId, product.imageUrl);
    if (!photoSent) return false;
  }
  const orderUrl = whatsappOrderUrl(whatsappNumber, product);
  // Tombol box kembali selalu ada: customer tidak perlu mengetik /katalog lagi
  // setelah membaca detail (atau menekan Pesan sekarang lalu kembali).
  const backToCatalog = { text: '📋 Kembali ke katalog', callback_data: 'catalog_page:0' };
  const replyMarkup = orderUrl
    ? { inline_keyboard: [[{ text: '🟢 Pesan sekarang', url: orderUrl }], [backToCatalog]] }
    : { inline_keyboard: [[backToCatalog]] };
  const contactHint = orderUrl
    ? '\n\nKlik Pesan sekarang untuk melanjutkan pemesanan via WhatsApp.'
    : '\n\nGunakan tombol di bawah untuk kembali ke daftar produk.';
  const delivered = await sendWithLoading(token, chatId, 'Memuat detail produk', async () => ({
    text: `${productDetailText(product)}${contactHint}`,
    replyMarkup
  }));
  if (delivered) await noteMenuContext(botId, chatId, 'products');
  return delivered;
}

export default async function telegramWebhook(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false });
  }

  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const settings = await getTelegramSettingsByWebhookSecret(secret);
    if (!settings || !secretMatches(secret, settings.webhook_secret)) return sendJson(res, 401, { ok: false });

    const update = getJsonBody(req);
    const callback = update?.callback_query;
    const message = update?.message;
    const messageText = typeof message?.text === 'string' ? message.text.trim() : '';

    // Daftarkan customer dari interaksi apa pun (bukan hanya /start) agar fitur
    // Kirim Pesan menjangkau semua orang yang pernah menghubungi bot. Hanya
    // chat privat yang dicatat — ID grup tidak boleh masuk daftar broadcast.
    // Non-blocking: kegagalan pencatatan tidak pernah mengganggu balasan bot.
    const privateChatId = (message?.chat?.type === 'private' && message.chat.id)
      || (callback?.message?.chat?.type === 'private' && callback.message.chat.id)
      || null;
    if (privateChatId) await rememberCustomerChat(settings.bot_id, privateChatId).catch(() => {});

    if (callback?.id) {
      const token = getDecryptedBotToken(settings);
      const callbackData = String(callback.data || '');

      if (callbackData === 'category_menu') {
        // Toast muncul seketika tombol ditekan, animasi matrix menyusul.
        const acknowledged = await answerCatalogCallback(token, callback.id, '⏳ Memuat kategori…');
        const delivered = callback.message?.chat?.id && callback.message?.message_id
          ? await editWithLoading(token, callback.message.chat.id, callback.message.message_id, 'Memuat kategori', async () => {
            const [categories, products] = await Promise.all([
              getCategories(settings.bot_id),
              getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS })
            ]);
            return {
              text: categoryListText(categories, products),
              replyMarkup: { inline_keyboard: [[{ text: '📋 Semua produk', callback_data: 'catalog_page:0' }], [{ text: '🔎 Cari produk', callback_data: 'search_help' }]] }
            };
          })
          : false;
        if (delivered) await noteMenuContext(settings.bot_id, callback.message.chat.id, 'categories');
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }

      if (callbackData === 'search_help') {
        const acknowledged = await answerCatalogCallback(token, callback.id, '⏳ Menyiapkan pencarian…');
        const delivered = callback.message?.chat?.id
          ? await sendWithLoading(token, callback.message.chat.id, 'Menyiapkan pencarian', async () => ({
            text: '🔎 Cari produk\n\nKetik nama atau kata kunci produk.\nContoh: tumbler\n\nAtau gunakan perintah: /cari tumbler'
          }))
          : false;
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }

      const page = callbackData === 'open_catalog'
        ? { kind: 'catalog', offset: 0, state: {}, isNewMessage: true }
        : parsePageCallback(callbackData);
      if (page) {
        const acknowledged = await answerCatalogCallback(token, callback.id, `⏳ ${LOADING_LABELS[page.kind] || 'Memuat katalog'}…`);
        const delivered = page.isNewMessage
          ? await sendCatalogPage(token, callback.message?.chat?.id, settings.bot_id, page.kind, page.offset, page.state)
          : await editCatalogPage(token, callback.message, settings.bot_id, page.kind, page.offset, page.state);
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }
    }

    if (!message?.chat?.id) return sendJson(res, 200, { ok: true });
    const token = getDecryptedBotToken(settings);

    // Perintah katalog menerima dua ejaan: /catalog (bawaan awal) dan /katalog
    // (ejaan Indonesia yang dipakai di panduan), keduanya membuka daftar produk.
    if (/^\/(?:catalog|katalog)(?:\s|$)/i.test(messageText)) {
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id);
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    if (/^\/populer(?:\s|$)/i.test(messageText)) {
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'popular');
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    const categoryMatch = /^\/kategori(?:\s+(\d+))?\s*$/i.exec(messageText);
    if (categoryMatch) {
      if (!categoryMatch[1]) {
        const delivered = await sendWithLoading(token, message.chat.id, 'Memuat kategori', async () => {
          const [categories, products] = await Promise.all([
            getCategories(settings.bot_id),
            getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS })
          ]);
          return { text: categoryListText(categories, products) };
        });
        if (delivered) await noteMenuContext(settings.bot_id, message.chat.id, 'categories');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      const categories = await getCategories(settings.bot_id);
      // Nomor mengikuti nomor urut pada daftar ([1], [2], ...), bukan ID database.
      const category = resolveCategoryByNumber(categories, categoryMatch[1]);
      if (!category) {
        const products = await getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS });
        const delivered = await sendTelegramMessage(token, message.chat.id, `Nomor kategori tidak ditemukan.\n\n${categoryListText(categories, products)}`);
        if (delivered) await noteMenuContext(settings.bot_id, message.chat.id, 'categories');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'category', 0, { categoryId: category.id });
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    const searchMatch = /^\/cari\s+(.{2,})$/i.exec(messageText);
    if (searchMatch) {
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'search', 0, { query: searchMatch[1] });
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    const numberMatch = /^(\d{1,10})$/.exec(messageText);
    if (numberMatch) {
      // Angka polos mengikuti konteks menu terakhir TANPA batas waktu: setelah
      // daftar kategori tampil, angka selalu membuka kategori (cukup ketik
      // "2"); setelah daftar/detail produk tampil, angka membuka produk.
      // Konteks ditimpa setiap kali bot menampilkan menu baru.
      const menu = await getChatMenuContext(settings.bot_id, message.chat.id).catch(() => null);
      if (menu?.context === 'categories') {
        const categories = await getCategories(settings.bot_id);
        const category = resolveCategoryByNumber(categories, numberMatch[1]);
        if (category) {
          const opened = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'category', 0, { categoryId: category.id });
          return sendJson(res, opened ? 200 : 502, { ok: opened });
        }
        // Nomor di luar daftar kategori → lanjut dibaca sebagai nomor produk.
      }
      // Nomor dibaca pada daftar yang sama dengan yang barusan tampil
      // (katalog utama, populer, kategori, atau hasil pencarian).
      const product = await findProductByListNumber(settings.bot_id, menu?.context, numberMatch[1]);
      if (!product) {
        const delivered = await sendTelegramMessage(token, message.chat.id, 'Nomor produk tidak ditemukan. Ketik /katalog untuk melihat daftar produk.');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      await incrementProductView(settings.bot_id, product);
      const delivered = await sendProductDetail(token, message.chat.id, settings.bot_id, product, settings.whatsapp_number);
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    // Ordinary text is a product-name/description search.
    if (messageText && !messageText.startsWith('/')) {
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'search', 0, { query: messageText });
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    if (!/^\/start(?:\s|$)/i.test(messageText)) return sendJson(res, 200, { ok: true });
    // Customer ini sudah dicatat sebagai penerima Kirim Pesan saat update masuk di atas.
    const welcomeText = renderWelcomeText(settings.welcome_text, message);
    const delivered = await sendWithLoading(token, message.chat.id, 'Menyiapkan sapaan', async () => ({
      text: welcomeText,
      replyMarkup: { inline_keyboard: [[{ text: '🛍 Lihat katalog', callback_data: 'open_catalog' }]] }
    }));
    return sendJson(res, delivered ? 200 : 502, { ok: delivered });
  } catch (error) {
    const status = error instanceof SettingsConfigurationError || error instanceof SettingsStorageError ? 503 : 500;
    return sendJson(res, status, { ok: false });
  }
}
