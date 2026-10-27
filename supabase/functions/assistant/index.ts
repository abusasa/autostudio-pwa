// Edge Function «Помощник». Ключ OpenRouter и системный промпт живут ТОЛЬКО здесь (в админке не редактируются).
// Деплой: supabase functions deploy assistant && supabase secrets set OPENROUTER_API_KEY=sk-or-...
import { createClient } from 'npm:@supabase/supabase-js@2'

const MODEL = Deno.env.get('OPENROUTER_MODEL') ?? 'openai/gpt-4o-mini'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SYSTEM = (name: string, extra: string) => `Ты — «Помощник», ассистент автосервиса «${name}». Отвечай по-русски, кратко, дружелюбно.
Это демо-версия: реальную запись ты не создаёшь — предложи нажать «+ Записаться».
Используй ТОЛЬКО данные ниже (цены, услуги, график, занятость). Если данных нет — честно скажи и предложи позвонить.
Свободное окно: рабочее время, не выходной, и число пересекающихся записей меньше числа боксов. Длительность берётся из услуги.
Все времена в данных указаны в UTC; в ответе переводи в часовой пояс Europe/Moscow (UTC+3), если студия не указала иное.

${extra}`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const { store_slug, session_id } = await req.json().catch(() => ({}))
  if (!store_slug || !session_id) return json({ error: 'bad request' }, 400)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const [store, svc, busy, hist] = await Promise.all([
    sb.from('stores').select('name,phone,address,settings').eq('slug', store_slug).single(),
    sb.from('services').select('name,price,duration').eq('store_slug', store_slug).order('sort'),
    sb.from('bookings').select('starts_at,ends_at').eq('store_slug', store_slug).neq('status', 'cancelled')
      .gte('ends_at', new Date().toISOString()).order('starts_at'),
    sb.from('chat_messages').select('role,content').eq('session_id', session_id).eq('store_slug', store_slug)
      .order('created_at', { ascending: false }).limit(20),
  ])
  if (!store.data) return json({ error: 'unknown store' }, 404)
  const history = (hist.data ?? []).reverse()
  if (history.at(-1)?.role !== 'user') return json({ ok: true, skipped: true }) // защита от повторных вызовов

  const s = store.data.settings ?? {}
  const context = `Сейчас: ${new Date().toISOString()} (UTC).
Адрес: ${store.data.address ?? '—'}. Телефон: ${store.data.phone ?? '—'}.
График: ${s.open ?? '09:00'}–${s.close ?? '20:00'}, выходные (0=вс): ${(s.daysOff ?? []).join(',') || 'нет'}, боксов: ${s.boxes ?? 1}.
Услуги: ${(svc.data ?? []).map(x => `${x.name} — от ${x.price} ₽, ~${x.duration} мин`).join('; ') || 'нет данных'}.
Занятые интервалы (начало → конец, UTC): ${(busy.data ?? []).map(b => `${b.starts_at} → ${b.ends_at}`).join('; ') || 'нет, всё свободно'}.`

  let content = 'Сейчас не могу ответить. Попробуйте чуть позже или позвоните в сервис.'
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'system', content: SYSTEM(store.data.name, context) }, ...history] }),
    })
    content = (await r.json()).choices?.[0]?.message?.content?.slice(0, 500) ?? content
  } catch (_) { /* остаётся сообщение по умолчанию */ }

  await sb.from('chat_messages').insert({ store_slug, session_id, role: 'assistant', content })
  return json({ ok: true })
})
