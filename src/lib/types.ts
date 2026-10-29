export interface ServiceItem {
  id: string
  category: string
  name: string
  price: number
  duration: number
  desc?: string
}

export interface ReviewItem {
  author: string
  rating: number
  date: string
  text: string
}

export interface StoreConfig {
  slug: string
  branchId?: string
  name: string
  nameFull?: string
  subtitle: string
  tagline: string
  city: string
  address: string
  phone: string
  allPhones: string[]
  whatsappPhone: string
  whatsappUrl: string
  instagram?: string
  rating: number
  reviewsCount: number
  heroPhoto: string
  logo: string
  accent: string
  demo: boolean
  workingHoursText: string
  hours: {
    open: string
    close: string
  }
  daysOff: number[]
  boxes: number
  rubrics: string[]
  attributes: string[]
  services: ServiceItem[]
  reviews: ReviewItem[]
  twoGisUrl: string
}

export type BookingStatus = 'new' | 'confirmed' | 'in_repair' | 'ready' | 'done' | 'cancelled'

export interface Booking {
  id: string
  store_slug: string
  name: string
  phone: string
  car: string
  service_name: string
  price: number
  starts_at: string
  ends_at: string
  status: BookingStatus
  created_at?: string
  comment?: string
}

export interface BusySlot {
  starts_at: string
  ends_at: string
}

export const STATUS_LABELS: Record<Exclude<BookingStatus, 'cancelled'>, string> = {
  new: 'Новая заявка',
  confirmed: 'Подтверждена',
  in_repair: 'В боксе (Ремонт)',
  ready: 'Готово к выдаче',
  done: 'Выдано клиенту',
}

export const STATUS_COLORS: Record<Exclude<BookingStatus, 'cancelled'>, string> = {
  new: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  confirmed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  in_repair: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  ready: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  done: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}
