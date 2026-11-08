import type { BusySlot, StoreConfig } from './types'

export const kzt = (n: number) =>
  new Intl.NumberFormat('ru-KZ').format(n) + ' ₸'

export const fmtDateTime = (isoOrDate: string | Date) => {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (isNaN(d.getTime())) return String(isoOrDate)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const fmtReviewDate = (dateStr: string) => {
  if (!dateStr) return 'Недавно'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export const isDayOff = (cfg: StoreConfig, day: Date) =>
  (cfg.daysOff || []).includes(day.getDay())

export const parseMinutes = (hhmm: string, isClose = false) => {
  if (!hhmm) return isClose ? 20 * 60 : 9 * 60
  const parts = hhmm.split(':').map(Number)
  const h = Number.isFinite(parts[0]) ? parts[0] : isClose ? 20 : 9
  const m = Number.isFinite(parts[1]) ? parts[1] : 0
  if (isClose) {
    // Если закрытие в 00:00, 01:00, 02:00, 03:00 ночи — считаем до 23:00 для дневной онлайн-записи
    if (h >= 0 && h <= 5) return 23 * 60
    if (h >= 24) return 23 * 60
  } else {
    // Если открытие 00:00 (круглосуточно) — начинаем слоты онлайн-записи с 09:00 утра
    if (h === 0 && m === 0) return 9 * 60
  }
  return h * 60 + m
}

export function generateTimeSlots(
  cfg: StoreConfig,
  busy: BusySlot[],
  day: Date,
  durationMin: number
) {
  if (isDayOff(cfg, day)) return []
  let openMin = parseMinutes(cfg.hours?.open || '09:00', false)
  let closeMin = parseMinutes(cfg.hours?.close || '20:00', true)
  if (closeMin <= openMin + 60) {
    openMin = 9 * 60
    closeMin = 20 * 60
  }

  const now = new Date()
  const out: { time: Date; free: boolean }[] = []
  const step = 60

  for (let m = openMin; m + Math.min(durationMin, 60) <= closeMin; m += step) {
    const start = new Date(day)
    start.setHours(Math.floor(m / 60), m % 60, 0, 0)
    const end = new Date(start.getTime() + durationMin * 60000)

    const overlapping = busy.filter(
      (b) => new Date(b.starts_at) < end && new Date(b.ends_at) > start
    ).length

    const isFuture = start.getTime() > now.getTime() + 15 * 60000
    out.push({
      time: start,
      free: isFuture && overlapping < (cfg.boxes || 2),
    })
  }
  return out
}
