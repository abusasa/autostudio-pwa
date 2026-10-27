create extension if not exists pgcrypto;
create table stores(slug text primary key,name text not null,phone text,address text,settings jsonb default '{}',admin_hash text not null);
create table bookings(id uuid primary key default gen_random_uuid(),store_slug text not null references stores(slug),
 name text not null,phone text not null,car text not null,service_name text not null,price int default 0,
 starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'new' check(status in('new','done','cancelled')),created_at timestamptz default now());
create index on bookings(store_slug,starts_at);
alter table stores enable row level security; alter table bookings enable row level security;
-- клиенты: только создавать запись; свои данные другим не видны
create policy "anon insert" on bookings for insert to anon with check (status='new');
-- занятость без персональных данных
create view busy_slots with(security_invoker=false) as select store_slug,starts_at,ends_at from bookings where status<>'cancelled';
grant select on busy_slots to anon;
-- админ-функции (пароль сверяется с хешем в stores)
create function _ok(s text,p text) returns boolean language sql security definer as $$select exists(select 1 from stores where slug=s and admin_hash=crypt(p,admin_hash))$$;
create function admin_list(s text,p text) returns setof bookings language plpgsql security definer as $$
begin if not _ok(s,p) then raise exception 'denied'; end if; return query select * from bookings where store_slug=s order by starts_at; end$$;
create function admin_set_status(s text,p text,b uuid,st text) returns void language plpgsql security definer as $$
begin if not _ok(s,p) then raise exception 'denied'; end if; update bookings set status=st where id=b and store_slug=s; end$$;
create function admin_move(s text,p text,b uuid,a timestamptz,e timestamptz) returns void language plpgsql security definer as $$
begin if not _ok(s,p) then raise exception 'denied'; end if; update bookings set starts_at=a,ends_at=e where id=b and store_slug=s; end$$;
create function admin_add(s text,p text,n text,ph text,c text,sv text,pr int,a timestamptz,e timestamptz) returns void language plpgsql security definer as $$
begin if not _ok(s,p) then raise exception 'denied'; end if; insert into bookings(store_slug,name,phone,car,service_name,price,starts_at,ends_at) values(s,n,ph,c,sv,pr,a,e); end$$;
grant execute on function admin_list,admin_set_status,admin_move,admin_add,_ok to anon;
-- пример: insert into stores(slug,name,admin_hash) values('service-1','Demo Detailing',crypt('ваш_пароль',gen_salt('bf')));

-- ===== 002: чат, отмена-удаление, услуги =====
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
