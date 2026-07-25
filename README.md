# Katalink — Telegram Catalog Panel

Panel admin untuk menghubungkan satu bot Telegram, mengaktifkan webhook, mengatur pesan welcome, mengelola katalog produk, dan mengirim pesan ke semua customer.

## Fitur yang tersedia

- Verifikasi HTTP API token dari [@BotFather](https://t.me/BotFather).
- Webhook Telegram otomatis di `/api/telegram/webhook`.
- Editor pesan welcome di panel, dengan pratinjau Telegram.
- Tombol inline `🛍 Lihat katalog` otomatis di bawah setiap pesan welcome.
- Variabel personalisasi: `{first_name}`, `{last_name}`, `{full_name}`, `{username}`, dan `{chat_id}`.
- Token BotFather dienkripsi menggunakan **AES-256-GCM** sebelum disimpan.
- Token tidak pernah dikembalikan ke browser, disimpan di `localStorage`, atau ditulis ke log.
- Validasi webhook memakai `X-Telegram-Bot-Api-Secret-Token`.
- Katalog produk (maks. 50): foto via Supabase Storage, kategori, produk populer, pengurutan, pencarian `/cari`, dan tombol **Pesan sekarang** ke WhatsApp.
- **Multi bot**: kelola banyak bot dari satu panel di bagian **Bot terhubung**.
  - Setiap token BotFather punya baris pengaturan sendiri; verifikasi token baru otomatis menambah bot dan menjadikannya bot aktif.
  - **Ubah token**: tempel token terbaru dari bot yang sama (token bot lain ditolak agar katalog tidak tertimpa) — webhook langsung diaktifkan ulang.
  - **Hapus bot**: hanya bot yang sedang aktif di sesi Anda yang dapat dihapus (bukti kepemilikan lewat token); produk, kategori, dan daftar customer bot ikut terhapus via cascade. Webhook Telegram dimatikan otomatis saat bot dihapus.
  - Webhook semua bot berbagi URL yang sama dan dipilah lewat `X-Telegram-Bot-Api-Secret-Token` per bot.
- **Kirim Pesan (broadcast)** ke semua customer, dengan ketentuan:
  - Customer otomatis tercatat saat mengirim pesan apa pun ke bot (bukan hanya `/start`), khusus chat privat.
  - Daftar customer disimpan di tabel `catalog_customer_chats` dengan upsert atomik — tidak ada chat yang hilang saat pesan masuk bersamaan.
  - Customer yang memblokir bot atau akunnya hilang (error 403/chat tidak ditemukan) otomatis dibersihkan dari daftar kirim berikutnya.
  - Endpoint broadcast **wajib login** (`/api/broadcast` menolak permintaan tanpa sesi admin; tidak ada fallback anonim).
  - Pengiriman bertahap: 40 customer per batch, 10 paralel dengan jeda aman, sesuai batas rate Telegram.

## Arsitektur

```text
Browser admin
  │ HTTPS
  ▼
Vercel Serverless Functions ──► Supabase (token terenkripsi + welcome text)
  │                                      ▲
  │ setWebhook / sendMessage             │
  ▼                                      │
Telegram Bot API ────────────────────────┘
```

Cookie sesi HTTP-only hanya membawa metadata bot yang ditandatangani dan berlaku 2 jam. Akses edit welcome diberikan setelah admin memverifikasi token dari bot yang sudah dikonfigurasi.

## Menyiapkan Supabase

1. Buka **Supabase Dashboard → SQL Editor** pada project Supabase Anda.
2. Jalankan file [`supabase/schema.sql`](./supabase/schema.sql) satu kali, lalu jalankan **seluruh file migrasi lain** di folder [`supabase/`](./supabase) sesuai kebutuhan fitur — termasuk [`supabase/broadcast-customer-chats.sql`](./supabase/broadcast-customer-chats.sql) untuk memperbaiki fitur Kirim Pesan (memindahkan daftar customer dari kolom JSON lama ke tabel khusus yang aman dari race condition).
3. Ambil **Project URL** dan **service_role key** dari **Project Settings → API**.
   - Jangan gunakan `anon` key.
   - Jangan pernah menaruh service role key di browser.

## Environment Variables di Vercel

Tambahkan berikut di **Vercel → Project → Settings → Environment Variables** untuk environment Production:

| Nama | Cara memperoleh | Keterangan |
| --- | --- | --- |
| `SESSION_SECRET` | `openssl rand -base64 48` | Menandatangani sesi admin HTTP-only. |
| `BOT_ENCRYPTION_KEY` | `openssl rand -base64 32` | Kunci AES-256-GCM untuk token bot. Jangan pernah diubah setelah bot tersimpan. |
| `SUPABASE_URL` | Project Settings → API | URL project Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API | Hanya server-side; simpan sebagai Sensitive. |
| `APP_URL` | Mis. `https://katalink-telegram.vercel.app` | Opsional, untuk URL webhook stabil/custom domain. |

Gunakan [`.env.example`](./.env.example) sebagai referensi nama variabel. Semua nilai di atas adalah rahasia dan tidak boleh di-commit ke Git.

## Aktivasi bot dan welcome message

1. Buka panel lalu masukkan token dari **@BotFather** pada menu **Hubungkan Bot**.
2. Server memverifikasi token (`getMe`), mengenkripsi token, menyimpannya di Supabase, lalu memanggil `setWebhook` ke Telegram.
3. Buka bagian **Pesan Welcome**, ubah teks, dan pilih **Simpan perubahan**.
4. Buka chat bot di Telegram sebagai customer dan tekan **Start** untuk menguji pesan.

> Jika bot sebelumnya memakai webhook lain, menghubungkan bot dari panel ini akan menggantinya dengan webhook Katalink.

## Deploy ke Vercel

Project di-deploy sebagai static site (`public/`) dan Vercel Serverless Functions (`api/`). Setelah environment variables ditambahkan:

```bash
npx vercel --prod
```

Deployment produksi saat ini: [katalink-telegram.vercel.app](https://katalink-telegram.vercel.app)

## Pengembangan lokal

```bash
npm start
```

Lalu buka [http://localhost:3000](http://localhost:3000). Untuk benar-benar menerima webhook saat lokal, Anda tetap memerlukan URL HTTPS publik (misalnya tunnel) dan environment Supabase yang sesuai. Deployment Vercel adalah konfigurasi yang direkomendasikan.

## Struktur project

```text
.
├── api/
│   ├── bot/connect.js            # Verifikasi token, multi bot (tambah/ubah token), setWebhook
│   ├── bot/remove.js             # Hapus bot (bot aktif saja) + matikan webhook
│   ├── telegram/webhook.js       # Menangani /start, katalog, pencarian, dan pencatatan customer
│   ├── broadcast.js              # Kirim Pesan ke semua customer (wajib sesi admin)
│   ├── bots.js                   # Daftar bot terhubung untuk pengelola multi bot
│   ├── products.js               # CRUD produk + foto
│   ├── categories.js             # Kategori produk
│   ├── contact.js                # Nomor WhatsApp pemesanan
│   ├── diagnostics.js            # Cek webhook/katalog + perbaikan otomatis
│   ├── session.js
│   └── welcome.js                # Baca/simpan teks welcome
├── lib/
│   ├── telegram-settings.js      # Enkripsi AES-GCM + Supabase + Telegram API
│   ├── customer-chats.js         # Daftar customer Kirim Pesan (upsert atomik + pembersihan otomatis)
│   ├── catalog-products.js       # Akses data produk
│   ├── catalog-categories.js     # Akses data kategori
│   ├── product-images.js         # Unggah foto ke Supabase Storage
│   └── vercel-api.js             # Sesi cookie, CSRF, helper respons
├── public/                       # Panel web
├── supabase/                     # Migrasi SQL — jalankan sekali masing-masing di SQL Editor
│   ├── schema.sql                # Tabel pengaturan bot + tabel produk awal
│   ├── broadcast-customer-chats.sql  # Perbaikan fitur Kirim Pesan (wajib untuk broadcast)
│   └── ...                       # Migrasi fitur lain (kategori, populer, urutan, dll.)
├── .env.example
└── vercel.json
```
