import type { BusySlot, StoreConfig } from './types'

export const kzt = (n: number) =>
  new Intl.NumberFormat('ru-KZ').format(n) + ' ₸'

export const fmtDateTime = (isoOrDate: string | Date) => {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const isDayOff = (cfg: StoreConfig, day: Date) =>
  cfg.daysOff.includes(day.getDay())

const parseMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 9) * 60 + (m || 0)
}

export function generateTimeSlots(
  cfg: StoreConfig,
  busy: BusySlot[],
  day: Date,
  durationMin: number
) {
  if (isDayOff(cfg, day)) return []
  const openMin = parseMinutes(cfg.hours.open || '09:00')
  const closeMin = parseMinutes(cfg.hours.close || '19:00')
  const now = new Date()
  const out: { time: Date; free: boolean }[] = []

  for (let m = openMin; m + durationMin <= closeMin; m += 60) {
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
