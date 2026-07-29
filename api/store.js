import { sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getLatestTelegramSettings,
  getTelegramSettings,
  supabaseRequest
} from '../lib/telegram-settings.js';
import { MAX_PRODUCTS, formatRupiah, getPopularProducts, getProducts, whatsappOrderUrl } from '../lib/catalog-products.js';
import { getCategories } from '../lib/catalog-categories.js';

export const config = {
  api: { bodyParser: { sizeLimit: '8kb' } }
};

function normalizeBotSlug(value) {
  return String(value || '').trim().replace(/^@/, '').slice(0, 80);
}

async function getSettingsByUsername(username) {
  const clean = normalizeBotSlug(username);
  if (!clean) return null;
  const response = await supabaseRequest(`telegram_bot_settings?bot_username=eq.${encodeURIComponent(clean)}&select=*&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function resolveStoreSettings(req) {
  const url = new URL(req.url || '', `https://${req.headers.host || 'localhost'}`);
  const bot = normalizeBotSlug(url.searchParams.get('bot'));
  if (!bot) return getLatestTelegramSettings();
  if (/^\d{5,15}$/.test(bot)) return getTelegramSettings(bot);
  return getSettingsByUsername(bot);
}

function publicProduct(product, whatsappNumber) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    priceFormatted: formatRupiah(product.price),
    description: product.description || '',
    imageUrl: product.imageUrl || '',
    categoryId: product.categoryId,
    isPopular: product.isPopular,
    viewCount: product.viewCount,
    orderUrl: whatsappOrderUrl(whatsappNumber, product)
  };
}

function categoryCounts(products) {
  const counts = new Map();
  products.forEach((product) => {
    const id = Number(product.categoryId);
    if (Number.isSafeInteger(id) && id > 0) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}

export default async function store(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }

  try {
    const settings = await resolveStoreSettings(req);
    if (!settings) return sendJson(res, 404, { ok: false, message: 'Katalog belum tersedia.' });

    const [products, popularProducts, categories] = await Promise.all([
      getProducts(settings.bot_id, { activeOnly: true, limit: MAX_PRODUCTS }),
      getPopularProducts(settings.bot_id, { limit: 24 }),
      getCategories(settings.bot_id)
    ]);

    const counts = categoryCounts(products);
    const popularIds = new Set(popularProducts.map((product) => Number(product.id)));
    const publicProducts = products.map((product) => ({
      ...publicProduct(product, settings.whatsapp_number),
      isPopular: Boolean(product.isPopular || popularIds.has(Number(product.id)))
    }));

    return sendJson(res, 200, {
      ok: true,
      store: {
        name: settings.bot_first_name || 'Katalog Store',
        username: settings.bot_username || '',
        whatsappNumber: settings.whatsapp_number || ''
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        total: counts.get(category.id) || 0
      })),
      products: publicProducts,
      popularProductIds: [...popularIds]
    });
  } catch (error) {
    const status = error instanceof SettingsConfigurationError || error instanceof SettingsStorageError ? 503 : 500;
    return sendJson(res, status, { ok: false, message: 'Katalog web belum dapat dimuat.' });
  }
}
