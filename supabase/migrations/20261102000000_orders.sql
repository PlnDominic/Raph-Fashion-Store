-- Mave Collection: orders, order items and style-reference photos.
--
-- Customers never touch these tables directly. The site posts to the `place-order` Edge Function,
-- which validates the order and writes it with the service role. Row Level Security is on and there
-- are no public policies, so the browser (anon key) can neither read nor write anything here.
-- The team reads and updates orders in the Supabase dashboard (Table Editor), or via `orders_overview`.

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  kind             text not null check (kind in ('ready-made', 'made-to-measure', 'custom')),
  status           text not null default 'new'
                   check (status in ('new', 'confirmed', 'cutting', 'sewing', 'ready', 'delivered', 'cancelled')),
  payment_status   text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  customer_name    text not null check (char_length(customer_name) between 1 and 120),
  customer_phone   text not null check (char_length(customer_phone) between 7 and 24),
  delivery_address text not null check (char_length(delivery_address) between 1 and 300),
  need_by          date,
  notes            text check (char_length(notes) <= 1000),
  -- tailored / custom orders: { height, bust, underbust, waist, hips, shoulder, shoulderWaist, dressLength, upperArm }, all in cm
  measurements_cm  jsonb check (measurements_cm is null or jsonb_typeof(measurements_cm) = 'object'),
  total_ghs        numeric(10, 2) check (total_ghs is null or total_ghs >= 0),  -- null while a price is still "on request"
  internal_notes   text,                                                        -- for the team only
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     text not null,
  product_name   text not null,
  size           text,                                   -- UK size for ready-made dresses
  qty            integer not null default 1 check (qty between 1 and 9),
  unit_price_ghs numeric(10, 2) check (unit_price_ghs is null or unit_price_ghs >= 0)
);

create table public.order_photos (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  path       text not null,                              -- path inside the private `order-photos` storage bucket
  created_at timestamptz not null default now()
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_phone_created_idx on public.orders (customer_phone, created_at desc);
create index orders_status_idx on public.orders (status);
create index order_items_order_idx on public.order_items (order_id);
create index order_photos_order_idx on public.order_photos (order_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Lock the tables down: RLS on, no policies, no direct grants to the browser roles.
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.order_photos enable row level security;
revoke all on public.orders, public.order_items, public.order_photos from anon, authenticated;

-- Writes a whole order (header, items, photo paths) in one transaction and returns its reference.
-- Only the Edge Function (service role) may call it.
create function public.place_order(p jsonb) returns text
language plpgsql set search_path = public as $$
declare
  v_id   uuid := (p ->> 'id')::uuid;
  v_ref  text;
  v_try  integer := 0;
  v_item jsonb;
  v_path text;
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
    insert into public.order_items (order_id, product_id, product_name, size, qty, unit_price_ghs)
    values (
      v_id, v_item ->> 'product_id', v_item ->> 'product_name', nullif(v_item ->> 'size', ''),
      coalesce((v_item ->> 'qty')::integer, 1), nullif(v_item ->> 'unit_price_ghs', '')::numeric
    );
  end loop;

  for v_path in select jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) loop
    insert into public.order_photos (order_id, path) values (v_id, v_path);
  end loop;

  return v_ref;
end $$;

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;

-- A readable one-row-per-order view for the team (Table Editor / SQL editor).
create view public.orders_overview with (security_invoker = true) as
select
  o.created_at,
  o.reference,
  o.status,
  o.payment_status,
  o.kind,
  o.customer_name,
  o.customer_phone,
  o.delivery_address,
  o.need_by,
  o.total_ghs,
  (select string_agg(i.qty || ' x ' || i.product_name || coalesce(' (' || i.size || ')', ''), ', ')
     from public.order_items i where i.order_id = o.id) as items,
  (select count(*) from public.order_photos ph where ph.order_id = o.id) as photos,
  o.notes,
  o.measurements_cm
from public.orders o
order by o.created_at desc;

revoke all on public.orders_overview from anon, authenticated;

-- Private bucket for the style-reference photos customers upload (5 MB each, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
