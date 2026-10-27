# Booking PWA (React + Vite + TS + Tailwind + Supabase)
1. `npm i` → `cp .env.example .env` и заполните ключи Supabase.
2. Выполните `supabase/schema.sql` в SQL Editor, затем создайте студию (пример в конце файла).
3. `npm run dev` → `/service-1`, кабинет: `/service-1/admin`.
Новая студия: скопируйте `src/services/_template.json` в `src/services/service-N/config.json` и добавьте строку в `stores`.
Деплой: импортируйте репозиторий в Vercel, добавьте две переменные окружения.
