import { randomUUID } from 'node:crypto';
import {
  SettingsStorageError,
  getSupabaseServerConfig
} from './telegram-settings.js';

const BUCKET = 'catalog-product-images';
const MAX_IMAGE_BYTES = 1_500_000;
// GIF disertakan: Telegram mengirimkannya sebagai animasi bergerak (lewat
// sendAnimation, bukan sendPhoto).
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);

function getImageData(imageData) {
  // Foto bersifat opsional: string kosong (atau bukan string) berarti "tanpa
  // foto" dan BUKAN kesalahan format — kembalikan null agar produk tetap bisa
  // disimpan. Error format hanya untuk data yang benar-benar terisi.
  if (typeof imageData !== 'string' || !imageData.trim()) return null;
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) throw new SettingsStorageError('Format gambar harus JPG, PNG, WEBP, atau GIF.');
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new SettingsStorageError('Ukuran foto maksimal 1,5 MB.');
  }
  return { mimeType, buffer, extension: ALLOWED_TYPES.get(mimeType) };
}

async function storageRequest(path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig();
  let response;
  try {
    response = await fetch(`${url}/storage/v1/${path}`, {
      ...options,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(options.headers || {})
      }
    });
  } catch {
    throw new SettingsStorageError('Tidak dapat menghubungi Supabase Storage.');
  }
  return response;
}

async function ensureImageBucket() {
  const configBody = JSON.stringify({
    id: BUCKET,
    name: BUCKET,
    public: true,
    file_size_limit: MAX_IMAGE_BYTES,
    allowed_mime_types: [...ALLOWED_TYPES.keys()]
  });
  const response = await storageRequest('bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: configBody
  });

  // Supabase Storage may return HTTP 400 with a JSON statusCode 409 for a
  // pre-existing bucket, so check both the HTTP status and payload status.
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const alreadyExists = response.status === 409 || Number(result?.statusCode) === 409 || result?.error === 'Duplicate';
    if (!alreadyExists) throw new SettingsStorageError('Bucket gambar belum dapat dibuat.');
    // Bucket lama dibuat sebelum GIF didukung (allowed_mime_types tanpa
    // image/gif akan menolak unggahan GIF) — segarkan konfigurasinya.
    // Best effort: kegagalan di sini akan tervalidasi lagi saat unggah.
    await storageRequest(`bucket/${BUCKET}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: configBody
    }).catch(() => null);
  }
}

// Hapus objek gambar di bucket produk berdasarkan URL publiknya. Dipakai
// untuk membersihkan gambar Kirim Pesan setelah broadcast selesai agar bucket
// tidak menumpuk file sekali pakai. Bersifat best-effort: kegagalan hapus
// tidak pernah menggagalkan proses utama.
export async function deleteStorageImage(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl) return false;
  const { url } = getSupabaseServerConfig();
  const prefix = `${url}/storage/v1/object/public/${BUCKET}/`;
  if (!imageUrl.startsWith(prefix)) return false;
  const pathname = decodeURIComponent(imageUrl.slice(prefix.length).split('?')[0]);
  if (!pathname || pathname.includes('..') || pathname.startsWith('/')) return false;
  const response = await storageRequest(`object/${BUCKET}/${pathname}`, { method: 'DELETE' }).catch(() => null);
  return Boolean(response?.ok);
}

export async function uploadProductImage(botId, imageData) {
  const image = getImageData(imageData);
  if (!image) return null;
  await ensureImageBucket();

  const { url } = getSupabaseServerConfig();
  const pathname = `${botId}/${randomUUID()}.${image.extension}`;
  const response = await storageRequest(`object/${BUCKET}/${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': image.mimeType,
      'Cache-Control': '31536000, immutable',
      'x-upsert': 'false'
    },
    body: image.buffer
  });
  if (!response.ok) throw new SettingsStorageError('Foto produk belum dapat diunggah.');
  return `${url}/storage/v1/object/public/${BUCKET}/${pathname}`;
}
