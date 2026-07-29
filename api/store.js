import { sendJson } from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getLatestTelegramSettings,
  getTelegramSettings,
  supabaseRequest
} from '../lib/telegram-settings.js';
import { formatRupiah, getPopularProducts, getProducts, whatsappOrderUrl } from '../lib/catalog-products.js';
import { getCategories, getCategoryProductCountRows } from '../lib/catalog-categories.js';
import { getStoreLogoUrl, storeLogoExists } from '../lib/product-images.js';

export const config = {
  api: { bodyParser: { sizeLimit: '8kb' } }
};

const PAGE_SIZE = 25;

function normalizeBotSlug(value) {
  return String(value || '').trim().replace(/^@/, '').slice(0, 80);
}

function clampPageSize(value) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, PAGE_SIZE) : PAGE_SIZE;
}

function safeOffset(value) {
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

function cleanQuery(value) {
  return String(value || '').trim().slice(0, 70);
}

function cleanSort(value) {
  return ['default', 'price-low', 'price-high', 'name'].includes(value) ? value : 'default';
}

function cleanCategoryId(value) {
  if (!value || value === 'all') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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

function storefrontDisplayName(settings) {
  const rawName = String(settings?.bot_first_name || '').trim();
  const withoutCatalogSuffix = rawName.replace(/\s+katalog\s*$/i, '').trim();
  return withoutCatalogSuffix || rawName || 'Rich Store';
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

    const url = new URL(req.url || '', `https://${req.headers.host || 'localhost'}`);
    const limit = clampPageSize(url.searchParams.get('limit'));
    const offset = safeOffset(url.searchParams.get('offset'));
    const query = cleanQuery(url.searchParams.get('q'));
    const categoryId = cleanCategoryId(url.searchParams.get('categoryId'));
    const sortMode = cleanSort(url.searchParams.get('sort'));
    const popularOnly = url.searchParams.get('popular') === '1' || url.searchParams.get('popularOnly') === 'true';

    const productPromise = popularOnly
      ? getPopularProducts(settings.bot_id, { limit: limit + 1, offset })
      : getProducts(settings.bot_id, { activeOnly: true, limit: limit + 1, offset, query, categoryId, sortMode });

    const [pageProductsRaw, popularProducts, categories, logoExists, categoryRows] = await Promise.all([
      productPromise,
      getPopularProducts(settings.bot_id, { limit: 100 }),
      getCategories(settings.bot_id),
      storeLogoExists(settings.bot_id),
      getCategoryProductCountRows(settings.bot_id)
    ]);

    const hasMore = pageProductsRaw.length > limit;
    const pageProducts = pageProductsRaw.slice(0, limit);
    const counts = categoryCounts(categoryRows);
    const popularIds = new Set(popularProducts.map((product) => Number(product.id)));
    const publicProducts = pageProducts.map((product) => ({
      ...publicProduct(product, settings.whatsapp_number),
      isPopular: Boolean(product.isPopular || popularIds.has(Number(product.id)))
    }));

    return sendJson(res, 200, {
      ok: true,
      store: {
        name: storefrontDisplayName(settings),
        username: settings.bot_username || '',
        whatsappNumber: settings.whatsapp_number || '',
        logoUrl: logoExists ? getStoreLogoUrl(settings.bot_id, settings.updated_at || '') : ''
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        total: counts.get(category.id) || 0
      })),
      stats: {
        totalProducts: categoryRows.length,
        totalCategories: categories.length,
        totalPopular: popularProducts.length
      },
      products: publicProducts,
      popularProductIds: [...popularIds],
      pagination: {
        limit,
        offset,
        count: publicProducts.length,
        hasMore,
        nextOffset: hasMore ? offset + limit : null
      }
    });
  } catch (error) {
    const status = error instanceof SettingsConfigurationError || error instanceof SettingsStorageError ? 503 : 500;
    return sendJson(res, status, { ok: false, message: 'Katalog web belum dapat dimuat.' });
  }
}
