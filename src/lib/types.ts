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
  leadNumber?: number
  branchId?: string
  name: string
  nameFull?: string
  category?: string
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
  photos?: string[]
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
  enabled?: boolean
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
  in_repair: 'В работе',
  ready: 'Готово',
  done: 'Завершено',
}

export const STATUS_COLORS: Record<Exclude<BookingStatus, 'cancelled'>, string> = {
  new: 'bg-zinc-200/15 text-zinc-200 border-zinc-400/30',
  confirmed: 'bg-zinc-400/15 text-zinc-300 border-zinc-500/30',
  in_repair: 'bg-zinc-500/15 text-zinc-300 border-zinc-600/30',
  ready: 'bg-zinc-100/20 text-zinc-100 border-zinc-300/40',
  done: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50',
}

// ==========================================
// ÖSU (ӨСУ) CALL CENTER & MULTI-OPERATOR CRM
// ==========================================

export type OperatorRole = 'admin' | 'operator'
export type DeviceMode = 'pc' | 'phone'

export interface OsuOperator {
  id: string
  login: string
  password: string
  name: string
  role: OperatorRole
  commissionKzt: number // 5000 тг за продажу
  createdAt: string
  active: boolean
  personalPath?: string
  statusNote?: string
  startsInDays?: number
  poolIndex?: number // 0, 1, 2, 3 для распределения базы без пересечений
}

export type LeadCallStatus =
  | 'new'
  | 'calling'
  | 'whatsapp_sent'
  | 'thinking'
  | 'sold'
  | 'rejected'
  | 'no_answer'

export type SoldPlanType = 'starter_15k' | 'business_35k' | 'domain_65k'

export interface LeadStateRecord {
  slug: string
  leadNumber: number
  status: LeadCallStatus
  operatorLogin: string
  operatorName: string
  updatedAt: string
  note?: string
  priceSold?: number
  planChosen?: SoldPlanType
}

export interface OperatorActiveSync {
  operatorLogin: string
  operatorName: string
  activeSlug: string
  leadNumber: number
  updatedAt: number
}

export const LEAD_STATUS_META: Record<
  LeadCallStatus,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  new: {
    label: 'Не звонили',
    shortLabel: 'Новый',
    badgeClass: 'bg-zinc-800/80 text-zinc-400 border-zinc-700',
  },
  calling: {
    label: 'На линии',
    shortLabel: 'Звонок',
    badgeClass: 'bg-zinc-300/15 text-zinc-200 border-zinc-400/40',
  },
  no_answer: {
    label: 'Не взял трубку',
    shortLabel: 'Не взял',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  },
  whatsapp_sent: {
    label: 'Отправлено демо в WA',
    shortLabel: 'Скинул WA',
    badgeClass: 'bg-zinc-700/50 text-zinc-200 border-zinc-500/40',
  },
  thinking: {
    label: 'Думает / Перезвонить',
    shortLabel: 'Думает',
    badgeClass: 'bg-zinc-600/30 text-zinc-200 border-zinc-500/40',
  },
  sold: {
    label: 'Продано (Оплачено)',
    shortLabel: 'Продано',
    badgeClass: 'bg-zinc-100 text-zinc-950 border-zinc-200 font-bold',
  },
  rejected: {
    label: 'Отказ',
    shortLabel: 'Отказ',
    badgeClass: 'bg-zinc-900 text-zinc-500 border-zinc-800',
  },
}
