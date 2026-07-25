-- Jalankan sekali di Supabase SQL Editor untuk fitur "buka kategori cukup
-- dengan mengetik angkanya".
--
-- Bot mengingat menu terakhir yang ditampilkan ke setiap chat: bila customer
-- baru saja melihat daftar kategori, angka polos yang diketik dibaca sebagai
-- nomor kategori; bila baru melihat daftar produk, angka polos tetap dibaca
-- sebagai nomor produk (perilaku lama).

alter table public.catalog_customer_chats
  add column if not exists menu_context text,
  add column if not exists menu_context_at timestamptz;

select pg_notify('pgrst', 'reload schema');
