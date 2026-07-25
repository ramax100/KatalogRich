import { getJsonBody, sendJson } from '../../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  answerCatalogCallback,
  getDecryptedBotToken,
  getTelegramSettingsByWebhookSecret,
  renderWelcomeMessage,
  secretMatches,
  sendTelegramMessage,
  sendTelegramVisual,
  telegramRequest
} from '../../lib/telegram-settings.js';
import {
  catalogListText,
  getProducts,
  getPopularProducts,
  incrementProductView,
  productDetailText,
  whatsappOrderUrl
} from '../../lib/catalog-products.js';
import { categoryListText, getCategories, getCategoryById, getCategoryProductCountRows, resolveCategoryByNumber } from '../../lib/catalog-categories.js';
import { getChatMenuContext, rememberCustomerChat, setChatMenuContext } from '../../lib/customer-chats.js';

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } }
};

const PAGE_SIZE = 10;
const ALL_PRODUCTS_BUTTON_TEXT = '📋 Semua produk';
const SEARCH_HELP_TEXT = '🔎 Cari produk\n\nKetik nama atau kata kunci produk minimal 2 karakter.\nContoh: tumbler\n\nAtau gunakan perintah: /cari tumbler';

function allProductsButton() {
  return { text: ALL_PRODUCTS_BUTTON_TEXT, callback_data: 'catalog_page:0' };
}

function allProductsRow() {
  return [allProductsButton()];
}

function allProductsKeyboard() {
  return { inline_keyboard: [allProductsRow()] };
}

function categoryMenuKeyboard() {
  return {
    inline_keyboard: [
      allProductsRow(),
      [{ text: '🔎 Cari produk', callback_data: 'search_help' }]
    ]
  };
}

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

// === Loading instan 1% → 100% =============================================
// Loading tetap muncul langsung di 1%, lalu bergerak singkat sampai 100%
// sebelum berubah menjadi konten akhir. Animasi berjalan paralel dengan proses
// ambil data, jadi indikator terlihat lengkap tanpa membuat bot terasa lambat.
const LOADING_LABELS = {
  catalog: 'Memuat katalog',
  popular: 'Memuat produk populer',
  category: 'Memuat kategori',
  search: 'Memuat hasil pencarian'
};
const LOADING_STEPS = [35, 70, 100];
const LOADING_STEP_DELAY_MS = 80;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadingFrameText(label, percent = 1) {
  const safePercent = Math.max(1, Math.min(100, Number(percent) || 1));
  const filled = Math.max(1, Math.min(10, Math.round(safePercent / 10)));
  return `⏳ ${label}
${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${safePercent}%`;
}

function contentPayload(content) {
  const payload = { text: content.text, disable_web_page_preview: true };
  if (content.replyMarkup) payload.reply_markup = content.replyMarkup;
  if (content.entities?.length) payload.entities = content.entities;
  return payload;
}

async function startLoadingMessage(token, chatId, label) {
  const { ok, result } = await telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: loadingFrameText(label, 1)
  }).catch(() => ({ ok: false }));
  return ok && result?.result?.message_id ? result.result.message_id : null;
}

async function playLoadingToComplete(token, chatId, messageId, label) {
  for (const step of LOADING_STEPS) {
    await sleep(LOADING_STEP_DELAY_MS);
    await telegramRequest(token, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: loadingFrameText(label, step)
    }).catch(() => null);
  }
}

async function sendContentMessage(token, chatId, content) {
  const { ok } = await telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    ...contentPayload(content)
  }).catch(() => ({ ok: false }));
  return Boolean(ok);
}

async function editContentMessage(token, chatId, messageId, content) {
  const { ok } = await telegramRequest(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    ...contentPayload(content)
  }).catch(() => ({ ok: false }));
  return Boolean(ok);
}

async function deleteMessage(token, chatId, messageId) {
  if (!messageId) return false;
  const { ok } = await telegramRequest(token, 'deleteMessage', {
    chat_id: chatId,
    message_id: messageId
  }).catch(() => ({ ok: false }));
  return Boolean(ok);
}

async function deliverContent(token, chatId, content, options = {}) {
  if (options.loadingMessageId) {
    await playLoadingToComplete(token, chatId, options.loadingMessageId, options.loadingLabel || 'Memuat');
    return editContentMessage(token, chatId, options.loadingMessageId, content);
  }
  return sendContentMessage(token, chatId, content);
}

async function sendWithLoading(token, chatId, label, loadContent, options = {}) {
  const loadingId = options.loadingMessageId || await startLoadingMessage(token, chatId, label);
  const contentPromise = Promise.resolve().then(loadContent);
  if (loadingId) {
    const animationPromise = playLoadingToComplete(token, chatId, loadingId, label);
    const [content] = await Promise.all([contentPromise, animationPromise]);
    return editContentMessage(token, chatId, loadingId, content);
  }
  const content = await contentPromise;
  return sendContentMessage(token, chatId, content);
}

async function editWithLoading(token, chatId, messageId, label, loadContent) {
  await telegramRequest(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: loadingFrameText(label, 1)
  }).catch(() => null);
  const contentPromise = Promise.resolve().then(loadContent);
  const animationPromise = playLoadingToComplete(token, chatId, messageId, label);
  const [content] = await Promise.all([contentPromise, animationPromise]);
  return editContentMessage(token, chatId, messageId, content);
}

function pageKeyboard(kind, offset, hasMore, state = {}) {
  const navigation = [];
  if (offset > 0) navigation.push({ text: '‹ Sebelumnya', callback_data: callbackFor(kind, Math.max(0, offset - PAGE_SIZE), state) });
  if (hasMore) navigation.push({ text: 'Selanjutnya ›', callback_data: callbackFor(kind, offset + PAGE_SIZE, state) });

  // Di halaman semua produk/katalog, tombol "Semua produk" tidak perlu
  // ditampilkan karena customer sudah berada di daftar utama.
  if (kind === 'catalog') {
    const rows = [
      [...navigation, { text: '🔥 Produk populer', callback_data: 'popular_page:0' }],
      [
        { text: '📂 Kategori', callback_data: 'category_menu' },
        { text: '🔎 Cari produk', callback_data: 'search_help' }
      ]
    ];
    return { inline_keyboard: rows };
  }

  const rows = navigation.length ? [navigation] : [];
  rows.push(allProductsRow());
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
    if (!category) return { products: [], title: '📂 Kategori tidak ditemukan', keyboard: allProductsKeyboard() };
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

function searchKeywordLength(value) {
  return [...String(value || '').trim()].length;
}

async function sendSearchHelp(token, chatId, botId, options = {}) {
  const delivered = await sendWithLoading(token, chatId, 'Menyiapkan pencarian', async () => ({
    text: SEARCH_HELP_TEXT,
    replyMarkup: allProductsKeyboard()
  }), options);
  if (delivered) await noteMenuContext(botId, chatId, 'search_prompt');
  return delivered;
}

async function sendSearchTooShort(token, chatId, botId, options = {}) {
  const delivered = await deliverContent(token, chatId, { text: `Kata kunci pencarian minimal 2 karakter.\n\n${SEARCH_HELP_TEXT}`, replyMarkup: allProductsKeyboard() }, options);
  if (delivered) await noteMenuContext(botId, chatId, 'search_prompt');
  return delivered;
}

async function handleSearchRequest(token, chatId, botId, rawQuery, options = {}) {
  const raw = String(rawQuery || '').trim();
  if (!raw) return sendSearchHelp(token, chatId, botId, options);
  const query = compactSearchQuery(raw);
  if (searchKeywordLength(query) < 2) return sendSearchTooShort(token, chatId, botId, options);
  return sendCatalogPage(token, chatId, botId, 'search', 0, { query }, options);
}

async function sendCatalogPage(token, chatId, botId, kind = 'catalog', offset = 0, state = {}, options = {}) {
  const label = LOADING_LABELS[kind] || 'Memuat katalog';
  const delivered = await sendWithLoading(token, chatId, label, async () => {
    const page = await getCatalogPage(botId, kind, offset, state);
    return { text: catalogListText(page.products, page.title, page.startNumber), replyMarkup: page.keyboard };
  }, options);
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

function productListContextOrDefault(context) {
  return typeof context === 'string' && (context === 'products' || context.startsWith('products:')) ? context : 'products';
}

async function sendProductDetail(token, chatId, botId, product, whatsappNumber, listContext = 'products', options = {}) {
  const orderUrl = whatsappOrderUrl(whatsappNumber, product);
  // Tombol box kembali selalu ada: customer tidak perlu mengetik /katalog lagi
  // setelah membaca detail (atau menekan Pesan sekarang lalu kembali).
  const backToCatalog = allProductsButton();
  const replyMarkup = orderUrl
    ? { inline_keyboard: [[{ text: '🛒 Pesan sekarang', url: orderUrl }], [backToCatalog]] }
    : { inline_keyboard: [[backToCatalog]] };
  const contactHint = orderUrl
    ? '\n\nKlik Pesan sekarang untuk melanjutkan pemesanan via WhatsApp.'
    : '\n\nGunakan tombol di bawah untuk kembali ke semua produk.';
  const detailText = `${productDetailText(product)}${contactHint}`;

  // Tanpa gambar: cukup pakai alur loading → teks detail seperti biasa.
  if (!product.imageUrl) {
    const delivered = await sendWithLoading(token, chatId, 'Memuat detail produk', async () => ({
      text: detailText,
      replyMarkup
    }), options);
    if (delivered) await noteMenuContext(botId, chatId, productListContextOrDefault(listContext));
    return delivered;
  }

  // Dengan gambar: loading tetap muncul dan berjalan sampai 100%, lalu loading
  // dihapus sehingga hasil akhir rapi: FOTO di atas, teks/caption + tombol
  // Pesan sekarang di bawah. Ini menghindari kasus teks detail berada di atas
  // foto karena pesan loading diedit menjadi teks.
  const label = 'Memuat detail produk';
  const loadingId = options.loadingMessageId || await startLoadingMessage(token, chatId, label);
  if (loadingId) await playLoadingToComplete(token, chatId, loadingId, label);

  let delivered = false;
  if (detailText.length <= 1024) {
    delivered = await sendTelegramVisual(token, chatId, product.imageUrl, detailText, replyMarkup).catch(() => false);
  } else {
    const visualSent = await sendTelegramVisual(token, chatId, product.imageUrl).catch(() => false);
    const textSent = visualSent
      ? await sendContentMessage(token, chatId, { text: detailText, replyMarkup })
      : false;
    delivered = visualSent && textSent;
  }

  if (delivered) {
    if (loadingId) await deleteMessage(token, chatId, loadingId).catch(() => false);
    await noteMenuContext(botId, chatId, productListContextOrDefault(listContext));
    return true;
  }

  // Fallback kalau Telegram gagal mengirim foto/GIF: detail tetap tampil dengan
  // tombol, meskipun tanpa media.
  const fallbackDelivered = loadingId
    ? await editContentMessage(token, chatId, loadingId, { text: detailText, replyMarkup })
    : await sendContentMessage(token, chatId, { text: detailText, replyMarkup });
  if (fallbackDelivered) await noteMenuContext(botId, chatId, productListContextOrDefault(listContext));
  return fallbackDelivered;
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
    if (privateChatId) void rememberCustomerChat(settings.bot_id, privateChatId).catch(() => {});

    if (callback?.id) {
      const token = getDecryptedBotToken(settings);
      const callbackData = String(callback.data || '');

      if (callbackData === 'category_menu') {
        // Toast muncul seketika tombol ditekan, konten kategori langsung dimuat.
        const acknowledgedPromise = answerCatalogCallback(token, callback.id, 'Memuat kategori…');
        const delivered = callback.message?.chat?.id && callback.message?.message_id
          ? await editWithLoading(token, callback.message.chat.id, callback.message.message_id, 'Memuat kategori', async () => {
            const [categories, products] = await Promise.all([
              getCategories(settings.bot_id),
              getCategoryProductCountRows(settings.bot_id)
            ]);
            return {
              text: categoryListText(categories, products),
              replyMarkup: categoryMenuKeyboard()
            };
          })
          : false;
        const acknowledged = await acknowledgedPromise;
        if (delivered) await noteMenuContext(settings.bot_id, callback.message.chat.id, 'categories');
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }

      if (callbackData === 'search_help') {
        const acknowledgedPromise = answerCatalogCallback(token, callback.id, 'Menyiapkan pencarian…');
        const delivered = callback.message?.chat?.id
          ? await sendSearchHelp(token, callback.message.chat.id, settings.bot_id)
          : false;
        const acknowledged = await acknowledgedPromise;
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }

      const page = callbackData === 'open_catalog'
        ? { kind: 'catalog', offset: 0, state: {}, isNewMessage: true }
        : parsePageCallback(callbackData);
      if (page) {
        const acknowledgedPromise = answerCatalogCallback(token, callback.id, `${LOADING_LABELS[page.kind] || 'Memuat katalog'}…`);
        const chatId = callback.message?.chat?.id;
        // Pesan detail produk bergambar adalah message media/caption. Telegram
        // tidak bisa mengubah pesan media itu menjadi teks katalog lewat
        // editMessageText; kalau dipaksa tombol terlihat loading terus. Jadi
        // untuk callback dari pesan non-teks, kirim katalog sebagai pesan baru.
        const canEditAsText = !page.isNewMessage && typeof callback.message?.text === 'string';
        const delivered = canEditAsText
          ? await editCatalogPage(token, callback.message, settings.bot_id, page.kind, page.offset, page.state)
          : await sendCatalogPage(token, chatId, settings.bot_id, page.kind, page.offset, page.state);
        const acknowledged = await acknowledgedPromise;
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
            getCategoryProductCountRows(settings.bot_id)
          ]);
          return { text: categoryListText(categories, products), replyMarkup: categoryMenuKeyboard() };
        });
        if (delivered) await noteMenuContext(settings.bot_id, message.chat.id, 'categories');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      const loadingId = await startLoadingMessage(token, message.chat.id, 'Memuat kategori');
      const loadingOptions = loadingId ? { loadingMessageId: loadingId, loadingLabel: 'Memuat kategori' } : {};
      const categories = await getCategories(settings.bot_id);
      // Nomor mengikuti nomor urut pada daftar ([1], [2], ...), bukan ID database.
      const category = resolveCategoryByNumber(categories, categoryMatch[1]);
      if (!category) {
        const products = await getCategoryProductCountRows(settings.bot_id);
        const delivered = await deliverContent(token, message.chat.id, {
          text: `Nomor kategori tidak ditemukan.\n\n${categoryListText(categories, products)}`,
          replyMarkup: categoryMenuKeyboard()
        }, loadingOptions);
        if (delivered) await noteMenuContext(settings.bot_id, message.chat.id, 'categories');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'category', 0, { categoryId: category.id }, loadingOptions);
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    const searchMatch = /^\/cari(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(messageText);
    if (searchMatch) {
      const delivered = await handleSearchRequest(token, message.chat.id, settings.bot_id, searchMatch[1] || '');
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    const numberMatch = /^(\d{1,10})$/.exec(messageText);
    if (numberMatch) {
      // Angka polos mengikuti konteks menu terakhir TANPA batas waktu: setelah
      // daftar kategori tampil, angka selalu membuka kategori (cukup ketik
      // "2"); setelah daftar/detail produk tampil, angka membuka produk.
      // Konteks ditimpa setiap kali bot menampilkan menu baru.
      const loadingId = await startLoadingMessage(token, message.chat.id, 'Memuat pilihan');
      const loadingOptions = loadingId ? { loadingMessageId: loadingId, loadingLabel: 'Memuat pilihan' } : {};
      const menu = await getChatMenuContext(settings.bot_id, message.chat.id).catch(() => null);
      if (menu?.context === 'search_prompt') {
        const delivered = await handleSearchRequest(token, message.chat.id, settings.bot_id, numberMatch[1], loadingOptions);
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      if (menu?.context === 'categories') {
        const [categories, products] = await Promise.all([
          getCategories(settings.bot_id),
          getCategoryProductCountRows(settings.bot_id)
        ]);
        const category = resolveCategoryByNumber(categories, numberMatch[1]);
        if (category) {
          const opened = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'category', 0, { categoryId: category.id }, loadingOptions);
          return sendJson(res, opened ? 200 : 502, { ok: opened });
        }
        const delivered = await deliverContent(token, message.chat.id, {
          text: `Nomor kategori tidak ditemukan.\n\n${categoryListText(categories, products)}`,
          replyMarkup: categoryMenuKeyboard()
        }, loadingOptions);
        if (delivered) await noteMenuContext(settings.bot_id, message.chat.id, 'categories');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      // Nomor dibaca pada daftar yang sama dengan yang barusan tampil
      // (katalog utama, populer, kategori, atau hasil pencarian).
      const listContext = productListContextOrDefault(menu?.context);
      const product = await findProductByListNumber(settings.bot_id, listContext, numberMatch[1]);
      if (!product) {
        const delivered = await deliverContent(token, message.chat.id, { text: 'Nomor produk tidak ditemukan. Ketik /katalog untuk melihat daftar produk.', replyMarkup: allProductsKeyboard() }, loadingOptions);
        if (delivered) await noteMenuContext(settings.bot_id, message.chat.id, listContext);
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      void incrementProductView(settings.bot_id, product).catch(() => {});
      const delivered = await sendProductDetail(token, message.chat.id, settings.bot_id, product, settings.whatsapp_number, listContext, loadingOptions);
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    // Ordinary text is a product-name/description search.
    if (messageText && !messageText.startsWith('/')) {
      const delivered = await handleSearchRequest(token, message.chat.id, settings.bot_id, messageText);
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    if (!/^\/start(?:\s|$)/i.test(messageText)) return sendJson(res, 200, { ok: true });
    // Customer ini sudah dicatat sebagai penerima Kirim Pesan saat update masuk di atas.
    // Loading sapaan muncul dulu agar customer langsung melihat indikator,
    // termasuk saat welcome memakai gambar/GIF yang perlu waktu dikirim.
    // Kegagalan foto tidak pernah menggagalkan sapaan.
    const loadingId = await startLoadingMessage(token, message.chat.id, 'Menyiapkan sapaan');
    if (settings.welcome_image_url) {
      await sendTelegramVisual(token, message.chat.id, settings.welcome_image_url).catch(() => false);
    }
    const welcome = renderWelcomeMessage(settings.welcome_text, message);
    const delivered = await sendWithLoading(token, message.chat.id, 'Menyiapkan sapaan', async () => ({
      text: welcome.text,
      entities: welcome.entities,
      replyMarkup: { inline_keyboard: [[{ text: '🛍 Lihat katalog', callback_data: 'open_catalog' }]] }
    }), loadingId ? { loadingMessageId: loadingId, loadingLabel: 'Menyiapkan sapaan' } : {});
    return sendJson(res, delivered ? 200 : 502, { ok: delivered });
  } catch (error) {
    const status = error instanceof SettingsConfigurationError || error instanceof SettingsStorageError ? 503 : 500;
    return sendJson(res, status, { ok: false });
  }
}
