# Katalog Rich Store — Panel Admin Katalog Telegram

**Katalog Rich Store** adalah panel admin web untuk membuat **toko katalog di bot Telegram** tanpa menulis kode bot sama sekali. Cukup hubungkan token bot dari BotFather, isi produk lewat panel, dan bot Anda langsung bisa melayani customer: menampilkan katalog, kategori, pencarian, produk populer, tombol pesan via WhatsApp, sampai kirim pengumuman (broadcast) ke semua customer — lengkap dengan login admin dan dukungan banyak bot.

💬 **Komunitas & info update:** gabung channel Telegram kami di **[t.me/ChRichStore](https://t.me/ChRichStore)**
🌐 **Contoh deployment:** [katalink-telegram.vercel.app](https://katalink-telegram.vercel.app)
📄 **Lisensi:** [MIT](./LICENSE) — **gratis, bebas digunakan dan dimodifikasi** untuk keperluan pribadi maupun komersial.

---

## ✨ Fitur

### Untuk pemilik toko (panel web)
- **Login admin** — seluruh panel & API terkunci sesi login (12 jam), dengan pembatasan percobaan login.
- **Hubungkan bot sekali klik** — tempel token BotFather, webhook Telegram terpasang otomatis.
- **Multi bot** — kelola banyak bot dari satu panel: daftar bot, ubah token, hapus bot (katalog ikut terhapus aman).
- **Pesan Welcome** — sapaan `/start` dengan variabel `{first_name}`, `{username}`, dll. + pratinjau langsung.
- **Katalog Produk** — tambah/edit/hapus produk (kapasitas besar hingga **5.000 produk**), foto **opsional**, kategori, produk populer, dan atur urutan dengan **seret & letakkan (drag & drop)** atau tombol naik.
- **Pencarian & sembunyikan produk** — cari produk langsung dari panel, dan sembunyikan produk tanpa menghapusnya; produk tersembunyi hilang dari katalog Telegram dan nomor urut di bot tetap rapi berurutan.
- **Kirim Pesan (broadcast)** — kirim info promo ke semua customer, bisa **disertai gambar** (foto + caption).
- **WhatsApp pemesanan** — tombol *Pesan sekarang* di bot langsung menuju chat WhatsApp toko Anda.
- **Diagnostik** — periksa & perbaiki otomatis token, webhook, data katalog, WhatsApp, dan pesan welcome.

### Untuk customer (bot Telegram)
- `/start` sapaan welcome dengan tombol buka katalog.
- `/katalog` daftar produk berhalaman, `/populer` produk terlaris.
- `/kategori` daftar kategori ringkas `[1] Nama (N produk)` — buka cukup dengan **ketik angkanya saja** (mis. `2`); perintah `/kategori 2` juga tetap bisa.
- `/cari kata` atau ketik teks apa saja untuk mencari produk.
- Ketik **nomor produk** untuk melihat detail + foto + tombol **Pesan sekarang** (WhatsApp) dan tombol box **Kembali ke katalog**.

---

## 🧱 Bahan yang Digunakan

| Bahan | Fungsi | Biaya |
|---|---|---|
| **Node.js 18.17+** | Bahasa utama server (ES Modules, **tanpa dependency npm** — murni API bawaan Node seperti `fetch` & `crypto`) | Gratis |
| **Vercel** | Hosting panel web + serverless functions (`/api/*`) | Gratis (paket Hobby cukup) |
| **Supabase** | Database Postgres (konfigurasi bot, produk, kategori, customer) + Supabase Storage (foto) | Gratis (paket Free cukup) |
| **Telegram Bot API** | Otak bot katalog (webhook, pesan, tombol inline) | Gratis — dibuat di [@BotFather](https://t.me/BotFather) |
| **HTML + CSS + JS vanilla** | Tampilan panel admin (tanpa framework) | — |

Tidak ada framework, tidak ada proses build, dan tidak ada package yang perlu di-install — `package.json` tidak memiliki dependency sama sekali.

---

## 🚀 Cara Menggunakan (Dari Awal Sampai Akhir)

### 1. Siapkan database (Supabase) — ±5 menit
1. Buat akun di [supabase.com](https://supabase.com) lalu **New project** (gratis).
2. Buka menu **SQL Editor**, lalu jalankan file-file SQL di folder [`supabase/`](./supabase) secara berurutan:
   - Jalankan [`supabase/schema.sql`](./supabase/schema.sql) **paling pertama**.
   - Lalu jalankan **semua file `.sql` lainnya** di folder yang sama (urutannya bebas).
3. Buka **Project Settings → API**, catat:
   - `Project URL` → nanti jadi `SUPABASE_URL`
   - `service_role` key (klik *Reveal*) → nanti jadi `SUPABASE_SERVICE_ROLE_KEY`

> Semua tabel otomatis dikunci dengan Row Level Security — hanya server Anda (pemegang service key) yang bisa mengaksesnya.

### 2. Deploy panel (Vercel) — ±3 menit
1. **Fork** atau **Use this template** repo ini ke akun GitHub Anda.
2. Di [vercel.com](https://vercel.com) pilih **Add New → Project → Import** repo tersebut → **Deploy** (tidak ada pengaturan build yang perlu diubah).
3. Alternatif CLI: `npm i -g vercel` lalu `vercel deploy --prod` dari folder proyek.

### 3. Isi Environment Variables — ±2 menit
Di Vercel: **Project → Settings → Environment Variables** (pilih *Sensitive* untuk semua), isi:

| Variabel | Contoh / Cara membuatnya | Wajib |
|---|---|---|
| `ADMIN_USERNAME` | Username login panel, mis. `admin` | ✅ |
| `ADMIN_PASSWORD` | Password login panel yang kuat | ✅ |
| `SESSION_SECRET` | Jalankan `openssl rand -base64 48` | ✅ |
| `BOT_ENCRYPTION_KEY` | Jalankan `openssl rand -base64 32` (harus pas 32 byte) | ✅ |
| `SUPABASE_URL` | `https://xxxx.supabase.co` (dari langkah 1) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (dari langkah 1) | ✅ |
| `APP_URL` | URL deploy Anda, mis. `https://toko-saya.vercel.app` | Opsional* |

\* `APP_URL` membuat URL webhook stabil; tanpa ini URL ditebak dari domain deploy — aman untuk pemakaian biasa.

Setelah mengubah env, lakukan **Redeploy** sekali dari tab *Deployments*.

> ⚠️ **Jangan pernah** menuliskan nilai asli variabel ini di kode/README/issue — cukup di Vercel Environment Variables.

### 4. Login & hubungkan bot — ±2 menit
1. Buka URL panel Anda → masuk dengan `ADMIN_USERNAME` + `ADMIN_PASSWORD`.
2. Di Telegram, buka **@BotFather** → `/newbot` → ikuti langkahnya → salin **HTTP API token**.
3. Di panel menu **Hubungkan Bot**, tempel token → **Verifikasi & hubungkan**.
4. Selesai! Webhook terpasang otomatis — bot Anda sudah hidup. 🎉

### 5. Isi toko Anda
Berurutan di panel (indikator *Setup katalog* memandu Anda):
1. **Pesan Welcome** — tulis sapaan untuk customer baru.
2. **Katalog Produk** — buat kategori, lalu tambah produk (nama, harga, deskripsi, foto *opsional*).
3. **Nomor WhatsApp** — aktifkan tombol *Pesan sekarang* di bot.
4. Coba bot Anda: kirim `/start`, `/katalog`, lalu ketik nomor produk.
5. **Kirim Pesan** — umumkan promo ke semua customer (teks saja atau dengan gambar).

### 6. Menjalankan secara lokal (opsional, untuk pengembangan)
```bash
git clone https://github.com/ramax100/KatalogRich.git
cd KatalogRich
cp .env.example .env          # isi nilai asli Anda di .env (file ini TIDAK ikut ter-commit)
node server.js                # buka http://localhost:3000
```

---

## 📁 Struktur Proyek

```
├── api/                    # Serverless functions (backend API panel + webhook Telegram)
│   ├── auth/               # Login & logout admin
│   ├── bot/                # Hubungkan / putuskan / hapus bot
│   ├── telegram/webhook.js # Otak bot katalog di Telegram
│   ├── products.js         # CRUD produk (+ upload foto)
│   ├── categories.js       # CRUD kategori
│   ├── broadcast.js        # Kirim Pesan teks/gambar ke semua customer
│   ├── welcome.js          # Pesan welcome
│   ├── contact.js          # Nomor WhatsApp
│   ├── bots.js             # Daftar multi bot
│   ├── diagnostics.js      # Pemeriksaan & perbaikan otomatis
│   └── session.js          # Status sesi
├── lib/                    # Logika bersama (Supabase, enkripsi token, sesi, dsb.)
├── public/                 # Panel admin (HTML/CSS/JS murni)
├── supabase/               # Migrasi SQL — jalankan semua di SQL Editor
├── server.js               # Server lokal (node server.js)
└── vercel.json             # Konfigurasi deploy Vercel
```

---

## 🔐 Keamanan

Proyek ini dirancang aman untuk dipakai publik:
- **Token bot disimpan terenkripsi** (AES-256-GCM) — hanya bisa dibaca server dengan `BOT_ENCRYPTION_KEY` Anda, dan tidak pernah ditampilkan kembali di panel.
- **Seluruh API panel wajib login**; sesi memakai cookie `HttpOnly + Secure + SameSite=Strict` bertanda HMAC.
- **Webhook per bot dilindungi secret token** (`X-Telegram-Bot-Api-Secret-Token`) sehingga orang lain tidak bisa mengirim update palsu.
- **Database terkunci RLS** — kunci publik (anon key) tidak punya akses apa pun.
- **Login dibatasi** (maks. 5 percobaan gagal / 10 menit per IP).
- **Tidak ada kredensial di repo** — semua rahasia hanya hidup di Environment Variables; `.env*` di-gitignore.

Jika Anda menemukan celah keamanan, laporkan lewat channel [t.me/ChRichStore](https://t.me/ChRichStore).

---

## 🤝 Kontribusi & Lisensi

Proyek ini **gratis dan bebas dimodifikasi** di bawah lisensi [MIT](./LICENSE): fork, ubah tampilan, tambah fitur, jadikan milik Anda — dipersilakan. Pull request dan ide fitur baru sangat diterima.

Gabung juga di channel Telegram **[t.me/ChRichStore](https://t.me/ChRichStore)** untuk update fitur, diskusi, dan bantuan pemakaian.

Dibuat dengan ❤️ oleh **Katalog Rich Store**.
