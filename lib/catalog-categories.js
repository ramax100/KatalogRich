import { SettingsStorageError, supabaseRequest } from './telegram-settings.js';

const TABLE = 'catalog_categories';
const MAX_CATEGORIES = 30;

function normalizeCategory(row) {
  return { id: Number(row.id), name: row.name, createdAt: row.created_at };
}

function validateName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 50) {
    throw new SettingsStorageError('Nama kategori harus terdiri dari 2 sampai 50 karakter.');
  }
  return name;
}

export async function getCategories(botId) {
  const response = await supabaseRequest(`${TABLE}?bot_id=eq.${encodeURIComponent(String(botId))}&select=*&order=name.asc&limit=${MAX_CATEGORIES}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeCategory) : [];
}

export async function getCategoryById(botId, categoryId) {
  const id = Number(categoryId);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}&select=*&limit=1`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? normalizeCategory(rows[0]) : null;
}

export async function createCategory(botId, value) {
  const name = validateName(value);
  const categories = await getCategories(botId);
  if (categories.length >= MAX_CATEGORIES) throw new SettingsStorageError(`Maksimal ${MAX_CATEGORIES} kategori dapat dibuat.`);
  const response = await supabaseRequest(TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ bot_id: botId, name })
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Kategori belum dapat disimpan.');
  return normalizeCategory(rows[0]);
}

export async function deleteCategory(botId, categoryId) {
  const id = Number(categoryId);
  if (!Number.isSafeInteger(id) || id < 1) throw new SettingsStorageError('Kategori tidak valid.');
  const response = await supabaseRequest(`${TABLE}?id=eq.${id}&bot_id=eq.${encodeURIComponent(String(botId))}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new SettingsStorageError('Kategori tidak ditemukan atau tidak dapat dihapus.');
  return normalizeCategory(rows[0]);
}

// Jumlah produk aktif per kategori (untuk ditampilkan di daftar kategori).
function countByCategory(products) {
  const counts = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    const id = Number(product?.categoryId);
    if (Number.isSafeInteger(id) && id > 0) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}

export function categoryListText(categories, products = []) {
  if (!categories.length) return '📂 Kategori Produk\n\nBelum ada kategori yang tersedia.';
  const counts = countByCategory(products);
  const lines = categories.map((category, index) => {
    const total = counts.get(category.id) || 0;
    return `[${index + 1}] ${category.name} (${total} produk)`;
  });
  return `📂 Kategori Produk\n\n${lines.join('\n')}\n\nBalas dengan nomor kategori untuk membuka produknya. Contoh: 2`.slice(0, 4096);
}

// Nomor yang diketik customer mengikuti nomor urut pada daftar ([1], [2],
// ...) — jauh lebih sederhana daripada ID database, dan tidak berubah saat
// ada kategori yang dihapus. ID database lama tetap diterima sebagai fallback
// agar perintah lama yang sudah terlanjur diketik tidak error.
export function resolveCategoryByNumber(categories, value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return categories[number - 1] || categories.find((category) => category.id === number) || null;
}
