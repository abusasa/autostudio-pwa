-- Полная схема БД Supabase для платформы автосервисов Актау (car-pwa)
create extension if not exists pgcrypto;

create table if not exists stores (
  slug text primary key,
  name text not null,
  phone text,
  address text,
  settings jsonb default '{}',
  admin_hash text not null
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  store_slug text not null references stores(slug) on delete cascade,
  name text not null,
  phone text not null,
  car text not null,
  service_name text not null,
  price int default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'new' check (status in ('new','confirmed','in_repair','ready','done','cancelled')),
  created_at timestamptz default now()
);

create index if not exists bookings_store_starts_idx on bookings(store_slug, starts_at);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  store_slug text not null references stores(slug) on delete cascade,
  session_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) <= 500),
  created_at timestamptz default now()
);

create index if not exists chat_session_idx on chat_messages(session_id, created_at);

alter table stores enable row level security;
alter table bookings enable row level security;
alter table chat_messages enable row level security;

drop policy if exists "anon insert" on bookings;
create policy "anon insert" on bookings for insert to anon with check (status = 'new');

drop policy if exists "chat read" on chat_messages;
create policy "chat read" on chat_messages for select to anon using (true);

drop policy if exists "chat write" on chat_messages;
create policy "chat write" on chat_messages for insert to anon with check (role = 'user');

-- Базовый слот синхронизации для всех 25 СТО Актау
insert into stores(slug, name, admin_hash)
values ('service-1', 'Aktau Master Hub', crypt('pGE-HsT-Fc8-rdA', gen_salt('bf')))
on conflict (slug) do nothing;
