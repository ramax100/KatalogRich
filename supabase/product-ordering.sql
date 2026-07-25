-- Jalankan sekali di Supabase SQL Editor untuk mengatur urutan produk.
-- Produk baru akan selalu ditempatkan pada nomor 1.

alter table public.catalog_products
  add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (partition by bot_id order by created_at desc, id desc) as position
  from public.catalog_products
  where sort_order is null
)
update public.catalog_products p
set sort_order = ranked.position
from ranked
where p.id = ranked.id;

alter table public.catalog_products
  alter column sort_order set default 999999,
  alter column sort_order set not null;

create index if not exists catalog_products_sort_order_idx
  on public.catalog_products (bot_id, is_active, sort_order asc);

create or replace function public.normalize_catalog_order(p_bot_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select id, row_number() over (order by sort_order asc, created_at desc, id desc) as position
    from public.catalog_products
    where bot_id = p_bot_id
  )
  update public.catalog_products p
  set sort_order = ranked.position
  from ranked
  where p.id = ranked.id;
end;
$$;

create or replace function public.move_catalog_product(
  p_bot_id bigint,
  p_product_id bigint,
  p_target_position integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_position integer;
  last_position integer;
  target_position integer;
begin
  select sort_order into current_position
  from public.catalog_products
  where id = p_product_id and bot_id = p_bot_id;

  if current_position is null then
    raise exception 'Product not found';
  end if;

  select coalesce(max(sort_order), 1) into last_position
  from public.catalog_products
  where bot_id = p_bot_id;

  target_position := least(greatest(p_target_position, 1), last_position);

  if target_position < current_position then
    update public.catalog_products
    set sort_order = sort_order + 1
    where bot_id = p_bot_id
      and sort_order >= target_position
      and sort_order < current_position;
  elsif target_position > current_position then
    update public.catalog_products
    set sort_order = sort_order - 1
    where bot_id = p_bot_id
      and sort_order > current_position
      and sort_order <= target_position;
  end if;

  update public.catalog_products
  set sort_order = target_position,
      updated_at = now()
  where id = p_product_id and bot_id = p_bot_id;
end;
$$;

grant execute on function public.normalize_catalog_order(bigint) to service_role;
grant execute on function public.move_catalog_product(bigint, bigint, integer) to service_role;

select pg_notify('pgrst', 'reload schema');
