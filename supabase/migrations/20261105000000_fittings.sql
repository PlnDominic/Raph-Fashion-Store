-- Fitting appointments at the Danfa studio, linked to an order.
-- Run once in the SQL Editor (after the earlier migrations).
--
--   * One booking per time slot: a unique index makes a double booking impossible, even if two people tap the
--     same slot at the same moment.
--   * A customer who books again for the same order moves their appointment (the old one is cancelled).
--   * To close the studio for a slot or a whole day, insert rows with status = 'blocked' (no order needed).
--   * To cancel or finish an appointment, change its status to 'cancelled' or 'done'. A cancelled slot is free again.
--   * Opening days and hours are set in the order function (FITTING_* values at the top of index.ts).

create table public.fittings (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid references public.orders (id) on delete set null,
  order_reference text,
  customer_name   text,
  customer_phone  text,
  slot_start      timestamptz not null,                      -- Accra time is UTC all year, so these read as local times
  status          text not null default 'booked' check (status in ('booked', 'done', 'cancelled', 'blocked')),
  notes           text check (notes is null or char_length(notes) <= 500),
  notified_at     timestamptz,
  notify_error    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index fittings_one_per_slot on public.fittings (slot_start) where status in ('booked', 'blocked');
create index fittings_order on public.fittings (order_id);

alter table public.fittings enable row level security;
revoke all on public.fittings from anon, authenticated;

create trigger fittings_set_updated_at before update on public.fittings
  for each row execute function public.set_updated_at();

-- Books (or moves) a fitting. Refuses with: ORDER_NOT_FOUND, SLOT_TAKEN.
-- The phone number must match the one on the order, so only the customer can book against it.
create or replace function public.book_fitting(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_ref   text := upper(btrim(p ->> 'reference'));
  v_phone text := right(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), 9);
  v_slot  timestamptz := (p ->> 'slot')::timestamptz;
  v_order public.orders%rowtype;
  v_id    uuid;
  v_moved boolean := false;
begin
  select * into v_order from public.orders
   where reference = v_ref
     and right(regexp_replace(customer_phone, '\D', '', 'g'), 9) = v_phone
     and length(v_phone) = 9
     and status <> 'cancelled';
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  update public.fittings set status = 'cancelled' where order_id = v_order.id and status = 'booked';
  v_moved := found;

  begin
    insert into public.fittings (order_id, order_reference, customer_name, customer_phone, slot_start)
    values (v_order.id, v_order.reference, v_order.customer_name, v_order.customer_phone, v_slot)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SLOT_TAKEN';
  end;

  return jsonb_build_object('id', v_id, 'reference', v_order.reference, 'name', v_order.customer_name,
                            'phone', v_order.customer_phone, 'slot', v_slot, 'moved', v_moved);
end $$;

revoke all on function public.book_fitting(jsonb) from public, anon, authenticated;
grant execute on function public.book_fitting(jsonb) to service_role;

-- readable list for the team: select * from fittings_overview;
create or replace view public.fittings_overview as
select to_char(f.slot_start, 'Dy DD Mon YYYY HH24:MI') as appointment, f.status, f.order_reference as reference,
       f.customer_name, f.customer_phone, f.notes, f.notified_at, f.notify_error, f.slot_start, f.id
from public.fittings f
order by f.slot_start;
revoke all on public.fittings_overview from anon, authenticated;
