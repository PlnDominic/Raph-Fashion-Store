-- Messages to customers (email and SMS) when an order is placed and when it moves along.
-- Run once in the SQL Editor.

alter table public.orders add column customer_email text
  check (customer_email is null or (char_length(customer_email) between 5 and 120 and customer_email like '%_@_%._%'));

-- a record of every message sent (or that failed), shown on the order in the admin page
create table public.order_messages (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references public.orders (id) on delete cascade,
  kind      text not null,                                         -- received, confirmed, cutting, sewing, ready, delivered, cancelled, paid
  channel   text not null check (channel in ('email', 'sms')),
  recipient text not null,
  sent_at   timestamptz not null default now(),
  error     text
);
create index order_messages_order on public.order_messages (order_id, sent_at desc);

alter table public.order_messages enable row level security;
revoke all on public.order_messages from anon, authenticated;
