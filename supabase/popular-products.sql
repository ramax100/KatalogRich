-- Jalankan sekali di Supabase SQL Editor untuk mengatur produk populer manual dari panel.

alter table public.catalog_products
  add column if not exists is_popular boolean not null default false;

create index if not exists catalog_products_manual_popular_idx
  on public.catalog_products (bot_id, is_active, is_popular, created_at desc);

select pg_notify('pgrst', 'reload schema');
