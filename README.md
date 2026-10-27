# Автосервис — PWA для записи (React + Vite + TS + Tailwind 3 + Supabase)

Мультистудийный: каждая студия — `src/services/<slug>/config.json`, адреса `/<slug>` (клиент) и `/<slug>/admin` (кабинет).
Новая студия: скопировать `src/services/_template.json` в `src/services/service-N/config.json`, добавить строку в `stores` (пароль кабинета — хеш).

## Запуск
1. `cp .env.example .env` и заполнить `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `npm i && npm run dev`.
2. Supabase → SQL Editor: чистая БД — `supabase/schema.sql`; уже развёрнутая — `supabase/migrations/002_chat_and_cancel.sql`.
   Создайте студию: `insert into stores(slug,name,admin_hash) values('service-1','Fast Repair',crypt('ваш_пароль',gen_salt('bf')));` и повторите блок 5 миграции (график и услуги для Помощника).
3. «Помощник»: `supabase functions deploy assistant` и `supabase secrets set OPENROUTER_API_KEY=... [OPENROUTER_MODEL=...]`.
   Системный промпт зашит в `supabase/functions/assistant/index.ts`. Время работы/боксы/услуги берутся из БД (`stores.settings`, `services`) — при смене `config.json` обновите и их.

## Правила
- Статус `cancelled` → запись автоматически удаляется SQL-триггером.
- Палитра и темы (тёмная/светлая) — только в `src/index.css`; акцент студии — `accent` в config.json.
