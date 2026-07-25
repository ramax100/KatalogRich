-- Jalankan sekali di Supabase SQL Editor untuk memperbaiki fitur Kirim Pesan.
--
-- Masalah yang diperbaiki:
-- 1. Chat ID customer sebelumnya disimpan sebagai array JSON lalu ditulis
--    ulang dengan pola read-modify-write. Dua customer yang menghubungi bot
--    pada saat bersamaan bisa saling menimpa dan salah satu ID hilang.
-- 2. Customer yang memblokir bot tidak pernah dibersihkan dari daftar kirim,
--    sehingga broadcast berikutnya terus mencoba chat yang sudah mati.
-- 3. ID grup ikut tercatat sebagai "customer".
--
-- Solusinya adalah tabel khusus dengan primary key gabungan + upsert atomik
-- melalui RPC, ditambah kolom is_blocked untuk pembersihan otomatis.

create table if not exists public.catalog_customer_chats (
  bot_id bigint not null references public.telegram_bot_settings(bot_id) on delete cascade,
  chat_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_blocked boolean not null default false,
  blocked_at timestamptz,
  primary key (bot_id, chat_id)
);

create index if not exists catalog_customer_chats_audience_idx
  on public.catalog_customer_chats (bot_id, is_blocked, first_seen_at asc);

alter table public.catalog_customer_chats enable row level security;
revoke all on table public.catalog_customer_chats from anon, authenticated;

-- Upsert atomik: aman dari race condition dan otomatis "menghidupkan" kembali
-- customer yang sempat ditandai memblokir lalu menghubungi bot lagi.
create or replace function public.touch_catalog_customer(p_bot_id bigint, p_chat_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.catalog_customer_chats (bot_id, chat_id, first_seen_at, last_seen_at, is_blocked, blocked_at)
  values (p_bot_id, p_chat_id, now(), now(), false, null)
  on conflict (bot_id, chat_id) do update
    set last_seen_at = excluded.last_seen_at,
        is_blocked = false,
        blocked_at = null;
end;
$$;

grant execute on function public.touch_catalog_customer(bigint, text) to service_role;

-- Pindahkan daftar customer dari kolom JSON lama ke tabel baru (jika ada).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'telegram_bot_settings'
      and column_name = 'customer_chat_ids'
  ) then
    insert into public.catalog_customer_chats (bot_id, chat_id)
    select s.bot_id, c.chat_id
    from public.telegram_bot_settings s
    cross join lateral jsonb_array_elements_text(s.customer_chat_ids) as c(chat_id)
    where c.chat_id ~ '^-?\d+$'
    on conflict (bot_id, chat_id) do nothing;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
