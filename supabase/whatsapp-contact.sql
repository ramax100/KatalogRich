-- Jalankan sekali di Supabase SQL Editor untuk mengaktifkan tombol Pesan sekarang.

alter table public.telegram_bot_settings
  add column if not exists whatsapp_number text;

select pg_notify('pgrst', 'reload schema');
