import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import type {
  Booking,
  BookingStatus,
  BusySlot,
  LeadStateRecord,
  OperatorActiveSync,
  OsuOperator,
} from './types'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://azllspmdrzlhrhkobzpy.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_NYnpj4vJq3S8oR7HGNsiuw_SHXKPmJ4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const LOCAL_KEY_PREFIX = 'aktau_sto_bookings_v2_'
const OPERATORS_LOCAL_KEY = 'osu_operators_v3'
const LEAD_STATES_LOCAL_KEY = 'osu_lead_states_v3'
const ACTIVE_SYNC_LOCAL_KEY = 'osu_active_sync_v3_'

const CLOUD_OPERATORS_SLUG = 'osu_operators_v3'
const CLOUD_LEADS_STATE_SLUG = 'osu_leads_state_v3'

let localBroadcast: BroadcastChannel | null = null
try {
  if (typeof BroadcastChannel !== 'undefined') {
    localBroadcast = new BroadcastChannel('osu_local_sync_channel')
  }
} catch {
  // ignore
}

function readLocal(slug: string): Booking[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY_PREFIX + slug)
    return raw ? (JSON.parse(raw) as Booking[]) : []
  } catch {
    return []
  }
}

function writeLocal(slug: string, list: Booking[]) {
  try {
    localStorage.setItem(LOCAL_KEY_PREFIX + slug, JSON.stringify(list))
  } catch {
    // ignore
  }
}

export async function fetchBusySlots(slug: string): Promise<BusySlot[]> {
  try {
    const { data, error } = await supabase.rpc('get_busy_slots', { p_slug: slug })
    if (!error && Array.isArray(data)) {
      return data as BusySlot[]
    }
  } catch {
    // fallback
  }
  return readLocal(slug)
    .filter((b) => b.status !== 'cancelled')
    .map((b) => ({ starts_at: b.starts_at, ends_at: b.ends_at }))
}

export async function fetchStoreBookings(slug: string): Promise<Booking[]> {
  const local = readLocal(slug)
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('store_slug', slug)
      .order('starts_at', { ascending: true })

    if (!error && Array.isArray(data)) {
      const mergedMap = new Map<string, Booking>()
      local.forEach((b) => mergedMap.set(b.id, b))
      ;(data as Booking[]).forEach((b) => mergedMap.set(b.id, b))
      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      )
      writeLocal(slug, merged)
      return merged
    }
  } catch {
    // fallback
  }
  return local
}

export async function createStoreBooking(
  payload: Omit<Booking, 'id' | 'status' | 'created_at'>
): Promise<{ booking: Booking; synced: boolean }> {
  const newBooking: Booking = {
    ...payload,
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    status: 'new',
    created_at: new Date().toISOString(),
  }

  const current = readLocal(payload.store_slug)
  writeLocal(payload.store_slug, [...current, newBooking])

  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert([
        {
          store_slug: payload.store_slug,
          name: payload.name,
          phone: payload.phone,
          car: payload.car,
          service_name: payload.service_name,
          price: payload.price,
          starts_at: payload.starts_at,
          ends_at: payload.ends_at,
          status: 'new',
        },
      ])
      .select()
      .single()

    if (!error && data) {
      const updated = readLocal(payload.store_slug).map((b) =>
        b.id === newBooking.id ? (data as Booking) : b
      )
      writeLocal(payload.store_slug, updated)
      return { booking: data as Booking, synced: true }
    }
  } catch {
    // fallback
  }

  return { booking: newBooking, synced: false }
}

export async function updateBookingStatus(
  slug: string,
  id: string,
  status: BookingStatus
): Promise<void> {
  const updated = readLocal(slug).map((b) => (b.id === id ? { ...b, status } : b))
  writeLocal(slug, updated)

  try {
    await supabase.from('bookings').update({ status }).eq('id', id)
  } catch {
    // ignore
  }
}

export async function deleteStoreBooking(slug: string, id: string): Promise<void> {
  const updated = readLocal(slug).filter((b) => b.id !== id)
  writeLocal(slug, updated)

  try {
    await supabase.from('bookings').delete().eq('id', id)
  } catch {
    // ignore
  }
}

// ============================================================================
// ÖSU (ӨСУ) MULTI-OPERATOR AUTH, PERSONAL PROFILES & REALTIME PC <-> PHONE SYNC
// ============================================================================

export const DEFAULT_OPERATORS: OsuOperator[] = [
  {
    id: 'admin-abusamat',
    login: 'abusamat',
    password: 'osu-boss-2026',
    name: 'Абусамат (Руководитель)',
    role: 'admin',
    commissionKzt: 5000,
    createdAt: '2026-11-08T00:00:00Z',
    active: true,
    personalPath: '/hq-abusasa',
    statusNote: 'Главный профиль руководителя · Только Админ-панель',
  },
  {
    id: 'op-nurlan',
    login: 'nurlan',
    password: 'nurlan-701',
    name: 'Nurlan',
    role: 'operator',
    commissionKzt: 5000,
    createdAt: '2026-11-08T10:00:00Z',
    active: true,
    personalPath: '/nurlan',
    statusNote: 'Активен · Готов к прозвону сейчас',
    poolIndex: 0,
  },
  {
    id: 'op-duman',
    login: 'duman',
    password: 'duman-702',
    name: 'Duman',
    role: 'operator',
    commissionKzt: 5000,
    createdAt: '2026-11-08T10:00:00Z',
    active: true,
    personalPath: '/duman',
    statusNote: 'Активен · Готов к прозвону сейчас',
    poolIndex: 1,
  },
  {
    id: 'op-bibarys',
    login: 'bibarys',
    password: 'bibarys-703',
    name: 'Bibarys',
    role: 'operator',
    commissionKzt: 5000,
    createdAt: '2026-11-08T10:00:00Z',
    active: true,
    personalPath: '/bibarys',
    statusNote: 'Активен · Готов к прозвону сейчас',
    poolIndex: 2,
  },
  {
    id: 'op-nurbolat',
    login: 'nurbolat',
    password: 'nurbolat-704',
    name: 'Nurbolat',
    role: 'operator',
    commissionKzt: 5000,
    createdAt: '2026-11-08T10:00:00Z',
    active: true,
    personalPath: '/nurbolat',
    statusNote: 'Старт через 3 дня (переезд компьютера)',
    startsInDays: 3,
    poolIndex: 3,
  },
]

const DELETED_OPS_LOCAL_KEY = 'osu_deleted_operators_v3'

function getDeletedLogins(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_OPS_LOCAL_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDeletedLogins(set: Set<string>) {
  try {
    localStorage.setItem(DELETED_OPS_LOCAL_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // ignore
  }
}

function mergeWithDefaults(
  list: OsuOperator[],
  deletedSet: Set<string> = getDeletedLogins()
): OsuOperator[] {
  const map = new Map<string, OsuOperator>()
  DEFAULT_OPERATORS.forEach((op) => {
    const key = op.login.toLowerCase()
    if (op.role === 'admin' || !deletedSet.has(key)) {
      map.set(key, op)
    }
  })
  list.forEach((op) => {
    const key = op.login.toLowerCase()
    if (op.role !== 'admin' && deletedSet.has(key)) return
    const def = map.get(key)
    if (def) {
      map.set(key, {
        ...def,
        ...op,
        personalPath: op.personalPath || def.personalPath,
        statusNote: op.statusNote || def.statusNote,
        startsInDays: op.startsInDays ?? def.startsInDays,
        poolIndex: op.poolIndex ?? def.poolIndex,
      })
    } else {
      map.set(key, op)
    }
  })
  return Array.from(map.values())
}

export function loadOperatorsLocal(): OsuOperator[] {
  const deletedSet = getDeletedLogins()
  try {
    const raw = localStorage.getItem(OPERATORS_LOCAL_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as OsuOperator[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeWithDefaults(parsed, deletedSet)
      }
    }
  } catch {
    // ignore
  }
  return mergeWithDefaults(DEFAULT_OPERATORS, deletedSet)
}

export function saveOperatorsLocal(ops: OsuOperator[], deletedSet = getDeletedLogins()) {
  try {
    localStorage.setItem(
      OPERATORS_LOCAL_KEY,
      JSON.stringify(mergeWithDefaults(ops, deletedSet))
    )
  } catch {
    // ignore
  }
}

export async function fetchOperatorsCloud(): Promise<OsuOperator[]> {
  const deletedSet = getDeletedLogins()
  const local = loadOperatorsLocal()
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('content, created_at')
      .eq('sender_slug', CLOUD_OPERATORS_SLUG)
      .order('created_at', { ascending: true })
      .limit(100)

    if (!error && Array.isArray(data) && data.length > 0) {
      const map = new Map<string, OsuOperator>()
      local.forEach((op) => map.set(op.login.toLowerCase(), op))

      for (const row of data) {
        try {
          const item = JSON.parse(row.content) as OsuOperator & { deleted?: boolean }
          if (item && item.login) {
            const key = item.login.toLowerCase()
            if (item.deleted) {
              deletedSet.add(key)
              map.delete(key)
            } else {
              deletedSet.delete(key)
              const existing = map.get(key)
              map.set(key, { ...existing, ...item })
            }
          }
        } catch {
          // ignore malformed
        }
      }
      saveDeletedLogins(deletedSet)
      const merged = mergeWithDefaults(Array.from(map.values()), deletedSet)
      saveOperatorsLocal(merged, deletedSet)
      return merged
    }
  } catch {
    // fallback
  }
  return local
}

export async function saveOperatorCloud(
  op: OsuOperator & { deleted?: boolean }
): Promise<void> {
  const deletedSet = getDeletedLogins()
  const current = loadOperatorsLocal()
  const key = op.login.toLowerCase()

  if (op.deleted) {
    deletedSet.add(key)
    saveDeletedLogins(deletedSet)
    saveOperatorsLocal(
      current.filter((item) => item.login.toLowerCase() !== key),
      deletedSet
    )
  } else {
    deletedSet.delete(key)
    saveDeletedLogins(deletedSet)
    const exists = current.some((item) => item.login.toLowerCase() === key)
    const next = exists
      ? current.map((item) => (item.login.toLowerCase() === key ? op : item))
      : [...current, op]
    saveOperatorsLocal(next, deletedSet)
  }

  try {
    const content = JSON.stringify(op).slice(0, 495)
    await supabase.from('chat_messages').insert({
      sender_slug: CLOUD_OPERATORS_SLUG,
      sender_name: op.name.slice(0, 40),
      content,
    })
  } catch {
    // ignore
  }
}

export function loadLeadStatesLocal(): Record<string, LeadStateRecord> {
  try {
    const raw = localStorage.getItem(LEAD_STATES_LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Record<string, LeadStateRecord>) : {}
  } catch {
    return {}
  }
}

export function saveLeadStatesLocal(states: Record<string, LeadStateRecord>) {
  try {
    localStorage.setItem(LEAD_STATES_LOCAL_KEY, JSON.stringify(states))
  } catch {
    // ignore
  }
}

export async function fetchLeadStatesCloud(): Promise<Record<string, LeadStateRecord>> {
  const local = loadLeadStatesLocal()
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('content, created_at')
      .eq('sender_slug', CLOUD_LEADS_STATE_SLUG)
      .order('created_at', { ascending: true })
      .limit(500)

    if (!error && Array.isArray(data)) {
      const merged: Record<string, LeadStateRecord> = { ...local }
      for (const row of data) {
        try {
          const rec = JSON.parse(row.content) as LeadStateRecord
          if (rec && rec.slug) {
            merged[rec.slug] = rec
          }
        } catch {
          // ignore
        }
      }
      saveLeadStatesLocal(merged)
      return merged
    }
  } catch {
    // fallback
  }
  return local
}

export async function updateLeadStateCloud(
  record: LeadStateRecord,
  channel?: RealtimeChannel | null
): Promise<void> {
  const current = loadLeadStatesLocal()
  current[record.slug] = record
  saveLeadStatesLocal(current)

  try {
    localBroadcast?.postMessage({ type: 'lead_state', payload: record })
  } catch {
    // ignore
  }

  if (channel) {
    try {
      await channel.send({
        type: 'broadcast',
        event: 'lead_state',
        payload: record,
      })
    } catch {
      // ignore
    }
  }

  try {
    const compact: LeadStateRecord = {
      slug: record.slug,
      leadNumber: record.leadNumber,
      status: record.status,
      operatorLogin: record.operatorLogin,
      operatorName: record.operatorName,
      updatedAt: record.updatedAt,
      note: record.note ? record.note.slice(0, 100) : undefined,
      priceSold: record.priceSold,
    }
    await supabase.from('chat_messages').insert({
      sender_slug: CLOUD_LEADS_STATE_SLUG,
      sender_name: record.operatorName.slice(0, 40),
      content: JSON.stringify(compact).slice(0, 495),
    })
  } catch {
    // ignore
  }
}

export async function syncOperatorActiveLead(
  payload: OperatorActiveSync,
  channel?: RealtimeChannel | null
): Promise<void> {
  try {
    localStorage.setItem(
      ACTIVE_SYNC_LOCAL_KEY + payload.operatorLogin.toLowerCase(),
      JSON.stringify(payload)
    )
    localBroadcast?.postMessage({ type: 'active_lead', payload })
  } catch {
    // ignore
  }

  if (channel) {
    try {
      await channel.send({
        type: 'broadcast',
        event: 'active_lead',
        payload,
      })
    } catch {
      // ignore
    }
  }

  try {
    const content = JSON.stringify(payload).slice(0, 490)
    await supabase.from('chat_messages').insert({
      sender_slug: 'osu_active_' + payload.operatorLogin.toLowerCase(),
      sender_name: payload.operatorName.slice(0, 40),
      content,
    })
  } catch {
    // ignore
  }
}

export async function fetchOperatorActiveLead(
  operatorLogin: string
): Promise<OperatorActiveSync | null> {
  const key = ACTIVE_SYNC_LOCAL_KEY + operatorLogin.toLowerCase()
  let localRec: OperatorActiveSync | null = null
  try {
    const local = localStorage.getItem(key)
    if (local) localRec = JSON.parse(local) as OperatorActiveSync
  } catch {
    // ignore
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('content, created_at')
      .eq('sender_slug', 'osu_active_' + operatorLogin.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)

    if (!error && Array.isArray(data) && data.length > 0) {
      const cloudRec = JSON.parse(data[0].content) as OperatorActiveSync
      if (!localRec || (cloudRec.updatedAt || 0) >= (localRec.updatedAt || 0)) {
        localStorage.setItem(key, JSON.stringify(cloudRec))
        return cloudRec
      }
    }
  } catch {
    // ignore
  }

  return localRec
}

export function subscribeOsuRealtime(
  onActiveLead: (payload: OperatorActiveSync) => void,
  onLeadState: (payload: LeadStateRecord) => void
): RealtimeChannel {
  if (localBroadcast) {
    localBroadcast.onmessage = (ev) => {
      if (ev.data?.type === 'active_lead' && ev.data.payload) {
        onActiveLead(ev.data.payload as OperatorActiveSync)
      } else if (ev.data?.type === 'lead_state' && ev.data.payload) {
        onLeadState(ev.data.payload as LeadStateRecord)
      }
    }
  }

  const channel = supabase.channel('osu_global_room', {
    config: { broadcast: { self: false } },
  })

  channel
    .on('broadcast', { event: 'active_lead' }, (msg) => {
      if (msg.payload) onActiveLead(msg.payload as OperatorActiveSync)
    })
    .on('broadcast', { event: 'lead_state' }, (msg) => {
      if (msg.payload) onLeadState(msg.payload as LeadStateRecord)
    })
    .subscribe()

  return channel
}
