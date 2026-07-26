import { SettingsStorageError, supabaseRequest } from './telegram-settings.js';

const TABLE = 'catalog_products';
// Kapasitas katalog diperbesar dari 50 menjadi 5.000 produk — cukup untuk
// toko mana pun, sekaligus menjaga respons query tetap masuk akal. Jumlah
// produk dihitung lewat count=exact (murah, tanpa mengambil baris data).
export const MAX_PRODUCTS = 5000;
const DEFAULT_LIMIT = 20;

// Menerima harga dalam berbagai gaya penulisan Indonesia: 50000, 50.000,
// 50,000, 1.500.000, "Rp 50.000", bahkan 1.500,50. Aturannya: pemisah yang
// diikuti kelompok tepat 3 digit dibaca pemisah ribuan; satu pemisah dengan
// 1–2 digit di belakang dibaca desimal dan bagian bulatnya yang dipakai
// (harga disimpan sebagai Rupiah bulat). Input yang tidak bisa ditafsirkan
// secara aman mengembalikan null.
export function parsePriceInput(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
    return Math.trunc(value);
  }
  let s = String(value ?? '').trim().toLowerCase();
  s = s.replace(/^rp\.?\s?/, '').replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;

  if (s.includes('.') && s.includes(',')) {
    // Dua jenis pemisah: yang paling kanan desimal, yang lain ribuan.
    const decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    const intPart = s.split(decimalSep)[0].split(thousandSep).join('');
    return /^\d+$/.test(intPart) ? Number(intPart) : null;
  }

  const sep = s.includes('.') ? '.' : (s.includes(',') ? ',' : null);
  if (!sep) return /^\d+$/.test(s) ? Number(s) : null;

  const groups = s.split(sep);
  const looksLikeThousands = groups.length > 1
    && groups[0].length >= 1 && groups[0].length <= 3
    && groups.slice(1).every((group) => /^\d{3}$/.test(group));
  if (looksLikeThousands) return Number(groups.join(''));

  if (groups.length === 2 && /^\d{1,2}$/.test(groups[1])) return Number(groups[0]);
  return null;
}

function normalizePrice(value) {
  const parsed = parsePriceInput(value);
  if (parsed === null || parsed > 999_999_999_999) return null;
  return parsed;
}

function normalizeCategoryId(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Kategori produk tidak valid.');
  return id;
}

function normalizeProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    price: Number(row.price),
    description: row.description || '',
    imageUrl: row.image_url || '',
    categoryId: row.category_id ? Number(row.category_id) : null,
    sortOrder: Number(row.sort_order || 0),
    viewCount: Number(row.view_count || 0),
    isPopular: Boolean(row.is_popular),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateProduct(data) {
  const name = typeof data?.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
  const price = normalizePrice(data?.price);
  const description = typeof data?.description === 'string' ? data.description.trim() : '';
  const imageUrl = typeof data?.imageUrl === 'string' ? data.imageUrl.trim() : '';
  const categoryId = normalizeCategoryId(data?.categoryId);

  if (name.length < 2 || name.length > 100) throw new SettingsStorageError('Nama produk harus terdiri dari 2 sampai 100 karakter.');
  if (price === null) throw new SettingsStorageError('Harga produk harus berupa angka dari 0 hingga 999.999.999.999.');
  if (description.length > 2_000) throw new SettingsStorageError('Deskripsi produk maksimal 2.000 karakter.');
  if (imageUrl && (!/^https:\/\/.+/i.test(imageUrl) || imageUrl.length > 1_500)) throw new SettingsStorageError('URL foto produk tidak valid.');
  return { name, price, description, imageUrl, categoryId };
}

function textSearchFilter(query) {
  const text = typeof query === 'string' ? query.trim().replace(/[*,()]/g, '') : '';
  if (text.length < 2) return '';
  const pattern = `*${text.slice(0, 70)}*`;
  // Search both name and description. Encoding the full PostgREST OR expression
  // prevents spaces and Indonesian characters from breaking the filter.
  return `&or=${encodeURIComponent(`(name.ilike.${pattern},description.ilike.${pattern})`)}`;
}

// Jumlah total produk bot — dipakai untuk kapasitas dan nomor urut produk baru
// tanpa mentransfer seluruh baris produk (penting setelah kapasitas 5.000).
export async function getProductCount(botId) {
  const response = await supabaseRequest(
    `${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&select=id&limit=1`,
    { headers: { Prefer: 'count=exact' } }
  );
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  if (Number.isSafeInteger(total)) return total;
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

export async function getProducts(botId, { activeOnly = false, categoryId = null, query = '', popular = false, featuredOnly = false, limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const activeQuery = activeOnly ? '&is_active=eq.true' : '';
  const featuredQuery = featuredOnly ? '&is_popular=eq.true' : '';
  const categoryQuery = categoryId ? `&category_id=eq.${encodeURIComponent(String(normalizeCategoryId(categoryId)))}` : '';
  const sort = featuredOnly ? 'sort_order.asc' : (popular ? 'view_count.desc,sort_order.asc' : 'sort_order.asc');
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_PRODUCTS);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}${activeQuery}${featuredQuery}${categoryQuery}${textSearchFilter(query)}&select=*&order=${sort}&limit=${safeLimit}&offset=${safeOffset}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeProduct) : [];
}

export async function getProductById(botId, productId, { activeOnly = false } = {}) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const activeQuery = activeOnly ? '&is_active=eq.true' : '';
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}${activeQuery}&select=*&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? normalizeProduct(rows[0]) : null;
}

export async function getProductByOrder(botId, sortOrder, { activeOnly = false } = {}) {
  const order = Number(sortOrder);
  if (!Number.isSafeInteger(order) || order < 1) return null;
  const activeQuery = activeOnly ? '&is_active=eq.true' : '';
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&sort_order=eq.${order}${activeQuery}&select=*&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? normalizeProduct(rows[0]) : null;
}

export async function moveProduct(botId, productId, targetPosition) {
  const id = Number(productId);
  const target = Number(targetPosition);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(target) || target < 1) {
    throw new SettingsStorageError('Urutan produk tidak valid.');
  }
  await supabaseRequest('rpc/move_catalog_product', {
    method: 'POST',
    body: JSON.stringify({ p_bot_id: Number(botId), p_product_id: id, p_target_position: target })
  });
  return getProductById(botId, id);
}

export async function createProduct(botId, payload) {
  const product = validateProduct(payload);
  const total = await getProductCount(botId);
  if (total >= MAX_PRODUCTS) {
    throw new SettingsStorageError(`Katalog sudah berisi ${MAX_PRODUCTS.toLocaleString('id-ID')} produk (kapasitas maksimal). Hapus produk lama untuk menambah yang baru.`);
  }

  const response = await supabaseRequest(TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      bot_id: botId,
      name: product.name,
      price: product.price,
      description: product.description,
      image_url: product.imageUrl || null,
      category_id: product.categoryId,
      // Insert at the tail first, then the RPC below atomically moves it to #1.
      sort_order: total + 1,
      is_active: true,
      updated_at: new Date().toISOString()
    })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Produk belum dapat disimpan.');
  return moveProduct(botId, rows[0].id, 1);
}

export async function normalizeProductOrder(botId) {
  await supabaseRequest('rpc/normalize_catalog_order', {
    method: 'POST',
    body: JSON.stringify({ p_bot_id: Number(botId) })
  });
}

export async function deleteProduct(botId, productId) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Produk tidak valid.');
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Produk tidak ditemukan atau tidak dapat dihapus.');
  await normalizeProductOrder(botId);
  return normalizeProduct(rows[0]);
}

export async function updateProduct(botId, productId, payload) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Produk tidak valid.');
  const product = validateProduct(payload);
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: product.name,
      price: product.price,
      description: product.description,
      image_url: product.imageUrl || null,
      category_id: product.categoryId,
      updated_at: new Date().toISOString()
    })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Produk tidak ditemukan atau belum dapat diperbarui.');
  return normalizeProduct(rows[0]);
}

export async function getPopularProducts(botId, { limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  // Once an admin marks at least one product as popular, that curated list
  // takes precedence over the automatic view-count ranking.
  const hasFeatured = await getProducts(botId, { activeOnly: true, featuredOnly: true, limit: 1 });
  if (hasFeatured.length) return getProducts(botId, { activeOnly: true, featuredOnly: true, limit, offset });
  return getProducts(botId, { activeOnly: true, popular: true, limit, offset });
}

// Menyembunyikan produk tanpa menghapusnya: produk nonaktif tidak muncul di
// katalog Telegram (semua query bot memakai activeOnly) tetapi tetap bisa
// dikelola dan ditampilkan kembali dari panel admin.
export async function updateProductActive(botId, productId, isActive) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Produk tidak valid.');
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Produk tidak ditemukan atau status visibilitas belum dapat diperbarui.');
  return normalizeProduct(rows[0]);
}

export async function updateProductPopularity(botId, productId, isPopular) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Produk tidak valid.');
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ is_popular: Boolean(isPopular), updated_at: new Date().toISOString() })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Produk tidak ditemukan atau status populer belum dapat diperbarui.');
  return normalizeProduct(rows[0]);
}

export async function updateProductCategory(botId, productId, categoryId) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Produk tidak valid.');
  const normalizedCategoryId = normalizeCategoryId(categoryId);
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ category_id: normalizedCategoryId, updated_at: new Date().toISOString() })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Produk tidak ditemukan atau kategori belum dapat diubah.');
  return normalizeProduct(rows[0]);
}

export async function incrementProductView(botId, product) {
  if (!product?.id) return;
  // A lightweight counter is sufficient for ranking popular products. Exact
  // increments under simultaneous clicks are not critical to catalog ranking.
  await supabaseRequest(`${TABLE}?id=eq.${product.id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'PATCH',
    body: JSON.stringify({ view_count: Number(product.viewCount || 0) + 1, updated_at: new Date().toISOString() })
  });
}

export function formatRupiah(price) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(price));
}

// Nomor produk dihitung dari posisi pada daftar yang sedang tampil (startNumber
// = offset halaman + 1), BUKAN sort_order mentah. Hasilnya nomor selalu berurut
// tanpa lubang saat ada produk yang disembunyikan, dan setiap daftar (katalog,
// populer, kategori, pencarian) menomori dari 1. Resolusi "balas angka" di
// webhook memakai konteks menu yang sama sehingga nomor selalu cocok.
export function catalogListText(products, title = '🛍 Katalog Produk', startNumber = 1) {
  if (!products.length) {
    return `${title}\n\nBelum ada produk yang tersedia saat ini. Silakan cek kembali nanti ya.`;
  }
  const base = Number.isSafeInteger(Number(startNumber)) && Number(startNumber) >= 1 ? Number(startNumber) : 1;
  const lines = products.map((product, index) => {
    const number = String(base + index).padStart(2, '0');
    return `${number} | ${product.name} | ${formatRupiah(product.price)}`;
  });
  return `${title}\n\n${lines.join('\n')}\n\nBalas nomor produk untuk melihat detail.\nCari: /cari nama produk · Kategori: /kategori`.slice(0, 4096);
}

export function productDetailText(product) {
  const description = product.description || 'Belum ada deskripsi untuk produk ini.';
  return `🛍 ${product.name}\n\nHarga: ${formatRupiah(product.price)}\n\n${description}`.slice(0, 4096);
}

export function whatsappOrderUrl(whatsappNumber, product) {
  if (!/^\d{8,15}$/.test(String(whatsappNumber || ''))) return null;
  const description = product.description ? `\nDeskripsi: ${product.description.slice(0, 450)}` : '';
  const message = [
    'Halo, saya ingin memesan produk berikut:',
    '',
    `Produk: ${product.name}`,
    `Harga: ${formatRupiah(product.price)}`,
    description,
    'Jumlah: 1',
    '',
    'Mohon informasi ketersediaan dan cara pemesanannya. Terima kasih.'
  ].filter((line, index) => line || index < 4).join('\n');
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
