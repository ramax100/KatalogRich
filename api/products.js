import { getBotSession, getJsonBody, isSameOrigin, sendJson,
  requireAdmin
} from '../lib/vercel-api.js';
import {
  SettingsConfigurationError,
  SettingsStorageError,
  getTelegramSettings,
  isBotSessionAuthorized
} from '../lib/telegram-settings.js';
import { MAX_PRODUCTS, createProduct, deleteProduct, getProductById, getProducts, moveProduct, updateProduct, updateProductActive, updateProductCategory, updateProductPopularity } from '../lib/catalog-products.js';
import { deleteStorageImage, uploadProductImage } from '../lib/product-images.js';
import { getCategoryById } from '../lib/catalog-categories.js';

export const config = {
  api: { bodyParser: { sizeLimit: '3mb' } }
};

async function getAuthorizedBot(req) {
  const session = getBotSession(req);
  if (!session) return { error: { status: 401, message: 'Hubungkan bot dengan token Anda untuk mengelola katalog.' } };
  const settings = await getTelegramSettings(session.bot.id);
  if (!isBotSessionAuthorized(session, settings)) {
    return { error: { status: 403, message: 'Sesi tidak memiliki akses ke katalog bot ini.' } };
  }
  return { botId: settings.bot_id };
}

export default async function products(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { ok: false, message: 'Metode tidak didukung.' });
  }
  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { ok: false, message: 'Permintaan tidak berasal dari panel ini.' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const authorization = await getAuthorizedBot(req);
    if (authorization.error) return sendJson(res, authorization.error.status, { ok: false, message: authorization.error.message });

    if (req.method === 'GET') {
      // Panel admin harus melihat seluruh produk untuk mengelolanya, bukan
      // hanya satu halaman pertama seperti tampilan katalog di Telegram.
      const items = await getProducts(authorization.botId, { limit: MAX_PRODUCTS });
      return sendJson(res, 200, { ok: true, products: items });
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = getJsonBody(req);
      } catch {
        return sendJson(res, 400, { ok: false, message: 'Data produk tidak valid.' });
      }
      if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '') {
        const category = await getCategoryById(authorization.botId, body.categoryId);
        if (!category) return sendJson(res, 422, { ok: false, message: 'Kategori produk tidak ditemukan.' });
      }
      const imageUrl = await uploadProductImage(authorization.botId, body.imageData);
      const product = await createProduct(authorization.botId, { ...body, imageUrl });
      return sendJson(res, 201, { ok: true, product });
    }

    if (req.method === 'PATCH') {
      let body;
      try {
        body = getJsonBody(req);
      } catch {
        return sendJson(res, 400, { ok: false, message: 'Data produk tidak valid.' });
      }
      if (Object.hasOwn(body, 'moveTo')) {
        const product = await moveProduct(authorization.botId, body.id, body.moveTo);
        return sendJson(res, 200, { ok: true, product });
      }
      if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '') {
        const category = await getCategoryById(authorization.botId, body.categoryId);
        if (!category) return sendJson(res, 422, { ok: false, message: 'Kategori produk tidak ditemukan.' });
      }

      const fullEdit = ['name', 'price', 'description', 'imageData'].some((key) => Object.hasOwn(body, key));
      if (!fullEdit && Object.hasOwn(body, 'isPopular')) {
        const product = await updateProductPopularity(authorization.botId, body.id, body.isPopular);
        return sendJson(res, 200, { ok: true, product });
      }
      // Toggle sembunyikan/tampilkan produk — harus dicek sebelum fallback
      // categoryId agar body { id, isActive } tidak salah dibaca perubahan
      // kategori (yang akan mengosongkan kategori produk).
      if (!fullEdit && Object.hasOwn(body, 'isActive')) {
        const product = await updateProductActive(authorization.botId, body.id, body.isActive);
        return sendJson(res, 200, { ok: true, product });
      }
      if (!fullEdit) {
        const product = await updateProductCategory(authorization.botId, body.id, body.categoryId);
        return sendJson(res, 200, { ok: true, product });
      }

      const existing = await getProductById(authorization.botId, body.id);
      if (!existing) return sendJson(res, 404, { ok: false, message: 'Produk tidak ditemukan.' });
      const uploadedImage = await uploadProductImage(authorization.botId, body.imageData);
      // Foto produk opsional dan bisa dihapus tanpa mengganti: removeImage
      // membersihkan foto lama; foto baru yang terunggah selalu menang.
      const removeImage = body.removeImage === true && !uploadedImage;
      const nextImageUrl = uploadedImage || (removeImage ? null : existing.imageUrl);
      const product = await updateProduct(authorization.botId, body.id, {
        ...body,
        imageUrl: nextImageUrl
      });
      // Foto lama yang tergantikan/dihapus dibersihkan dari storage (best effort).
      if (existing.imageUrl && existing.imageUrl !== nextImageUrl) {
        await deleteStorageImage(existing.imageUrl).catch(() => false);
      }
      return sendJson(res, 200, { ok: true, product });
    }

    const url = new URL(req.url || '', `https://${req.headers.host || 'localhost'}`);
    const product = await deleteProduct(authorization.botId, url.searchParams.get('id'));
    // Bersihkan file foto produk yang terhapus dari storage (best effort).
    if (product?.imageUrl) await deleteStorageImage(product.imageUrl).catch(() => false);
    return sendJson(res, 200, { ok: true, product });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsStorageError) {
      return sendJson(res, 503, { ok: false, message: error.message });
    }
    return sendJson(res, 500, { ok: false, message: 'Katalog belum dapat diproses.' });
  }
}
