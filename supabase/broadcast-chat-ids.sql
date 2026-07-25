-- Tidak membuat table baru.
-- Jalankan sekali di Supabase SQL Editor untuk menyimpan chat ID customer
-- yang menekan Start pada bot.

alter table public.telegram_bot_settings
  add column if not exists customer_chat_ids jsonb not null default '[]'::jsonb;

select pg_notify('pgrst', 'reload schema');
