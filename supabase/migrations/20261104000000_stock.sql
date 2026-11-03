-- Stock for ready-made dresses, counted per size.
-- Run once in the SQL Editor (after the two earlier migrations), then set the real quantities in
-- Table Editor -> product_stock (the `qty` column). Every row starts at 0, so everything shows as
-- "Sold out" until you enter what you actually have.
--
--   * Orders take stock off atomically inside place_order(), so two people can never buy the same last piece.
--   * Cancelling an order (status = 'cancelled') puts its dresses back in stock.
--   * To add a size or a dress, insert a row. To stop offering a size, delete its row.

create table public.product_stock (
  product_id text not null,                                   -- same id as in js/products.js
  size       text not null,                                   -- exactly as shown to customers, e.g. 'UK 12'
  qty        integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, size)
);

alter table public.product_stock enable row level security;
revoke all on public.product_stock from anon, authenticated;   -- the site reads it through the order function

create trigger product_stock_set_updated_at before update on public.product_stock
  for each row execute function public.set_updated_at();

-- one row per dress per size, all at 0: edit the numbers, delete sizes you don't make
insert into public.product_stock (product_id, size)
select d.id, s.size
from unnest(array['sunset-kente-mermaid', 'ruby-kente-mermaid', 'cocoa-kente-gown', 'ivory-ombre-drape']) as d(id)
cross join unnest(array['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22']) as s(size)
on conflict do nothing;

-- place_order now also takes the stock off for ready-made orders. If any item is short the whole
-- order is refused (nothing is saved) with the message SOLD_OUT:<product id>|<size>.
create or replace function public.place_order(p jsonb) returns text
language plpgsql set search_path = public as $$
declare
  v_id   uuid := (p ->> 'id')::uuid;
  v_ref  text;
  v_try  integer := 0;
  v_item jsonb;
  v_path text;
  v_qty  integer;
begin
  loop
    v_ref := 'MAVE-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
    begin
      insert into public.orders (
        id, reference, kind, customer_name, customer_phone, delivery_address,
        need_by, notes, measurements_cm, total_ghs
      ) values (
        v_id, v_ref, p ->> 'kind', p ->> 'customer_name', p ->> 'customer_phone', p ->> 'delivery_address',
        nullif(p ->> 'need_by', '')::date, nullif(p ->> 'notes', ''),
        nullif(p -> 'measurements_cm', 'null'::jsonb),   -- an explicit JSON null means "none"
        nullif(p ->> 'total_ghs', '')::numeric
      );
      exit;
    exception when unique_violation then
      -- a reference clash (very unlikely): try another. A clash on the id means a replayed request.
      v_try := v_try + 1;
      if v_try >= 5 or exists (select 1 from public.orders where id = v_id) then raise; end if;
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    v_qty := coalesce((v_item ->> 'qty')::integer, 1);

    if p ->> 'kind' = 'ready-made' then
      -- take the stock off in one conditional update: it only succeeds if enough is left
      update public.product_stock
         set qty = qty - v_qty
       where product_id = v_item ->> 'product_id'
         and size = v_item ->> 'size'
         and qty >= v_qty;
      if not found then
        raise exception 'SOLD_OUT:%|%', v_item ->> 'product_id', v_item ->> 'size';
      end if;
    end if;

    insert into public.order_items (order_id, product_id, product_name, size, qty, unit_price_ghs)
    values (
      v_id, v_item ->> 'product_id', v_item ->> 'product_name', nullif(v_item ->> 'size', ''),
      v_qty, nullif(v_item ->> 'unit_price_ghs', '')::numeric
    );
  end loop;

  for v_path in select jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) loop
    insert into public.order_photos (order_id, path) values (v_id, v_path);
  end loop;

  return v_ref;
end $$;

-- Cancelling a ready-made order puts its dresses back; un-cancelling takes them off again.
create function public.sync_stock_on_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind <> 'ready-made' or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'cancelled' then
    update public.product_stock s
       set qty = s.qty + i.qty
      from public.order_items i
     where i.order_id = new.id and s.product_id = i.product_id and s.size = i.size;
  elsif old.status = 'cancelled' then
    update public.product_stock s
       set qty = s.qty - i.qty            -- fails (check qty >= 0) if that stock has since been sold
      from public.order_items i
     where i.order_id = new.id and s.product_id = i.product_id and s.size = i.size;
  end if;
  return new;
end $$;

create trigger orders_sync_stock after update of status on public.orders
  for each row execute function public.sync_stock_on_status();
