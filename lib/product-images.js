import { randomUUID } from 'node:crypto';
import {
  SettingsStorageError,
  getSupabaseServerConfig
} from './telegram-settings.js';

const BUCKET = 'catalog-product-images';
const MAX_IMAGE_BYTES = 1_500_000;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

function getImageData(imageData) {
  if (typeof imageData !== 'string') return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match) throw new SettingsStorageError('Format foto harus JPG, PNG, atau WEBP.');
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
  const response = await storageRequest('bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: [...ALLOWED_TYPES.keys()]
    })
  });

  // Supabase Storage may return HTTP 400 with a JSON statusCode 409 for a
  // pre-existing bucket, so check both the HTTP status and payload status.
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const alreadyExists = response.status === 409 || Number(result?.statusCode) === 409 || result?.error === 'Duplicate';
    if (!alreadyExists) throw new SettingsStorageError('Bucket foto produk belum dapat dibuat.');
  }
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
