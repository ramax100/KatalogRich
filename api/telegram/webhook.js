import { getJsonBody, sendJson } from '../../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  answerCatalogCallback,
  editTelegramMessage,
  getDecryptedBotToken,
  getTelegramSettingsByWebhookSecret,
  renderWelcomeText,
  secretMatches,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendWelcomeMessage
} from '../../lib/telegram-settings.js';
import {
  MAX_PRODUCTS,
  catalogListText,
  getProductByOrder,
  getProducts,
  getPopularProducts,
  incrementProductView,
  productDetailText,
  whatsappOrderUrl
} from '../../lib/catalog-products.js';
import { categoryListText, getCategories, getCategoryById, resolveCategoryByNumber } from '../../lib/catalog-categories.js';
import { rememberCustomerChat } from '../../lib/customer-chats.js';

export const config = {
  api: { bodyParser: { sizeLimit: '32kb' } }
};

const PAGE_SIZE = 15;

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

function pageKeyboard(kind, offset, hasMore, state = {}) {
  const navigation = [];
  if (offset > 0) navigation.push({ text: '‹ Sebelumnya', callback_data: callbackFor(kind, Math.max(0, offset - PAGE_SIZE), state) });
  if (hasMore) navigation.push({ text: 'Selanjutnya ›', callback_data: callbackFor(kind, offset + PAGE_SIZE, state) });

  // On the main catalog, show exactly the requested navigation and popular boxes.
  if (kind === 'catalog') {
    const row = [...navigation, { text: '🔥 Produk populer', callback_data: 'popular_page:0' }];
    return {
      inline_keyboard: [
        row,
        [
          { text: '📂 Kategori', callback_data: 'category_menu' },
          { text: '🔎 Cari produk', callback_data: 'search_help' }
        ]
      ]
    };
  }

  if (kind === 'popular') {
    const rows = navigation.length ? [navigation] : [];
    rows.push([{ text: '📋 Semua produk', callback_data: 'catalog_page:0' }]);
    return { inline_keyboard: rows };
  }

  const rows = navigation.length ? [navigation] : [];
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
    keyboard: pageKeyboard(kind, safePageOffset, hasMore, state)
  };
}

async function sendCatalogPage(token, chatId, botId, kind = 'catalog', offset = 0, state = {}) {
  const page = await getCatalogPage(botId, kind, offset, state);
  return sendTelegramMessage(token, chatId, catalogListText(page.products, page.title), page.keyboard);
}

async function editCatalogPage(token, message, botId, kind, offset = 0, state = {}) {
  if (!message?.chat?.id || !message?.message_id) return false;
  const page = await getCatalogPage(botId, kind, offset, state);
  return editTelegramMessage(token, message.chat.id, message.message_id, catalogListText(page.products, page.title), page.keyboard);
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

async function sendProductDetail(token, chatId, product, whatsappNumber) {
  if (product.imageUrl) {
    const photoSent = await sendTelegramPhoto(token, chatId, product.imageUrl);
    if (!photoSent) return false;
  }
  const orderUrl = whatsappOrderUrl(whatsappNumber, product);
  const replyMarkup = orderUrl
    ? { inline_keyboard: [[{ text: '🟢 Pesan sekarang', url: orderUrl }]] }
    : undefined;
  const contactHint = orderUrl
    ? '\n\nKlik Pesan sekarang untuk melanjutkan pemesanan via WhatsApp.'
    : '\n\nKetik /catalog untuk kembali ke daftar produk.';
  return sendTelegramMessage(token, chatId, `${productDetailText(product)}${contactHint}`, replyMarkup);
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
        const acknowledged = await answerCatalogCallback(token, callback.id);
        const [categories, products] = await Promise.all([
          getCategories(settings.bot_id),
          getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS })
        ]);
        const delivered = callback.message?.chat?.id && callback.message?.message_id
          ? await editTelegramMessage(
            token,
            callback.message.chat.id,
            callback.message.message_id,
            categoryListText(categories, products),
            { inline_keyboard: [[{ text: '📋 Semua produk', callback_data: 'catalog_page:0' }], [{ text: '🔎 Cari produk', callback_data: 'search_help' }]] }
          )
          : false;
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }

      if (callbackData === 'search_help') {
        const acknowledged = await answerCatalogCallback(token, callback.id);
        const delivered = await sendTelegramMessage(token, callback.message?.chat?.id, '🔎 Cari produk\n\nKetik nama atau kata kunci produk.\nContoh: tumbler\n\nAtau gunakan perintah: /cari tumbler');
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }

      const page = callbackData === 'open_catalog'
        ? { kind: 'catalog', offset: 0, state: {}, isNewMessage: true }
        : parsePageCallback(callbackData);
      if (page) {
        const acknowledged = await answerCatalogCallback(token, callback.id);
        const delivered = page.isNewMessage
          ? await sendCatalogPage(token, callback.message?.chat?.id, settings.bot_id, page.kind, page.offset, page.state)
          : await editCatalogPage(token, callback.message, settings.bot_id, page.kind, page.offset, page.state);
        return sendJson(res, acknowledged && delivered ? 200 : 502, { ok: acknowledged && delivered });
      }
    }

    if (!message?.chat?.id) return sendJson(res, 200, { ok: true });
    const token = getDecryptedBotToken(settings);

    if (/^\/catalog(?:\s|$)/i.test(messageText)) {
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id);
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    if (/^\/populer(?:\s|$)/i.test(messageText)) {
      const delivered = await sendCatalogPage(token, message.chat.id, settings.bot_id, 'popular');
      return sendJson(res, delivered ? 200 : 502, { ok: delivered });
    }

    const categoryMatch = /^\/kategori(?:\s+(\d+))?\s*$/i.exec(messageText);
    if (categoryMatch) {
      const categories = await getCategories(settings.bot_id);
      if (!categoryMatch[1]) {
        const products = await getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS });
        const delivered = await sendTelegramMessage(token, message.chat.id, categoryListText(categories, products));
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      // Nomor mengikuti nomor urut pada daftar ([1], [2], ...), bukan ID database.
      const category = resolveCategoryByNumber(categories, categoryMatch[1]);
      if (!category) {
        const products = await getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS });
        const delivered = await sendTelegramMessage(token, message.chat.id, `Nomor kategori tidak ditemukan.\n\n${categoryListText(categories, products)}`);
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
      const product = await getProductByOrder(settings.bot_id, numberMatch[1], { activeOnly: true });
      if (!product) {
        const delivered = await sendTelegramMessage(token, message.chat.id, 'Nomor produk tidak ditemukan. Ketik /catalog untuk melihat daftar produk.');
        return sendJson(res, delivered ? 200 : 502, { ok: delivered });
      }
      await incrementProductView(settings.bot_id, product);
      const delivered = await sendProductDetail(token, message.chat.id, product, settings.whatsapp_number);
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
    const delivered = await sendWelcomeMessage(token, message.chat.id, welcomeText);
    return sendJson(res, delivered ? 200 : 502, { ok: delivered });
  } catch (error) {
    const status = error instanceof SettingsConfigurationError || error instanceof SettingsStorageError ? 503 : 500;
    return sendJson(res, status, { ok: false });
  }
}
