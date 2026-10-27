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
