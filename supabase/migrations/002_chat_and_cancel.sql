-- Миграция для уже развёрнутой БД (идемпотентна; на пустой БД выполняется после schema.sql)

-- 1) Новые статусы ремонта
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings add constraint bookings_status_check
  check (status in ('new','confirmed','in_repair','ready','done','cancelled'));

-- 2) ПРАВИЛО: статус 'cancelled' => запись автоматически удаляется
create or replace function delete_cancelled_booking() returns trigger
language plpgsql as $$
begin
  delete from bookings where id = new.id;
  return null;
end $$;
drop trigger if exists trg_delete_cancelled on bookings;
create trigger trg_delete_cancelled
  after insert or update of status on bookings
  for each row when (new.status = 'cancelled')
  execute function delete_cancelled_booking();
delete from bookings where status = 'cancelled'; -- чистим старую историю

-- 3) Каталог услуг (для контекста Помощника)
create table if not exists services(
  store_slug text not null references stores(slug) on delete cascade,
  id text not null, name text not null, price int not null, duration int not null, sort int default 0,
  primary key(store_slug,id));
alter table services enable row level security;
drop policy if exists "services read" on services;
create policy "services read" on services for select to anon using (true);

-- 4) Чат «Помощника» + Realtime
create table if not exists chat_messages(
  id uuid primary key default gen_random_uuid(),
  store_slug text not null references stores(slug) on delete cascade,
  session_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) <= 500),
  created_at timestamptz default now());
create index if not exists chat_session_idx on chat_messages(session_id, created_at);
alter table chat_messages enable row level security;
drop policy if exists "chat read" on chat_messages;
drop policy if exists "chat write" on chat_messages;
-- ДЕМО: чтение открыто (session_id — случайный UUID). Не храните в чате персональные данные.
create policy "chat read" on chat_messages for select to anon using (true);
create policy "chat write" on chat_messages for insert to anon with check (role = 'user');
do $$ begin alter publication supabase_realtime add table chat_messages;
exception when duplicate_object then null; end $$;

-- 5) Данные service-1 (график/боксы нужны Помощнику). Выполнится, если студия уже создана в stores
update stores set settings = '{"open":"09:00","close":"20:00","boxes":2,"daysOff":[0]}' where slug = 'service-1';
insert into services(store_slug,id,name,price,duration,sort)
select 'service-1', v.id, v.name, v.price, v.duration, v.sort from stores s,
 (values ('diag','Диагностика',1500,60,1),('oil','Замена масла и фильтров',2800,60,2),('brakes','Тормозная система',4500,120,3),
         ('chassis','Ходовая часть',5200,180,4),('tires','Шиномонтаж',2400,60,5),('body','Кузовной ремонт',9000,240,6)) as v(id,name,price,duration,sort)
where s.slug = 'service-1' on conflict do nothing;
