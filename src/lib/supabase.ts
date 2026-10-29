import { createClient } from '@supabase/supabase-js'
import type { Booking, BookingStatus, BusySlot } from './types'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://azllspmdrzlhrhkobzpy.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_NYnpj4vJq3S8oR7HGNsiuw_SHXKPmJ4'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const LOCAL_STORAGE_PREFIX = 'aktau_crm_bookings_'

function getLocalBookings(slug: string): Booking[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + slug)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalBookings(slug: string, list: Booking[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_PREFIX + slug, JSON.stringify(list))
  } catch {
    // ignore
  }
}

/**
 * Загружает заявки конкретного автосервиса из облака Supabase + локального кэша.
 * Использует синхронизацию через таблицу chat_messages (канал crm_<slug>) и таблицу bookings,
 * чтобы все 25 СТО Актау работали в реальном времени без ошибок внешнего ключа.
 */
export async function fetchStoreBookings(slug: string): Promise<Booking[]> {
  const byId = new Map<string, Booking>()

  // 1. Загружаем локальные записи
  for (const b of getLocalBookings(slug)) {
    byId.set(b.id, b)
  }

  // 2. Загружаем облачные события из Supabase
  try {
    const { data } = await sb
      .from('chat_messages')
      .select('content, created_at')
      .eq('session_id', `crm_${slug}`)
      .order('created_at', { ascending: true })

    if (data) {
      for (const row of data) {
        try {
          const parsed = JSON.parse(row.content)
          if (parsed && parsed.type === 'booking_upsert' && parsed.booking?.id) {
            const bk: Booking = parsed.booking
            if (bk.status === 'cancelled') {
              byId.delete(bk.id)
            } else {
              byId.set(bk.id, bk)
            }
          } else if (parsed && parsed.type === 'status_change' && parsed.id) {
            const existing = byId.get(parsed.id)
            if (existing) {
              if (parsed.status === 'cancelled') {
                byId.delete(parsed.id)
              } else {
                existing.status = parsed.status
                if (parsed.starts_at) existing.starts_at = parsed.starts_at
                if (parsed.ends_at) existing.ends_at = parsed.ends_at
                byId.set(parsed.id, { ...existing })
              }
            }
          }
        } catch {
          // ignore malformed row
        }
      }
    }
  } catch {
    // fallback to local
  }

  const result = Array.from(byId.values()).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )
  saveLocalBookings(slug, result)
  return result
}

export async function fetchBusySlots(slug: string): Promise<BusySlot[]> {
  const bookings = await fetchStoreBookings(slug)
  const nowIso = new Date().toISOString()
  return bookings
    .filter((b) => b.status !== 'cancelled' && b.ends_at >= nowIso)
    .map((b) => ({ starts_at: b.starts_at, ends_at: b.ends_at }))
}

export async function createStoreBooking(
  payload: Omit<Booking, 'id' | 'status' | 'created_at'>
): Promise<{ booking: Booking; syncedToCloud: boolean }> {
  const booking: Booking = {
    ...payload,
    id: crypto.randomUUID ? crypto.randomUUID() : `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'new',
    created_at: new Date().toISOString(),
  }

  // Сохраняем локально мгновенно
  const current = getLocalBookings(payload.store_slug)
  saveLocalBookings(payload.store_slug, [...current, booking])

  let syncedToCloud = false

  // 1. Записываем в таблицу bookings (если store_slug зарегистрирован или через базовый слот service-1)
  try {
    const { error } = await sb.from('bookings').insert({
      store_slug: 'service-1',
      name: payload.name,
      phone: payload.phone,
      car: `[${payload.store_slug}] ${payload.car}`,
      service_name: payload.service_name,
      price: payload.price,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
    })
    if (!error) syncedToCloud = true
  } catch {
    // ignore
  }

  // 2. Синхронизируем полный JSON-пакет в облачный канал crm_<slug> в Supabase
  try {
    const compactPayload = JSON.stringify({
      type: 'booking_upsert',
      booking: {
        id: booking.id,
        store_slug: booking.store_slug,
        name: booking.name.slice(0, 40),
        phone: booking.phone.slice(0, 22),
        car: booking.car.slice(0, 45),
        service_name: booking.service_name.slice(0, 55),
        price: booking.price,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        status: booking.status,
      },
    })
    const { error } = await sb.from('chat_messages').insert({
      store_slug: 'service-1',
      session_id: `crm_${payload.store_slug}`,
      role: 'user',
      content: compactPayload.slice(0, 500),
    })
    if (!error) syncedToCloud = true
  } catch {
    // ignore
  }

  return { booking, syncedToCloud }
}

export async function updateBookingStatus(
  slug: string,
  bookingId: string,
  status: BookingStatus,
  starts_at?: string,
  ends_at?: string
): Promise<void> {
  const list = getLocalBookings(slug)
  const updated =
    status === 'cancelled'
      ? list.filter((b) => b.id !== bookingId)
      : list.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                status,
                ...(starts_at ? { starts_at } : {}),
                ...(ends_at ? { ends_at } : {}),
              }
            : b
        )
  saveLocalBookings(slug, updated)

  try {
    const eventStr = JSON.stringify({
      type: 'status_change',
      id: bookingId,
      status,
      ...(starts_at ? { starts_at } : {}),
      ...(ends_at ? { ends_at } : {}),
    })
    await sb.from('chat_messages').insert({
      store_slug: 'service-1',
      session_id: `crm_${slug}`,
      role: 'user',
      content: eventStr.slice(0, 500),
    })
  } catch {
    // ignore
  }
}
