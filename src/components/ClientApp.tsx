import React, { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Instagram,
  MapPin,
  MessageCircle,
  Moon,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Wrench,
  X,
} from 'lucide-react'
import type { Booking, BusySlot, ServiceItem, StoreConfig } from '../lib/types'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/types'
import { fallbackImg, useTheme } from '../lib/config'
import { fmtDateTime, generateTimeSlots, isDayOff, kzt } from '../lib/slots'
import { createStoreBooking, fetchBusySlots, fetchStoreBookings } from '../lib/supabase'

const MY_BOOKING_KEY = 'aktau_my_last_booking_'

const LINE_LABELS = [
  'Линия 1 · Главный приёмщик / Запись',
  'Линия 2 · Мастер цеха / Консультация',
  'Линия 3 · Детейлинг и подбор запчастей',
]

function cleanWaDigits(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('8') && d.length === 11) return '7' + d.slice(1)
  return d
}

function firstAvailableWorkday(cfg: StoreConfig) {
  const d = new Date()
  let safety = 0
  while (isDayOff(cfg, d) && safety < 7) {
    d.setDate(d.getDate() + 1)
    safety++
  }
  return d
}

interface BookModalProps {
  cfg: StoreConfig
  busy: BusySlot[]
  presetServiceId?: string
  onClose: () => void
  onCreated: (booking: Booking) => void
}

function BookModal({ cfg, busy, presetServiceId, onClose, onCreated }: BookModalProps) {
  const [selectedSvc, setSelectedSvc] = useState<ServiceItem>(
    () => cfg.services.find((s) => s.id === presetServiceId) ?? cfg.services[0]
  )
  const [selectedDay, setSelectedDay] = useState<Date>(() => firstAvailableWorkday(cfg))
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null)
  const [selectedLine, setSelectedLine] = useState<string>(cfg.allPhones[0] || cfg.phone)
  const [form, setForm] = useState({ name: '', phone: '+7 ', car: '' })
  const [errorMsg, setErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null)

  const availableDays = useMemo(() => {
    const list: Date[] = []
    for (let i = 0; i < 14; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      if (!isDayOff(cfg, d)) list.push(d)
    }
    return list
  }, [cfg])

  const slots = useMemo(
    () => generateTimeSlots(cfg, busy, selectedDay, selectedSvc.duration),
    [cfg, busy, selectedDay, selectedSvc]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot) {
      setErrorMsg('Выберите удобное время записи')
      return
    }
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 10 || !form.car.trim()) {
      setErrorMsg('Укажите ваше имя, номер телефона и марку авто')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const startsAt = selectedSlot.toISOString()
      const endsAt = new Date(
        selectedSlot.getTime() + selectedSvc.duration * 60000
      ).toISOString()

      const { booking } = await createStoreBooking({
        store_slug: cfg.slug,
        name: form.name.trim(),
        phone: form.phone.trim(),
        car: form.car.trim(),
        service_name: selectedSvc.name,
        price: selectedSvc.price,
        starts_at: startsAt,
        ends_at: endsAt,
      })

      setCreatedBooking(booking)
      onCreated(booking)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка при сохранении записи')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sheet-backdrop md:items-center md:p-4" onClick={onClose}>
      <div
        className="sheet-panel md:rounded-3xl md:border md:max-w-lg space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Онлайн-запись"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider muted">
              {cfg.name} · {cfg.city}
            </span>
            <h2 className="display text-xl mt-0.5">
              {createdBooking ? 'Заявка принята!' : 'Запись в автосервис'}
            </h2>
          </div>
          <button
            className="btn-glass !p-2.5 !rounded-full"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdBooking ? (
          <div className="space-y-4 py-2">
            <div className="card-surface p-4 space-y-3 border border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 grid place-items-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-base">{createdBooking.service_name}</div>
                  <div className="text-xs muted">
                    {fmtDateTime(createdBooking.starts_at)} · {kzt(createdBooking.price)}
                  </div>
                </div>
              </div>
              <div className="text-xs muted pt-2 border-t border-white/10 space-y-1">
                <div>
                  <b>Автомобиль:</b> {createdBooking.car}
                </div>
                <div>
                  <b>Клиент:</b> {createdBooking.name} ({createdBooking.phone})
                </div>
                <div>
                  <b>Адрес СТО:</b> {cfg.address}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider muted">
                Отправить подтверждение мастеру в WhatsApp:
              </div>
              {cfg.allPhones.map((ph, idx) => {
                const digits = cleanWaDigits(ph)
                return (
                  <a
                    key={ph}
                    href={`https://wa.me/${digits}?text=${encodeURIComponent(
                      `Здравствуйте! Я записался онлайн в ${cfg.name}:\n🛠 Услуга: ${createdBooking.service_name}\n📅 Время: ${fmtDateTime(createdBooking.starts_at)}\n🚗 Авто: ${createdBooking.car}\n👤 Имя: ${createdBooking.name} (${createdBooking.phone})`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className={idx === 0 ? 'btn-accent w-full text-xs' : 'btn-glass w-full text-xs'}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      WhatsApp {ph} ({LINE_LABELS[idx] || `Линия ${idx + 1}`})
                    </span>
                  </a>
                )
              })}

              <a
                href={`/${cfg.slug}/admin`}
                className="btn-glass w-full text-xs mt-2"
              >
                Посмотреть эту заявку в CRM владельца →
              </a>
              <button className="btn-glass w-full text-xs" onClick={onClose}>
                Закрыть окно
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider muted block mb-1.5">
                1. Выберите услугу
              </label>
              <select
                className="inp"
                value={selectedSvc.id}
                onChange={(e) => {
                  const found = cfg.services.find((s) => s.id === e.target.value)
                  if (found) {
                    setSelectedSvc(found)
                    setSelectedSlot(null)
                  }
                }}
              >
                {cfg.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — от {kzt(s.price)} (~{s.duration} мин)
                  </option>
                ))}
              </select>
            </div>

            {cfg.allPhones.length > 1 && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider muted block mb-1.5">
                  Выберите линию / приёмщика ({cfg.allPhones.length} номера подключено)
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {cfg.allPhones.map((ph, idx) => (
                    <button
                      type="button"
                      key={ph}
                      onClick={() => setSelectedLine(ph)}
                      className={`p-2.5 rounded-xl border text-left text-xs flex items-center justify-between transition ${
                        selectedLine === ph
                          ? 'border-emerald-400 bg-emerald-500/10 font-bold'
                          : 'card-surface opacity-80'
                      }`}
                    >
                      <span>{LINE_LABELS[idx] || `Мастер-приёмщик #${idx + 1}`}</span>
                      <span className="font-mono font-bold">{ph}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider muted block mb-1.5">
                2. День визита
              </label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {availableDays.map((d) => {
                  const active = d.toDateString() === selectedDay.toDateString()
                  return (
                    <button
                      type="button"
                      key={d.toISOString()}
                      onClick={() => {
                        setSelectedDay(d)
                        setSelectedSlot(null)
                      }}
                      className={`pill ${active ? 'pill-active' : ''}`}
                    >
                      {d.toLocaleDateString('ru-RU', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider muted block mb-1.5">
                3. Свободное время ({cfg.hours.open}–{cfg.hours.close})
              </label>
              {slots.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map(({ time, free }) => {
                    const isSelected =
                      selectedSlot && selectedSlot.getTime() === time.getTime()
                    return (
                      <button
                        type="button"
                        key={time.toISOString()}
                        disabled={!free}
                        onClick={() => setSelectedSlot(time)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition ${
                          isSelected
                            ? 'pill-active'
                            : free
                            ? 'card-surface hover:border-white/30'
                            : 'opacity-30 line-through cursor-not-allowed card-surface'
                        }`}
                      >
                        {time.toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs muted py-2">
                  На выбранный день свободных окон нет. Выберите следующую дату.
                </p>
              )}
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="text-xs font-bold uppercase tracking-wider muted block">
                4. Данные автомобиля и контакт
              </label>
              <input
                className="inp"
                placeholder="Марка, модель и год (например: Toyota Camry 70, Zeekr 001)"
                value={form.car}
                onChange={(e) => setForm({ ...form, car: e.target.value })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  className="inp"
                  placeholder="Ваше имя"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="inp"
                  placeholder="Телефон (+7 701 ...)"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            {errorMsg && (
              <div className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2.5">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-accent w-full text-base"
            >
              {submitting ? 'Сохраняем запись...' : `Записаться · от ${kzt(selectedSvc.price)}`}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ClientApp({ cfg }: { cfg: StoreConfig }) {
  const [activeTab, setActiveTab] = useState<'home' | 'services' | 'reviews' | 'info'>('home')
  const [selectedCategory, setSelectedCategory] = useState<string>('Все')
  const [bookingModalSvc, setBookingModalSvc] = useState<string | null>(null)
  const [busySlots, setBusySlots] = useState<BusySlot[]>([])
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<any>(null)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [showPhonesSheet, setShowPhonesSheet] = useState(false)
  const [theme, toggleTheme] = useTheme()

  const loadData = async () => {
    const [busy, allBk] = await Promise.all([
      fetchBusySlots(cfg.slug),
      fetchStoreBookings(cfg.slug),
    ])
    setBusySlots(busy)
    const savedId = localStorage.getItem(MY_BOOKING_KEY + cfg.slug)
    if (savedId) {
      setMyBookings(allBk.filter((b) => b.id === savedId))
    } else {
      setMyBookings(allBk.slice(-1))
    }
  }

  useEffect(() => {
    loadData()
    const handler = (e: Event) => {
      e.preventDefault()
      setPwaInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [cfg.slug])

  const categories = useMemo(() => {
    const set = new Set<string>(['Все'])
    cfg.services.forEach((s) => {
      if (s.category) set.add(s.category)
    })
    return Array.from(set)
  }, [cfg.services])

  const filteredServices = useMemo(() => {
    if (selectedCategory === 'Все') return cfg.services
    return cfg.services.filter((s) => s.category === selectedCategory)
  }, [cfg.services, selectedCategory])

  const minPrice = useMemo(
    () => Math.min(...cfg.services.map((s) => s.price)),
    [cfg.services]
  )

  const heroImage = cfg.heroPhoto || fallbackImg(cfg.accent, cfg.name)

  const handleInstallClick = async () => {
    if (pwaInstallPrompt) {
      pwaInstallPrompt.prompt()
      await pwaInstallPrompt.userChoice
      setPwaInstallPrompt(null)
    } else {
      setShowInstallHelp(true)
    }
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto pb-32 md:pb-16 relative select-none sm:select-auto">
      {/* Верхний демо-баннер */}
      {cfg.demo && (
        <div className="px-4 py-2 text-xs font-semibold text-center bg-white/5 border-b border-white/10 flex items-center justify-center gap-2 flex-wrap">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
          <span>Система онлайн-записи и CRM для {cfg.name}</span>
          <a
            href={`/${cfg.slug}/admin`}
            className="underline font-bold ml-1"
            style={{ color: 'rgb(var(--accent))' }}
          >
            Открыть CRM-панель владельца →
          </a>
        </div>
      )}

      {/* Шапка сайта */}
      <header className="sticky top-0 z-30 px-4 md:px-8 py-3.5 flex items-center justify-between gap-4 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          {cfg.logo ? (
            <img
              src={cfg.logo}
              alt={cfg.name}
              className="w-11 h-11 rounded-2xl object-cover border border-white/15 shrink-0"
            />
          ) : (
            <div
              className="w-11 h-11 rounded-2xl grid place-items-center font-extrabold text-base shrink-0 shadow-lg"
              style={{
                background: 'rgb(var(--accent))',
                color: 'var(--accent-fg)',
              }}
            >
              <Car className="w-6 h-6" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="display text-base md:text-lg font-extrabold truncate">{cfg.name}</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 shrink-0">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                {cfg.rating.toFixed(1)}
              </span>
            </div>
            <p className="text-xs muted truncate">{cfg.subtitle} · {cfg.address}</p>
          </div>
        </div>

        {/* Навигация для ПК (Desktop Tabs) */}
        <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
          {([
            ['home', 'Обзор'],
            ['services', 'Услуги и прайс'],
            ['reviews', `Отзывы (${cfg.reviewsCount})`],
            ['info', 'Контакты и CRM'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === key ? 'pill-active' : 'muted hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            className="btn-glass !p-2.5 !rounded-2xl"
            aria-label="Переключить тему"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <a
            href={`/${cfg.slug}/admin`}
            className="hidden sm:inline-flex btn-glass !py-2.5 !px-3.5 !rounded-2xl text-xs"
          >
            <ShieldCheck className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            <span>CRM</span>
          </a>
          {cfg.allPhones.length > 1 ? (
            <button
              onClick={() => setShowPhonesSheet(true)}
              className="btn-accent !py-2.5 !px-4 !rounded-2xl text-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{cfg.allPhones.length} номера</span>
            </button>
          ) : (
            <a
              href={`tel:${cfg.phone}`}
              className="btn-accent !py-2.5 !px-4 !rounded-2xl text-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Позвонить</span>
            </a>
          )}
        </div>
      </header>

      {/* Основной контент */}
      <main className="px-4 md:px-8 pt-5 space-y-7">
        {activeTab === 'home' && (
          <>
            {/* Главный блок Hero + Боковая карточка на ПК */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <section className="lg:col-span-8 relative rounded-[2rem] overflow-hidden min-h-[23rem] md:min-h-[26rem] flex flex-col justify-between p-6 md:p-8 border border-white/10 shadow-2xl">
                <img
                  src={heroImage}
                  alt={cfg.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src = fallbackImg(cfg.accent, cfg.name)
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/25" />

                <div className="relative flex items-center justify-between gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-black/65 text-white backdrop-blur-md border border-white/15">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {cfg.workingHoursText}
                  </span>
                  <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-black/65 text-amber-300 backdrop-blur-md border border-white/15">
                    ★ {cfg.rating.toFixed(1)} · {cfg.reviewsCount} отзывов в 2ГИС
                  </span>
                </div>

                <div className="relative space-y-4 text-white pt-12 max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 text-xs md:text-sm text-white/85 font-medium">
                    <MapPin className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                    <span>{cfg.address}</span>
                  </div>
                  <h2 className="display text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight">
                    {cfg.tagline}
                  </h2>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      onClick={() => setBookingModalSvc('')}
                      className="btn-accent !py-3.5 !px-6 text-sm"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Записаться онлайн</span>
                    </button>
                    {cfg.allPhones.length > 1 ? (
                      <button
                        onClick={() => setShowPhonesSheet(true)}
                        className="btn-glass !bg-white/15 !text-white !border-white/20 !py-3.5 !px-6 text-sm"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Выбрать WhatsApp ({cfg.allPhones.length} линии)</span>
                      </button>
                    ) : (
                      <a
                        href={
                          cfg.whatsappPhone
                            ? `https://wa.me/${cfg.whatsappPhone}?text=${encodeURIComponent(
                                `Здравствуйте! Пишу с сайта-приложения ${cfg.name}. Хочу записаться на обслуживание.`
                              )}`
                            : `tel:${cfg.phone}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="btn-glass !bg-white/15 !text-white !border-white/20 !py-3.5 !px-6 text-sm"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Написать в WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              </section>

              {/* Правая колонка на ПК */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 flex-1">
                  <div className="card-surface p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between text-center lg:text-left">
                    <div className="text-xs muted">Стоимость обслуживания</div>
                    <div className="display text-base md:text-xl font-extrabold mt-1 lg:mt-0" style={{ color: 'rgb(var(--accent))' }}>
                      от {kzt(minPrice)}
                    </div>
                  </div>
                  <div className="card-surface p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between text-center lg:text-left">
                    <div className="text-xs muted">Народный рейтинг 2ГИС</div>
                    <div className="display text-base md:text-xl font-extrabold mt-1 lg:mt-0">
                      {cfg.rating.toFixed(1)} ★ ({cfg.reviewsCount})
                    </div>
                  </div>
                  <div className="card-surface p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between text-center lg:text-left">
                    <div className="text-xs muted">Часы приёма боксов</div>
                    <div className="display text-base md:text-xl font-extrabold mt-1 lg:mt-0">
                      {cfg.hours.open}–{cfg.hours.close}
                    </div>
                  </div>
                </div>

                {/* Установка PWA как приложения */}
                <div className="card-surface p-4 flex items-center justify-between gap-3 border border-white/15">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl grid place-items-center shrink-0"
                      style={{
                        background: 'rgb(var(--accent) / 0.15)',
                        color: 'rgb(var(--accent))',
                      }}
                    >
                      <Download className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">Приложение {cfg.name}</div>
                      <div className="text-xs muted">
                        Добавить иконку на главный экран телефона
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleInstallClick}
                    className="btn-glass !py-2 !px-3.5 text-xs shrink-0"
                  >
                    Установить
                  </button>
                </div>
              </div>
            </div>

            {/* Блок мульти-номеров (особенно для MarSagi и СТО с несколькими линиями!) */}
            {cfg.allPhones.length > 1 && (
              <section className="card-surface p-5 space-y-3 border border-emerald-500/25">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Многоканальная связь · {cfg.allPhones.length} активных номера
                    </span>
                    <h3 className="display text-base md:text-lg font-bold mt-0.5">
                      Прямая связь с мастерами и приёмкой {cfg.name}
                    </h3>
                  </div>
                  {cfg.instagram && (
                    <a
                      href={cfg.instagram}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-glass !py-2 !px-3.5 text-xs"
                    >
                      <Instagram className="w-4 h-4 text-pink-400" />
                      <span>Instagram</span>
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {cfg.allPhones.map((ph, idx) => {
                    const digits = cleanWaDigits(ph)
                    return (
                      <div
                        key={ph}
                        className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="text-[11px] muted font-semibold">
                            {LINE_LABELS[idx] || `Линия связи #${idx + 1}`}
                          </div>
                          <div className="display text-sm font-extrabold mt-1">{ph}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={`tel:${ph}`}
                            className="btn-glass !py-2 !px-2.5 text-xs"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Позвонить</span>
                          </a>
                          <a
                            href={`https://wa.me/${digits}?text=${encodeURIComponent(
                              `Здравствуйте! Пишу с сайта-приложения ${cfg.name}. Хочу записаться на обслуживание.`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-accent !py-2 !px-2.5 text-xs"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Статус моей записи */}
            {myBookings.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="display text-base font-bold">Ваш активный визит в сервис</h3>
                  <span className="text-xs muted">Статус обновляется в реальном времени</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {myBookings.map((bk) => (
                    <div
                      key={bk.id}
                      className="card-surface p-4 space-y-2 border-l-4"
                      style={{ borderLeftColor: 'rgb(var(--accent))' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm">{bk.service_name}</span>
                        {bk.status !== 'cancelled' && (
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                              STATUS_COLORS[bk.status]
                            }`}
                          >
                            {STATUS_LABELS[bk.status]}
                          </span>
                        )}
                      </div>
                      <div className="text-xs muted flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{fmtDateTime(bk.starts_at)}</span>
                        <span>·</span>
                        <span>{bk.car}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Категории и популярные услуги */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="display text-lg md:text-xl font-bold">Услуги и онлайн-запись</h3>
                  <p className="text-xs muted mt-0.5">
                    Выберите услугу, чтобы забронировать свободное время без ожидания в очереди
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('services')}
                  className="text-xs font-bold flex items-center gap-0.5 shrink-0"
                  style={{ color: 'rgb(var(--accent))' }}
                >
                  Все услуги ({cfg.services.length}) <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`pill ${selectedCategory === cat ? 'pill-active' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredServices.map((svc) => (
                  <div
                    key={svc.id}
                    onClick={() => setBookingModalSvc(svc.id)}
                    className="card-surface p-4 md:p-5 flex items-center justify-between gap-4 cursor-pointer hover:border-white/25 transition active:scale-[0.99]"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-white/5 muted">
                          {svc.category}
                        </span>
                        <span className="text-xs muted">~{svc.duration} мин</span>
                      </div>
                      <div className="font-bold text-sm sm:text-base">{svc.name}</div>
                      {svc.desc && <div className="text-xs muted line-clamp-2">{svc.desc}</div>}
                    </div>
                    <div className="text-right shrink-0 space-y-2">
                      <div
                        className="display text-sm md:text-base font-extrabold"
                        style={{ color: 'rgb(var(--accent))' }}
                      >
                        от {kzt(svc.price)}
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10">
                        Запись <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Реальные отзывы клиентов из 2ГИС */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="display text-lg md:text-xl font-bold">Отзывы клиентов в 2ГИС</h3>
                  <p className="text-xs muted">
                    Рейтинг {cfg.rating.toFixed(1)} ★ на основе {cfg.reviewsCount} оценок автовладельцев Актау
                  </p>
                </div>
                <a
                  href={cfg.twoGisUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-glass !py-2 !px-3.5 text-xs"
                >
                  <span>Карточка 2ГИС</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cfg.reviews.map((rev, i) => (
                  <div key={i} className="card-surface p-4 md:p-5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-white/10 grid place-items-center font-bold text-xs">
                          {rev.author[0]}
                        </div>
                        <div>
                          <div className="font-bold text-xs sm:text-sm">{rev.author}</div>
                          <div className="text-[11px] muted">Подтверждённый отзыв · 2ГИС</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 text-amber-400 text-xs font-bold">
                        {'★'.repeat(rev.rating)}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed opacity-90">{rev.text}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === 'services' && (
          <section className="space-y-4">
            <div>
              <h2 className="display text-2xl font-extrabold">Прайс-лист и запись</h2>
              <p className="text-xs muted mt-1">
                Нажмите на любую услугу, чтобы выбрать свободный бокс и время
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cfg.services.map((svc) => (
                <div
                  key={svc.id}
                  onClick={() => setBookingModalSvc(svc.id)}
                  className="card-surface p-5 flex items-center justify-between gap-4 cursor-pointer hover:border-white/25 transition"
                >
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 muted">
                      {svc.category} · ~{svc.duration} мин
                    </span>
                    <div className="font-bold text-base">{svc.name}</div>
                    {svc.desc && <div className="text-xs muted">{svc.desc}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="display text-sm font-extrabold"
                      style={{ color: 'rgb(var(--accent))' }}
                    >
                      от {kzt(svc.price)}
                    </div>
                    <div className="text-xs muted mt-1">Выбрать слот →</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="space-y-4">
            <div className="card-surface p-5 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase font-bold muted">Народный рейтинг Актау</div>
                <div className="display text-3xl font-extrabold mt-1">
                  {cfg.rating.toFixed(1)} <span className="text-amber-400">★</span>
                </div>
                <div className="text-xs muted mt-0.5">
                  Всего оценок в 2ГИС: {cfg.reviewsCount}
                </div>
              </div>
              <a
                href={cfg.twoGisUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-accent !py-2.5 !px-4 text-xs"
              >
                Открыть в 2ГИС
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cfg.reviews.map((rev, i) => (
                <div key={i} className="card-surface p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <b className="text-sm">{rev.author}</b>
                    <span className="text-amber-400 text-xs font-bold">
                      {'★'.repeat(rev.rating)}
                    </span>
                  </div>
                  <p className="text-sm opacity-90 leading-relaxed">{rev.text}</p>
                  {rev.date && <div className="text-[11px] muted">{rev.date}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'info' && (
          <section className="space-y-4">
            <h2 className="display text-2xl font-extrabold">Контакты и оснащение</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card-surface p-5 space-y-3 text-sm">
                <div>
                  <div className="text-xs muted">Название автосервиса</div>
                  <div className="font-bold text-base">{cfg.nameFull || cfg.name}</div>
                </div>
                <div>
                  <div className="text-xs muted">Адрес в г. Актау</div>
                  <div className="font-bold">{cfg.address}</div>
                </div>
                <div>
                  <div className="text-xs muted">Режим работы</div>
                  <div className="font-bold">{cfg.workingHoursText}</div>
                </div>
                <div>
                  <div className="text-xs muted">
                    Подключённые телефоны и линии ({cfg.allPhones.length})
                  </div>
                  <div className="space-y-2 mt-2">
                    {cfg.allPhones.map((ph, idx) => {
                      const digits = cleanWaDigits(ph)
                      return (
                        <div
                          key={ph}
                          className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-[11px] muted">
                              {LINE_LABELS[idx] || `Линия #${idx + 1}`}
                            </div>
                            <a
                              href={`tel:${ph}`}
                              className="font-bold underline"
                              style={{ color: 'rgb(var(--accent))' }}
                            >
                              {ph}
                            </a>
                          </div>
                          <a
                            href={`https://wa.me/${digits}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-glass !py-1.5 !px-3 text-xs text-emerald-400"
                          >
                            WhatsApp
                          </a>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {cfg.attributes.length > 0 && (
                  <div className="card-surface p-5 space-y-3">
                    <div className="font-bold text-sm">Обслуживаемые марки и специализация (2ГИС)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cfg.attributes.map((attr) => (
                        <span
                          key={attr}
                          className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10"
                        >
                          {attr}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card-surface p-5 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <ShieldCheck className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                    <span>Кабинет управления (CRM для владельца)</span>
                  </div>
                  <p className="text-xs muted">
                    Владелец и приёмщики видят все поступающие онлайн-заявки, могут управлять {cfg.allPhones.length} подключёнными номерами, менять статус ремонта и уведомлять клиента в WhatsApp.
                  </p>
                  <a href={`/${cfg.slug}/admin`} className="btn-accent w-full text-sm">
                    Войти в CRM-панель {cfg.name} →
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Дисклеймер в самом конце */}
        <footer className="pt-6 pb-8">
          <div className="card-surface p-4 md:p-5 space-y-2 text-xs muted border border-dashed border-white/15">
            <div className="flex items-center gap-2 font-bold text-white/80">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Демонстрационный образец сайта-приложения</span>
            </div>
            <p className="leading-relaxed">
              Этот сайт создан в демонстрационных целях специально для презентации возможностей онлайн-записи автосервису <b>{cfg.name}</b> ({cfg.address}). Страница предназначена для ознакомления руководства сервиса.
            </p>
            <div className="pt-1 flex items-center justify-end text-[11px] opacity-75">
              <a href={`/${cfg.slug}/admin`} className="underline">
                Панель администратора (CRM) →
              </a>
            </div>
          </div>
        </footer>
      </main>

      {/* Модальное окно выбора одной из 3 линий связи */}
      {showPhonesSheet && (
        <div className="sheet-backdrop md:items-center md:p-4" onClick={() => setShowPhonesSheet(false)}>
          <div
            className="sheet-panel md:rounded-3xl md:border md:max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Многоканальная линия {cfg.name}
                </span>
                <h3 className="display text-lg font-bold mt-0.5">
                  Выберите номер для связи
                </h3>
              </div>
              <button
                onClick={() => setShowPhonesSheet(false)}
                className="btn-glass !p-2 !rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {cfg.allPhones.map((ph, idx) => {
                const digits = cleanWaDigits(ph)
                return (
                  <div
                    key={ph}
                    className="card-surface p-4 space-y-2.5 border border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs muted font-semibold">
                        {LINE_LABELS[idx] || `Линия #${idx + 1}`}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">
                        На связи
                      </span>
                    </div>
                    <div className="display text-base font-extrabold">{ph}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={`tel:${ph}`} className="btn-glass !py-2.5 text-xs">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Позвонить</span>
                      </a>
                      <a
                        href={`https://wa.me/${digits}?text=${encodeURIComponent(
                          `Здравствуйте! Пишу с сайта-приложения ${cfg.name}. Хочу записаться на обслуживание.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-accent !py-2.5 text-xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно инструкции установки на главный экран */}
      {showInstallHelp && (
        <div className="sheet-backdrop md:items-center md:p-4" onClick={() => setShowInstallHelp(false)}>
          <div className="sheet-panel md:rounded-3xl md:border md:max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="display text-lg font-bold">Установка на главный экран</h3>
              <button
                onClick={() => setShowInstallHelp(false)}
                className="btn-glass !p-2 !rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="card-surface p-3.5">
                <b>На Android (Chrome):</b> нажмите на <b>три точки (⋮)</b> в правом верхнем углу браузера и выберите <b>«Добавить на главный экран»</b> или <b>«Установить приложение»</b>.
              </div>
              <div className="card-surface p-3.5">
                <b>На iPhone (Safari):</b> нажмите кнопку <b>«Поделиться» (квадрат со стрелкой вверх)</b> внизу экрана и выберите <b>«На экран „Домой“»</b>.
              </div>
            </div>
            <button
              onClick={() => setShowInstallHelp(false)}
              className="btn-accent w-full"
            >
              Готово
            </button>
          </div>
        </div>
      )}

      {/* Модальное окно онлайн-записи */}
      {bookingModalSvc !== null && (
        <BookModal
          cfg={cfg}
          busy={busySlots}
          presetServiceId={bookingModalSvc || undefined}
          onClose={() => setBookingModalSvc(null)}
          onCreated={(bk) => {
            localStorage.setItem(MY_BOOKING_KEY + cfg.slug, bk.id)
            loadData()
          }}
        />
      )}

      {/* Нижняя плавающая навигация для мобильных устройств */}
      <nav
        className="md:hidden fixed bottom-3 inset-x-3 z-40 max-w-md mx-auto glass px-3 py-2 flex items-center justify-around shadow-2xl"
        aria-label="Навигация приложения"
      >
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold px-3 py-1 rounded-xl transition ${
            activeTab === 'home' ? '' : 'muted'
          }`}
          style={activeTab === 'home' ? { color: 'rgb(var(--accent))' } : undefined}
        >
          <Car className="w-5 h-5" />
          <span>Главная</span>
        </button>

        <button
          onClick={() => setActiveTab('services')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold px-3 py-1 rounded-xl transition ${
            activeTab === 'services' ? '' : 'muted'
          }`}
          style={activeTab === 'services' ? { color: 'rgb(var(--accent))' } : undefined}
        >
          <Wrench className="w-5 h-5" />
          <span>Услуги</span>
        </button>

        <button
          onClick={() => setBookingModalSvc('')}
          className="btn-accent !px-4 !py-3 !rounded-2xl -mt-7 shadow-xl text-xs font-extrabold"
        >
          + Запись
        </button>

        <button
          onClick={() => setActiveTab('reviews')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold px-3 py-1 rounded-xl transition ${
            activeTab === 'reviews' ? '' : 'muted'
          }`}
          style={activeTab === 'reviews' ? { color: 'rgb(var(--accent))' } : undefined}
        >
          <Star className="w-5 h-5" />
          <span>Отзывы</span>
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`flex flex-col items-center gap-0.5 text-[11px] font-bold px-3 py-1 rounded-xl transition ${
            activeTab === 'info' ? '' : 'muted'
          }`}
          style={activeTab === 'info' ? { color: 'rgb(var(--accent))' } : undefined}
        >
          <MapPin className="w-5 h-5" />
          <span>Инфо</span>
        </button>
      </nav>
    </div>
  )
}
