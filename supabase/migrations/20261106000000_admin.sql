-- Admin dashboard: remembers failed sign-in attempts so the password cannot be guessed by trying again and again.
-- Run once in the SQL Editor.

create table public.admin_login_attempts (
  id  bigint generated always as identity primary key,
  ip  text,
  ok  boolean not null,
  at  timestamptz not null default now()
);
create index admin_login_attempts_at on public.admin_login_attempts (at desc);

alter table public.admin_login_attempts enable row level security;
revoke all on public.admin_login_attempts from anon, authenticated;
