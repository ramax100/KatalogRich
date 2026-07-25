-- Gambar pesan welcome (opsional).
-- Jalankan SEKALI di Supabase → SQL Editor, lalu atur gambar welcome dari panel
-- (Pesan Welcome → Tambah gambar welcome). Teks welcome tetap bekerja normal
-- walau kolom ini belum ditambahkan; gambar baru mulai bisa disimpan setelahnya.
alter table public.telegram_bot_settings
  add column if not exists welcome_image_url text;
