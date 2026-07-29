# Katalog Rich Store — Katalog Web + Bot Telegram

**Katalog Rich Store** adalah aplikasi katalog toko yang menggabungkan **website katalog publik**, **panel admin**, dan **bot Telegram** dalam satu project. Pemilik toko cukup login ke panel admin, menghubungkan token bot dari BotFather, mengisi produk, kategori, foto, produk populer, logo toko, dan nomor WhatsApp. Data yang sama otomatis dipakai oleh katalog web dan bot Telegram.

- **Katalog web publik:** halaman utama `/`
- **Panel admin:** `/admin`
- **Bot Telegram:** webhook otomatis dari panel admin
- **Database & Storage:** Supabase
- **Hosting:** Vercel
- **Lisensi:** [MIT](./LICENSE) — bebas digunakan dan dimodifikasi untuk pribadi maupun komersial.

> Catatan: README ini tidak berisi URL deployment pribadi, token, password, service role key, atau kredensial asli apa pun.

---

## ✨ Fitur Utama

### 1. Katalog web publik
Katalog web tampil langsung di halaman utama domain Anda (`/`). Tampilannya dibuat bergaya marketplace/e-commerce modern.

Fitur katalog web:
- **Homepage katalog** di `/`.
- **Nama toko dan logo header web** dapat diatur dari admin.
- **Search produk** berdasarkan nama/deskripsi.
- **Kategori produk** dari database yang sama dengan bot.
- **Produk populer** mengikuti pengaturan admin.
- **Sort produk**: rekomendasi, harga termurah, harga termahal, nama produk.
- **Lazy load produk**: load awal **26 produk**, lalu memuat 26 produk berikutnya saat user scroll.
- **Detail produk** dalam modal.
- **Tombol pesan langsung** dari detail produk ke WhatsApp.
- **Keranjang mengambang** di kanan bawah:
  - tambah beberapa produk,
  - ubah jumlah,
  - hapus item,
  - kosongkan keranjang,
  - pesan semua item sekaligus via WhatsApp.
- **Responsive mobile/tablet** dengan bottom navigation.
- **Font web commerce** memakai Plus Jakarta Sans.

### 2. Panel admin
Panel admin tersedia di `/admin` dan wajib login.

Fitur admin:
- **Login admin** dengan sesi 12 jam.
- **Hubungkan bot Telegram** sekali klik.
- **Multi bot**: tambah bot, ubah token, hapus bot.
- **Logo header web**: upload/ganti/hapus logo kecil di samping nama toko pada katalog web.
  - JPG/PNG/WEBP otomatis di-crop persegi agar pas.
  - GIF tetap didukung dan ditampilkan dengan `object-fit: cover`.
- **Pesan welcome bot** dengan variabel personalisasi:
  - `{mention}`, `{name}`, `{username}`, `{id}`, `{first_name}`, `{full_name}`, dll.
- **Gambar/GIF welcome** opsional.
- **Produk katalog**:
  - tambah/edit/hapus produk,
  - foto/GIF opsional,
  - kategori,
  - produk populer,
  - sembunyikan/tampilkan produk,
  - atur urutan dengan drag & drop atau tombol naik.
- **Nomor WhatsApp pemesanan** untuk tombol pesan bot dan web.
- **Broadcast customer** via Telegram, teks atau gambar/GIF.
- **Diagnostik webhook** untuk memeriksa dan memperbaiki koneksi Telegram.

### 3. Bot Telegram
Bot Telegram memakai data produk/kategori yang sama dengan katalog web.

Fitur bot:
- `/start` menampilkan welcome + tombol buka katalog.
- `/katalog` menampilkan daftar produk.
- `/kategori` menampilkan daftar kategori.
- `/kategori 1` atau ketik angka setelah daftar kategori untuk membuka kategori.
- `/populer` menampilkan produk populer.
- `/cari kata` mencari produk.
- Ketik nomor produk untuk melihat detail produk.
- Loading tampil dari `1% → 100%` sebelum konten akhir.
- Detail produk dengan foto tampil rapi: foto di atas, teks dan tombol di bawah.
- Tombol **Pesan sekarang** memakai ikon keranjang dan mengarah ke WhatsApp.
- Tombol **Semua produk** tersedia pada halaman yang perlu kembali ke katalog utama.

---

## 🔄 Integrasi Data

Semua fitur memakai database yang sama:

```text
Panel Admin → Supabase → Katalog Web
                    └→ Bot Telegram
```

Jika Anda mengubah produk dari panel admin, maka perubahan ikut berpengaruh ke katalog web dan bot Telegram:

- tambah produk → muncul di web dan bot,
- edit nama/harga/deskripsi → ikut berubah,
- upload/ganti foto → ikut berubah,
- sembunyikan produk → hilang dari web dan bot,
- ubah kategori → filter kategori web dan bot ikut berubah,
- produk populer → tampil di web dan `/populer`,
- urutan produk → memengaruhi urutan katalog web dan bot,
- nomor WhatsApp → dipakai oleh tombol pesan web dan bot.

---

## 🧱 Teknologi yang Digunakan

| Teknologi | Fungsi | Catatan |
|---|---|---|
| Node.js 18.17+ | Server lokal dan serverless handler | ES Modules |
| Vercel | Hosting aplikasi dan API | Tanpa build step khusus |
| Supabase Postgres | Database bot, produk, kategori, customer | RLS aktif |
| Supabase Storage | Foto produk, gambar welcome, logo web | Bucket dibuat otomatis |
| Telegram Bot API | Bot katalog Telegram | Webhook otomatis |
| HTML/CSS/JS vanilla | Admin panel dan katalog web | Tanpa framework |

Project ini tidak memakai dependency npm eksternal. `package.json` tidak memiliki dependency.

---

## 🚀 Cara Deploy dari Awal

### 1. Siapkan Supabase
1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**.
3. Jalankan file SQL di folder [`supabase/`](./supabase):
   - Jalankan [`supabase/schema.sql`](./supabase/schema.sql) paling pertama.
   - Lalu jalankan semua file `.sql` lain di folder `supabase/`.
4. Buka **Project Settings → API**, lalu catat:
   - `Project URL` untuk `SUPABASE_URL`.
   - `service_role` key untuk `SUPABASE_SERVICE_ROLE_KEY`.

> Jangan gunakan `anon key` untuk server. Gunakan `service_role` hanya di Environment Variables Vercel.

### 2. Deploy ke Vercel
1. Fork atau import repo ini ke akun GitHub Anda.
2. Di Vercel pilih **Add New → Project**.
3. Import repo.
4. Deploy.

Tidak perlu mengatur build command khusus.

### 3. Isi Environment Variables
Di Vercel: **Project → Settings → Environment Variables**.

| Variabel | Keterangan | Wajib |
|---|---|---|
| `ADMIN_USERNAME` | Username login admin | ✅ |
| `ADMIN_PASSWORD` | Password login admin yang kuat | ✅ |
| `SESSION_SECRET` | Secret sesi, buat dengan `openssl rand -base64 48` | ✅ |
| `BOT_ENCRYPTION_KEY` | Kunci enkripsi token bot, buat dengan `openssl rand -base64 32` | ✅ |
| `SUPABASE_URL` | URL project Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase | ✅ |
| `APP_URL` | URL domain deploy Anda, contoh `https://domain-anda.vercel.app` | Direkomendasikan |

Setelah mengubah Environment Variables, lakukan **Redeploy**.

> Jangan commit file `.env`, `.env.local`, token Telegram, Vercel token, GitHub token, password admin, atau service role key ke repository.

### 4. Login ke admin
Buka:

```text
https://domain-anda.vercel.app/admin
```

Login dengan `ADMIN_USERNAME` dan `ADMIN_PASSWORD`.

### 5. Hubungkan bot Telegram
1. Buka [@BotFather](https://t.me/BotFather).
2. Buat bot baru atau gunakan bot yang sudah ada.
3. Salin HTTP API token.
4. Di panel admin buka **Hubungkan Bot**.
5. Tempel token dan klik **Verifikasi & hubungkan**.

Webhook Telegram akan dipasang otomatis ke:

```text
APP_URL/api/telegram/webhook
```

Jika `APP_URL` diganti, hubungkan ulang token bot atau jalankan diagnostik agar webhook memakai domain baru.

### 6. Isi katalog
Di panel admin:
1. Atur **Logo header web**.
2. Atur **Pesan Welcome**.
3. Buat **Kategori Produk**.
4. Tambah produk dan foto.
5. Tandai produk populer bila perlu.
6. Simpan nomor WhatsApp.
7. Tes katalog web di `/`.
8. Tes bot Telegram dengan `/start`, `/katalog`, `/kategori`, `/cari`.

---

## 💻 Menjalankan Lokal

```bash
git clone https://github.com/ramax100/KatalogRich.git
cd KatalogRich
cp .env.example .env
node server.js
```

Lalu buka:

```text
http://localhost:3000/
http://localhost:3000/admin
```

Pastikan `.env` sudah diisi dengan nilai lokal/asli Anda. File `.env*` sudah masuk `.gitignore` dan tidak boleh di-commit.

---

## 📁 Struktur Project

```text
├── api/
│   ├── auth/                 # Login/logout admin
│   ├── bot/                  # Connect/disconnect/remove bot
│   ├── telegram/webhook.js   # Handler webhook Telegram
│   ├── store.js              # API publik katalog web
│   ├── store-logo.js         # Upload/hapus logo header web (admin only)
│   ├── products.js           # CRUD produk admin
│   ├── categories.js         # CRUD kategori admin
│   ├── broadcast.js          # Broadcast customer Telegram
│   ├── welcome.js            # Pesan welcome + gambar welcome
│   ├── contact.js            # Nomor WhatsApp
│   ├── diagnostics.js        # Diagnostik webhook/data
│   └── session.js            # Status sesi
├── lib/
│   ├── catalog-products.js   # Query & format produk
│   ├── catalog-categories.js # Query & format kategori
│   ├── customer-chats.js     # Audience broadcast + konteks menu
│   ├── product-images.js     # Upload foto/logo ke Supabase Storage
│   ├── telegram-settings.js  # Setting bot, Supabase, Telegram API
│   └── vercel-api.js         # Helper sesi, auth, JSON, security header
├── public/
│   ├── index.html            # Admin panel
│   ├── app.js                # Logic admin panel
│   ├── styles.css            # Style admin panel
│   ├── store.js              # Logic katalog web
│   └── store.css             # Style katalog web
├── views/
│   └── store.html            # HTML katalog web publik di `/`
├── supabase/                 # File SQL migrasi
├── server.js                 # Server lokal + route utama
└── vercel.json               # Konfigurasi Vercel + security header
```

---

## 🔐 Keamanan

Project ini dirancang aman untuk deployment publik:

- Admin panel hanya tersedia di `/admin` dan wajib login.
- API admin wajib sesi admin.
- Token bot disimpan terenkripsi dengan AES-256-GCM.
- Token bot tidak pernah ditampilkan ulang di panel.
- Webhook Telegram dilindungi `X-Telegram-Bot-Api-Secret-Token`.
- Supabase RLS aktif; akses server memakai service role dari Environment Variables.
- Cookie sesi memakai `HttpOnly`, `Secure`, `SameSite=Strict`, dan HMAC.
- Login admin dibatasi percobaan gagal.
- `.env*` masuk `.gitignore`.
- README dan source code tidak boleh berisi kredensial asli.

### Jangan commit nilai berikut:
- `GITHUB_TOKEN`
- `VERCEL_TOKEN`
- Token BotFather
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `BOT_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- File `.env` atau `.env.local`

---

## ✅ Checklist setelah deploy

- [ ] Supabase SQL sudah dijalankan semua.
- [ ] Environment Variables sudah diisi.
- [ ] `APP_URL` sesuai domain aktif.
- [ ] Project sudah redeploy setelah env berubah.
- [ ] Admin bisa login di `/admin`.
- [ ] Bot berhasil dihubungkan ulang setelah domain berubah.
- [ ] Katalog web tampil di `/`.
- [ ] Produk tampil maksimal 26 per batch dan lazy-load saat scroll.
- [ ] Keranjang web bisa checkout beberapa produk via WhatsApp.
- [ ] Bot Telegram merespons `/start` dan `/katalog`.

---

## 🤝 Lisensi

Project ini dirilis dengan lisensi [MIT](./LICENSE). Anda bebas memakai, memodifikasi, dan mengembangkan ulang project ini untuk kebutuhan pribadi maupun komersial.
