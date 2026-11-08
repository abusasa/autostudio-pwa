import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Filter,
  Lock,
  MessageCircle,
  Moon,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import type { Booking, BookingStatus, ServiceItem, StoreConfig } from '../lib/types'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/types'
import { useTheme } from '../lib/config'
import { fmtDateTime, kzt } from '../lib/slots'
import {
  createStoreBooking,
  deleteStoreBooking,
  fetchStoreBookings,
  updateBookingStatus,
} from '../lib/supabase'

const VALID_PASSWORDS = ['1234', 'admin', 'marsagi', 'marsagi2026', '7070450093', 'pGE-HsT-Fc8-rdA']
export const CUSTOM_SERVICES_KEY = 'marsagi_custom_services'

export default function AdminCRM({ cfg }: { cfg: StoreConfig }) {
  const [unlocked, setUnlocked] = useState<boolean>(
    () => sessionStorage.getItem('crm_auth_' + cfg.slug) === '1'
  )
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [activeTab, setActiveTab] = useState<'bookings' | 'services'>('bookings')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | Exclude<BookingStatus, 'cancelled'>>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [theme, toggleTheme] = useTheme()

  // Управление услугами прейскуранта
  const [services, setServices] = useState<(ServiceItem & { priceSuv?: number })[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_SERVICES_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return (cfg.services || []) as (ServiceItem & { priceSuv?: number })[]
  })
  const [serviceSearch, setServiceSearch] = useState('')
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>('Все')
  const [showAddServiceModal, setShowAddServiceModal] = useState(false)
  const [newServiceForm, setNewServiceForm] = useState({
    name: '',
    category: 'Ходовая часть',
    price: 5000,
    priceSuv: 7000,
    duration: 45,
    desc: '',
  })

  const [newBookingForm, setNewBookingForm] = useState({
    name: '',
    phone: '+7 ',
    car: '',
    serviceId: cfg.services[0]?.id || 'diag',
    startsAt: new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16),
  })

  const loadBookings = async () => {
    setLoading(true)
    const list = await fetchStoreBookings(cfg.slug)
    // Фильтруем отмененные, чтобы не захламлять список
    setBookings(list.filter((b) => b.status !== 'cancelled'))
    setLoading(false)
  }

  useEffect(() => {
    if (!unlocked) return
    loadBookings()
    const timer = setInterval(loadBookings, 15000)
    return () => clearInterval(timer)
  }, [unlocked, cfg.slug])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (VALID_PASSWORDS.includes(passwordInput.trim())) {
      sessionStorage.setItem('crm_auth_' + cfg.slug, '1')
      setUnlocked(true)
      setAuthError('')
    } else {
      setAuthError('Неверный пароль. Введите корректный пароль руководителя.')
    }
  }

  const counts = useMemo(() => {
    const map = {
      all: bookings.length,
      new: 0,
      confirmed: 0,
      in_repair: 0,
      ready: 0,
      done: 0,
    }
    for (const b of bookings) {
      if (b.status !== 'cancelled' && map[b.status] !== undefined) {
        map[b.status]++
      }
    }
    return map
  }, [bookings])

  const revenueDone = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'done' || b.status === 'ready')
        .reduce((acc, b) => acc + (b.price || 0), 0),
    [bookings]
  )

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === 'cancelled') return false
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const hay = `${b.name} ${b.phone} ${b.car} ${b.service_name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [bookings, statusFilter, searchQuery])

  const handleStatusChange = async (id: string, nextStatus: BookingStatus) => {
    await updateBookingStatus(cfg.slug, id, nextStatus)
    await loadBookings()
  }

  const handleDeleteBooking = async (id: string) => {
    if (confirm('Вы действительно хотите удалить эту запись из расписания?')) {
      await deleteStoreBooking(cfg.slug, id)
      await loadBookings()
    }
  }

  // Удаление услуги из прейскуранта
  const handleDeleteService = (id: string, name: string) => {
    if (confirm(`Вы действительно хотите удалить услугу «${name}» из прейскуранта?`)) {
      const next = services.filter((s) => s.id !== id)
      setServices(next)
      localStorage.setItem(CUSTOM_SERVICES_KEY, JSON.stringify(next))
    }
  }

  // Добавление новой услуги
  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newServiceForm.name.trim()) return
    const newSvc: ServiceItem & { priceSuv?: number } = {
      id: 'custom-' + Date.now(),
      name: newServiceForm.name.trim(),
      category: newServiceForm.category,
      price: Number(newServiceForm.price) || 0,
      priceSuv: Number(newServiceForm.priceSuv) || Number(newServiceForm.price) || 0,
      duration: Number(newServiceForm.duration) || 30,
      desc: newServiceForm.desc.trim(),
    }
    const next = [newSvc, ...services]
    setServices(next)
    localStorage.setItem(CUSTOM_SERVICES_KEY, JSON.stringify(next))
    setShowAddServiceModal(false)
    setNewServiceForm({
      name: '',
      category: 'Ходовая часть',
      price: 5000,
      priceSuv: 7000,
      duration: 45,
      desc: '',
    })
  }

  // Сброс прейскуранта к исходному
  const handleResetServices = () => {
    if (confirm('Сбросить весь прейскурант к исходному списку из 157 услуг?')) {
      localStorage.removeItem(CUSTOM_SERVICES_KEY)
      setServices((cfg.services || []) as any)
    }
  }

  const serviceCategories = useMemo(() => {
    const set = new Set<string>(['Все'])
    services.forEach((s) => {
      if (s.category) set.add(s.category)
    })
    return Array.from(set)
  }, [services])

  const filteredServicesList = useMemo(() => {
    return services.filter((s) => {
      if (selectedServiceCategory !== 'Все' && s.category !== selectedServiceCategory) return false
      if (serviceSearch.trim()) {
        const q = serviceSearch.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          (s.desc && s.desc.toLowerCase().includes(q)) ||
          s.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [services, selectedServiceCategory, serviceSearch])

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const svc = services.find((s) => s.id === newBookingForm.serviceId) ?? services[0]
    const start = new Date(newBookingForm.startsAt)
    if (!newBookingForm.name.trim() || isNaN(start.getTime())) return

    const end = new Date(start.getTime() + (svc?.duration || 60) * 60000)
    await createStoreBooking({
      store_slug: cfg.slug,
      name: newBookingForm.name.trim(),
      phone: newBookingForm.phone.trim(),
      car: newBookingForm.car.trim() || 'Авто клиента',
      service_name: svc?.name || 'Услуга автосервиса',
      price: svc?.price || 0,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    })
    setShowAddModal(false)
    setNewBookingForm({
      ...newBookingForm,
      name: '',
      phone: '+7 ',
      car: '',
    })
    await loadBookings()
  }

  // ЭКРАН АВТОРИЗАЦИИ (БЕЗ ДЕМО-КНОПОК)
  if (!unlocked) {
    return (
      <div className="min-h-screen grid place-items-center p-4 bg-[var(--bg)]">
        <div className="card-surface p-6 sm:p-8 w-full max-w-sm space-y-6 shadow-2xl border border-[var(--line)]">
          <div className="flex items-center justify-between">
            <a
              href="/"
              className="text-xs muted inline-flex items-center gap-1 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> На главную
            </a>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/5 muted">
              Панель управления
            </span>
          </div>

          <div className="space-y-2">
            <div
              className="w-12 h-12 rounded-2xl grid place-items-center mb-3 shadow-md"
              style={{ background: cfg.accent, color: '#ffffff' }}
            >
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="display text-2xl font-extrabold">{cfg.name}</h1>
            <p className="text-xs muted leading-relaxed">
              Панель приёмщика и руководителя автосервиса ({cfg.city}, {cfg.address})
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider muted block mb-1.5">
                Пароль администратора
              </label>
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl border border-[var(--line)] bg-[var(--bg3)] text-sm focus:outline-none focus:border-[var(--accent)] transition"
                placeholder="Введите пароль"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
              />
            </div>
            {authError && (
              <p className="text-xs text-rose-500 font-semibold leading-relaxed">{authError}</p>
            )}
            <button type="submit" className="btn-accent w-full py-3 text-sm font-bold shadow-md">
              Войти в CRM
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto pb-24 px-3 sm:px-6 pt-5 space-y-6">
      {/* Верхняя навигация CRM */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="btn-glass !p-2.5 !rounded-xl"
            title="Перейти на клиентский сайт"
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider muted">
              Система управления автосервисом
            </span>
            <h1 className="display text-lg sm:text-2xl font-extrabold">
              {cfg.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Переключатель вкладок Заявки / Прейскурант */}
          <div className="inline-flex p-1 rounded-xl bg-[var(--bg3)] border border-[var(--line)]">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'bookings'
                  ? 'bg-[var(--card)] text-white shadow-sm'
                  : 'muted hover:opacity-100'
              }`}
            >
              Заявки ({counts.all})
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'services'
                  ? 'bg-[var(--card)] text-white shadow-sm'
                  : 'muted hover:opacity-100'
              }`}
            >
              Прейскурант ({services.length})
            </button>
          </div>

          <button
            onClick={loadBookings}
            className="btn-glass !p-2.5 !rounded-xl"
            title="Обновить"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={toggleTheme}
            className="btn-glass !p-2.5 !rounded-xl"
            title="Сменить тему"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ВКЛАДКА 1: ЗАЯВКИ И РАСПИСАНИЕ БОКСОВ */}
      {activeTab === 'bookings' && (
        <>
          {/* Виджеты показателей */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="card-surface p-4">
              <div className="text-xs muted font-semibold">Всего активных</div>
              <div className="display text-2xl font-extrabold mt-1">{counts.all}</div>
            </div>
            <div className="card-surface p-4">
              <div className="text-xs muted font-semibold">В работе (в боксах)</div>
              <div className="display text-2xl font-extrabold mt-1 text-sky-400">
                {counts.in_repair}
              </div>
            </div>
            <div className="card-surface p-4">
              <div className="text-xs muted font-semibold">Готово к выдаче</div>
              <div className="display text-2xl font-extrabold mt-1 text-emerald-400">
                {counts.ready}
              </div>
            </div>
            <div className="card-surface p-4">
              <div className="text-xs muted font-semibold">Выручка (завершено)</div>
              <div className="display text-xl sm:text-2xl font-black mt-1 text-emerald-400 truncate">
                {kzt(revenueDone)}
              </div>
            </div>
          </section>

          {/* Фильтры и поиск */}
          <section className="card-surface p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск по имени, номеру авто или телефону..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)] text-xs sm:text-sm focus:outline-none focus:border-[var(--accent)]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="btn-accent !py-2.5 !px-4 text-xs font-bold shrink-0 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Новая запись</span>
              </button>
            </div>

            {/* Статусные пилюли */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(
                [
                  ['all', `Все (${counts.all})`],
                  ['new', `Новые (${counts.new})`],
                  ['confirmed', `Подтверждены (${counts.confirmed})`],
                  ['in_repair', `В работе (${counts.in_repair})`],
                  ['ready', `Готово (${counts.ready})`],
                  ['done', `Выдано (${counts.done})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`pill text-xs whitespace-nowrap ${statusFilter === key ? 'pill-active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Список бронирований */}
          <section className="space-y-3">
            {filteredBookings.length > 0 ? (
              filteredBookings.map((bk) => {
                const waPhone = bk.phone.replace(/\D/g, '')
                const waClientUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
                  `Здравствуйте, ${bk.name}! Пишем из автосервиса «${cfg.name}». Статус по вашей машине (${bk.car}): ${STATUS_LABELS[bk.status] || bk.status}.`
                )}`

                return (
                  <div
                    key={bk.id}
                    className="card-surface p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            backgroundColor: STATUS_COLORS[bk.status]?.bg || 'rgba(255,255,255,0.08)',
                            color: STATUS_COLORS[bk.status]?.color || '#ffffff',
                          }}
                        >
                          {STATUS_LABELS[bk.status] || bk.status}
                        </span>
                        <span className="text-xs muted flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {fmtDateTime(bk.starts_at)}
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="font-extrabold text-base">{bk.name}</h4>
                        <a
                          href={`tel:${bk.phone}`}
                          className="text-xs muted hover:underline flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3" /> {bk.phone}
                        </a>
                      </div>

                      <div className="flex items-center gap-3 text-xs muted flex-wrap">
                        <span className="flex items-center gap-1 font-semibold text-[var(--fg)]">
                          <Car className="w-3.5 h-3.5 text-zinc-400" /> {bk.car}
                        </span>
                        <span>•</span>
                        <span>{bk.service_name}</span>
                        <span>•</span>
                        <span className="font-bold text-emerald-400">{kzt(bk.price)}</span>
                      </div>
                    </div>

                    {/* Кнопки управления статусом и удаление */}
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <select
                        value={bk.status}
                        onChange={(e) => handleStatusChange(bk.id, e.target.value as BookingStatus)}
                        className="px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)] text-xs font-semibold focus:outline-none"
                      >
                        {Object.entries(STATUS_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <a
                        href={waClientUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-glass !py-2 !px-3 text-xs text-emerald-400 flex items-center gap-1.5"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>

                      <button
                        onClick={() => handleDeleteBooking(bk.id)}
                        className="btn-glass !py-2 !px-2.5 text-xs text-rose-400 hover:bg-rose-500/10"
                        title="Удалить заявку навсегда"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="card-surface p-12 text-center space-y-3">
                <Filter className="w-8 h-8 muted mx-auto opacity-50" />
                <p className="text-sm font-semibold muted">Заявок в этой категории нет</p>
              </div>
            )}
          </section>
        </>
      )}

      {/* ВКЛАДКА 2: УПРАВЛЕНИЕ ПРЕЙСКУРАНТОМ УСЛУГ */}
      {activeTab === 'services' && (
        <section className="space-y-4">
          <div className="card-surface p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="display text-lg sm:text-xl font-extrabold">
                  Управление прейскурантом автосервиса
                </h3>
                <p className="text-xs muted mt-0.5">
                  Удаляйте неактуальные услуги, меняйте цены или добавляйте новые
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetServices}
                  className="btn-glass !py-2 !px-3 text-xs font-bold muted hover:text-white"
                  title="Восстановить исходный список из договора"
                >
                  Сбросить к заводскому
                </button>
                <button
                  onClick={() => setShowAddServiceModal(true)}
                  className="btn-accent !py-2 !px-3.5 text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить услугу</span>
                </button>
              </div>
            </div>

            {/* Поиск и категории */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Поиск по названию услуги..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)] text-xs sm:text-sm focus:outline-none focus:border-[var(--accent)]"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {serviceCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedServiceCategory(cat)}
                    className={`pill text-xs whitespace-nowrap ${
                      selectedServiceCategory === cat ? 'pill-active' : ''
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Список услуг с кнопкой удаления */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredServicesList.map((svc) => (
              <div
                key={svc.id}
                className="card-surface p-4 flex flex-col justify-between gap-3 border border-[var(--line)] hover:border-zinc-500 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${cfg.accent}15`, color: cfg.accent }}
                    >
                      {svc.category}
                    </span>
                    <button
                      onClick={() => handleDeleteService(svc.id, svc.name)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Удалить эту услугу из прейскуранта"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="font-bold text-sm sm:text-base leading-snug">{svc.name}</div>
                  {svc.desc && <div className="text-xs muted leading-relaxed">{svc.desc}</div>}
                </div>

                <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between text-xs">
                  <div>
                    <span className="muted text-[10px] block">Легковые:</span>
                    <span className="font-extrabold text-sm" style={{ color: cfg.accent }}>
                      {kzt(svc.price)}
                    </span>
                  </div>
                  {svc.priceSuv && (
                    <div className="text-right">
                      <span className="muted text-[10px] block">Внедорожники:</span>
                      <span className="font-extrabold text-sm text-sky-400">
                        {kzt(svc.priceSuv)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Модалка создания бронирования вручную */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card-surface p-6 w-full max-w-md space-y-4 shadow-2xl border border-[var(--line)]">
            <div className="flex items-center justify-between">
              <h3 className="display text-lg font-extrabold">Новая запись в бокс</h3>
              <button onClick={() => setShowAddModal(false)} className="muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualAdd} className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="muted block mb-1 font-semibold">Имя клиента</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  placeholder="Например: Арман"
                  value={newBookingForm.name}
                  onChange={(e) => setNewBookingForm({ ...newBookingForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="muted block mb-1 font-semibold">Телефон</label>
                <input
                  type="tel"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  placeholder="+7 701 000 00 00"
                  value={newBookingForm.phone}
                  onChange={(e) => setNewBookingForm({ ...newBookingForm, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="muted block mb-1 font-semibold">Марка и госномер авто</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  placeholder="Например: Toyota Camry 70 · 777 ABC 12"
                  value={newBookingForm.car}
                  onChange={(e) => setNewBookingForm({ ...newBookingForm, car: e.target.value })}
                />
              </div>

              <div>
                <label className="muted block mb-1 font-semibold">Услуга</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  value={newBookingForm.serviceId}
                  onChange={(e) =>
                    setNewBookingForm({ ...newBookingForm, serviceId: e.target.value })
                  }
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.category}: {s.name} ({kzt(s.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="muted block mb-1 font-semibold">Дата и время заезда</label>
                <input
                  type="datetime-local"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  value={newBookingForm.startsAt}
                  onChange={(e) =>
                    setNewBookingForm({ ...newBookingForm, startsAt: e.target.value })
                  }
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-glass !py-2 !px-4 text-xs"
                >
                  Отмена
                </button>
                <button type="submit" className="btn-accent !py-2 !px-4 text-xs font-bold">
                  Сохранить запись
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка добавления услуги */}
      {showAddServiceModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card-surface p-6 w-full max-w-md space-y-4 shadow-2xl border border-[var(--line)]">
            <div className="flex items-center justify-between">
              <h3 className="display text-lg font-extrabold">Добавить услугу в прейскурант</h3>
              <button
                onClick={() => setShowAddServiceModal(false)}
                className="muted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddService} className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="muted block mb-1 font-semibold">Категория</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  value={newServiceForm.category}
                  onChange={(e) =>
                    setNewServiceForm({ ...newServiceForm, category: e.target.value })
                  }
                >
                  <option value="Ходовая часть">Ходовая часть</option>
                  <option value="Тормозная система">Тормозная система</option>
                  <option value="Рулевое управление">Рулевое управление</option>
                  <option value="Система охлаждения">Система охлаждения</option>
                  <option value="Топливная система">Топливная система</option>
                  <option value="КПП – АКПП">КПП – АКПП</option>
                  <option value="Двигатель">Двигатель</option>
                  <option value="Детейлинг">Детейлинг и Мойка</option>
                </select>
              </div>

              <div>
                <label className="muted block mb-1 font-semibold">Название услуги</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Замена фильтра АКПП"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                  value={newServiceForm.name}
                  onChange={(e) => setNewServiceForm({ ...newServiceForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="muted block mb-1 font-semibold">Цена легковые (₸)</label>
                  <input
                    type="number"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                    value={newServiceForm.price}
                    onChange={(e) =>
                      setNewServiceForm({ ...newServiceForm, price: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className="muted block mb-1 font-semibold">Цена внедорожники (₸)</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)]"
                    value={newServiceForm.priceSuv}
                    onChange={(e) =>
                      setNewServiceForm({ ...newServiceForm, priceSuv: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="muted block mb-1 font-semibold">Краткое описание работы</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg3)] resize-none"
                  placeholder="Что входит в услугу..."
                  value={newServiceForm.desc}
                  onChange={(e) => setNewServiceForm({ ...newServiceForm, desc: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddServiceModal(false)}
                  className="btn-glass !py-2 !px-4 text-xs"
                >
                  Отмена
                </button>
                <button type="submit" className="btn-accent !py-2 !px-4 text-xs font-bold">
                  Добавить в прейскурант
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
