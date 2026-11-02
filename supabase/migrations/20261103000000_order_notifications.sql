-- Records whether the team was emailed about each order, so a failed email is visible and can be followed up.
-- Run this once in the SQL Editor (after 20261102000000_orders.sql).

alter table public.orders
  add column if not exists notified_at  timestamptz,   -- set when the notification email was handed to the mail server
  add column if not exists notify_error text;          -- the reason, when it could not be sent

-- show it in the team's overview (a view can't gain columns in place, so it is recreated)
create or replace view public.orders_overview with (security_invoker = true) as
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
  o.measurements_cm,
  o.notified_at,
  o.notify_error
from public.orders o
order by o.created_at desc;

revoke all on public.orders_overview from anon, authenticated;
