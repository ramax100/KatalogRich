# Katalink — Telegram Catalog Panel

Panel admin untuk menghubungkan satu bot Telegram, mengaktifkan webhook, dan mengatur pesan welcome yang dikirim saat customer menekan **Start** atau mengirim `/start`.

## Fitur yang tersedia

- Verifikasi HTTP API token dari [@BotFather](https://t.me/BotFather).
- Webhook Telegram otomatis di `/api/telegram/webhook`.
- Editor pesan welcome di panel, dengan pratinjau Telegram.
- Tombol inline `🛍 Lihat katalog` otomatis di bawah setiap pesan welcome.
- Variabel personalisasi: `{first_name}`, `{last_name}`, `{full_name}`, `{username}`, dan `{chat_id}`.
- Token BotFather dienkripsi menggunakan **AES-256-GCM** sebelum disimpan.
- Token tidak pernah dikembalikan ke browser, disimpan di `localStorage`, atau ditulis ke log.
- Validasi webhook memakai `X-Telegram-Bot-Api-Secret-Token`.

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
2. Jalankan file [`supabase/schema.sql`](./supabase/schema.sql) satu kali.
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
│   ├── bot/connect.js            # Verifikasi token, simpan terenkripsi, setWebhook
│   ├── telegram/webhook.js       # Menangani /start dan sendMessage
│   ├── session.js
│   └── welcome.js                # Baca/simpan teks welcome
├── lib/
│   ├── telegram-settings.js      # Enkripsi AES-GCM + Supabase + Telegram API
│   └── vercel-api.js
├── public/                       # Panel web
├── supabase/schema.sql           # Jalankan sekali di Supabase SQL Editor
├── .env.example
└── vercel.json
```
