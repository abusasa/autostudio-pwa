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
} from 'lucide-react'
import type { Booking, BookingStatus, StoreConfig } from '../lib/types'
import { STATUS_COLORS, STATUS_LABELS } from '../lib/types'
import { useTheme } from '../lib/config'
import { fmtDateTime, kzt } from '../lib/slots'
import {
  createStoreBooking,
  fetchStoreBookings,
  updateBookingStatus,
} from '../lib/supabase'

const VALID_PASSWORDS = ['1234', 'admin', 'pGE-HsT-Fc8-rdA']

export default function AdminCRM({ cfg }: { cfg: StoreConfig }) {
  const [unlocked, setUnlocked] = useState<boolean>(
    () => sessionStorage.getItem('crm_auth_' + cfg.slug) === '1'
  )
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | Exclude<BookingStatus, 'cancelled'>>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newBookingForm, setNewBookingForm] = useState({
    name: '',
    phone: '+7 ',
    car: '',
    serviceId: cfg.services[0]?.id || 'diag',
    startsAt: new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16),
  })
  const [theme, toggleTheme] = useTheme()

  const loadBookings = async () => {
    setLoading(true)
    const list = await fetchStoreBookings(cfg.slug)
    setBookings(list)
    setLoading(false)
  }

  useEffect(() => {
    if (!unlocked) return
    loadBookings()
    const timer = setInterval(loadBookings, 12000)
    return () => clearInterval(timer)
  }, [unlocked, cfg.slug])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (VALID_PASSWORDS.includes(passwordInput.trim())) {
      sessionStorage.setItem('crm_auth_' + cfg.slug, '1')
      setUnlocked(true)
      setAuthError('')
    } else {
      setAuthError('Неверный пароль (для демо используйте 1234 или кнопку быстрого входа)')
    }
  }

  const handleDemoUnlock = () => {
    sessionStorage.setItem('crm_auth_' + cfg.slug, '1')
    setUnlocked(true)
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

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const svc =
      cfg.services.find((s) => s.id === newBookingForm.serviceId) ?? cfg.services[0]
    const start = new Date(newBookingForm.startsAt)
    if (!newBookingForm.name.trim() || isNaN(start.getTime())) return

    const end = new Date(start.getTime() + (svc?.duration || 60) * 60000)
    await createStoreBooking({
      store_slug: cfg.slug,
      name: newBookingForm.name.trim(),
      phone: newBookingForm.phone.trim(),
      car: newBookingForm.car.trim() || 'Авто клиента',
      service_name: svc.name,
      price: svc.price,
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

  const seedDemoBookings = async () => {
    setLoading(true)
    const now = new Date()
    const samples = [
      {
        name: 'Ерлан Садыков',
        phone: '+7 701 445-12-90',
        car: 'Toyota Land Cruiser 200 · 727 AAA 12',
        svc: cfg.services[0],
        offsetHours: 2,
      },
      {
        name: 'Азамат К.',
        phone: '+7 702 881-34-19',
        car: 'Hyundai Sonata · 012 KZA 12',
        svc: cfg.services[1] || cfg.services[0],
        offsetHours: 4,
      },
    ]
    for (const s of samples) {
      const start = new Date(now.getTime() + s.offsetHours * 3600 * 1000)
      start.setMinutes(0, 0, 0)
      const end = new Date(start.getTime() + s.svc.duration * 60000)
      await createStoreBooking({
        store_slug: cfg.slug,
        name: s.name,
        phone: s.phone,
        car: s.car,
        service_name: s.svc.name,
        price: s.svc.price,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      })
    }
    await loadBookings()
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen grid place-items-center p-5">
        <div className="card-surface p-6 w-full max-w-sm space-y-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <a
              href={`/${cfg.slug}`}
              className="text-xs muted inline-flex items-center gap-1 hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> На страницу СТО
            </a>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/5 muted">
              Order Workflow CRM
            </span>
          </div>

          <div className="space-y-1">
            <div className="w-12 h-12 rounded-2xl grid place-items-center mb-3" style={{ background: 'rgb(var(--accent))', color: 'var(--accent-fg)' }}>
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="display text-2xl font-extrabold">{cfg.name}</h1>
            <p className="text-xs muted">
              Панель приёмщика и руководителя автосервиса ({cfg.address})
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="password"
              className="inp"
              placeholder="Пароль администратора (демо: 1234)"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
            {authError && <p className="text-xs text-red-400">{authError}</p>}
            <button type="submit" className="btn-accent w-full">
              Войти по паролю
            </button>
          </form>

          <div className="relative py-1 text-center">
            <span className="text-[11px] muted uppercase tracking-wider">или для презентации</span>
          </div>

          <button
            type="button"
            onClick={handleDemoUnlock}
            className="btn-glass w-full text-xs font-bold"
          >
            <Sparkles className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            Быстрый демо-вход (в 1 клик)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto pb-24 px-4 pt-4 space-y-5">
      {/* Верхняя панель CRM */}
      <header className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <a
              href={`/${cfg.slug}`}
              className="btn-glass !p-2 !rounded-xl"
              title="На витрину клиента"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider muted">
                Order Workflow Manager · Supabase Cloud
              </span>
              <h1 className="display text-xl sm:text-2xl font-extrabold">
                {cfg.name}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBookings}
            className="btn-glass !p-2.5 !rounded-xl"
            title="Обновить заявки"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={toggleTheme}
            className="btn-glass !p-2.5 !rounded-xl"
            title="Тема"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-accent !py-2.5 !px-3.5 !rounded-xl text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Записать</span>
          </button>
        </div>
      </header>

      {/* Виджеты показателей (как в референсе #6 Order Workflow Manager) */}
      <section className="grid grid-cols-3 gap-2.5">
        <div className="card-surface p-4">
          <div className="text-xs muted">Активных заявок</div>
          <div className="display text-2xl font-extrabold mt-1">{counts.all}</div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs muted">В боксах сейчас</div>
          <div className="display text-2xl font-extrabold mt-1 text-purple-400">
            {counts.in_repair + counts.confirmed}
          </div>
        </div>
        <div className="card-surface p-4">
          <div className="text-xs muted">Выручка (Готово)</div>
          <div
            className="display text-lg sm:text-xl font-extrabold mt-1"
            style={{ color: 'rgb(var(--accent))' }}
          >
            {kzt(revenueDone)}
          </div>
        </div>
      </section>

      {/* Поиск по госномеру / марке / клиенту */}
      <section className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 muted absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            className="inp !pl-10"
            placeholder="Поиск по марке авто, госномеру, имени или телефону..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </section>

      {/* Пиллы фильтрации по статусам (в стиле референса Order Workflow Manager) */}
      <section className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setStatusFilter('all')}
          className={`pill ${statusFilter === 'all' ? 'pill-active' : ''}`}
        >
          Все ({counts.all})
        </button>
        {(Object.keys(STATUS_LABELS) as Array<Exclude<BookingStatus, 'cancelled'>>).map(
          (st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`pill ${statusFilter === st ? 'pill-active' : ''}`}
            >
              {STATUS_LABELS[st]} ({counts[st]})
            </button>
          )
        )}
      </section>

      {/* Список карточек заказов */}
      <section className="space-y-3">
        {filteredBookings.length > 0 ? (
          filteredBookings.map((bk) => {
            const cleanClientPhone = bk.phone.replace(/\D/g, '').replace(/^8/, '7')
            const waClientUrl = `https://wa.me/${cleanClientPhone}?text=${encodeURIComponent(
              `Здравствуйте, ${bk.name}! Автосервис ${cfg.name} (${cfg.address}). По вашей записи на ${fmtDateTime(bk.starts_at)} (${bk.service_name}, авто ${bk.car}): статус — «${
                bk.status !== 'cancelled' ? STATUS_LABELS[bk.status] : 'Отменена'
              }».`
            )}`

            return (
              <div key={bk.id} className="card-surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="display text-sm font-extrabold">
                        {fmtDateTime(bk.starts_at)}
                      </span>
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
                    <div className="font-bold text-base mt-1">{bk.service_name}</div>
                  </div>
                  <div
                    className="display text-sm font-extrabold shrink-0"
                    style={{ color: 'rgb(var(--accent))' }}
                  >
                    {kzt(bk.price)}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-white/5 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 muted shrink-0" />
                    <span className="font-semibold">{bk.car}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 muted shrink-0" />
                    <a href={`tel:${bk.phone}`} className="font-semibold underline">
                      {bk.name} · {bk.phone}
                    </a>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <select
                    className="inp !w-auto !py-2 !px-3 text-xs font-bold"
                    value={bk.status}
                    onChange={(e) =>
                      handleStatusChange(bk.id, e.target.value as BookingStatus)
                    }
                  >
                    {Object.entries(STATUS_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        Статус: {label}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={waClientUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-glass !py-2 !px-3 text-xs text-emerald-400"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp клиенту</span>
                    </a>
                    <button
                      onClick={() =>
                        confirm('Удалить эту запись из расписания?') &&
                        handleStatusChange(bk.id, 'cancelled')
                      }
                      className="btn-glass !py-2 !px-2.5 text-xs text-red-400"
                      title="Отменить заявку"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="card-surface p-8 text-center space-y-3">
            <Filter className="w-8 h-8 muted mx-auto" />
            <div className="font-bold text-base">Пока нет активных заявок</div>
            <p className="text-xs muted max-w-sm mx-auto">
              Когда клиент запишется через мобильное приложение <b>/{cfg.slug}</b>, заявка мгновенно появится здесь. Для демонстрации вы можете загрузить 2 тестовые заявки в 1 клик:
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button onClick={seedDemoBookings} className="btn-accent text-xs">
                <Sparkles className="w-4 h-4" />
                Создать 2 тестовые заявки для демо
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Модальное окно ручного добавления записи приёмщиком */}
      {showAddModal && (
        <div className="sheet-backdrop" onClick={() => setShowAddModal(false)}>
          <div
            className="sheet-panel space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="display text-lg font-bold">Записать клиента вручную</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-glass !py-1.5 !px-3 text-xs"
              >
                Закрыть
              </button>
            </div>
            <form onSubmit={handleManualAdd} className="space-y-3">
              <input
                className="inp"
                placeholder="Имя клиента"
                value={newBookingForm.name}
                onChange={(e) =>
                  setNewBookingForm({ ...newBookingForm, name: e.target.value })
                }
              />
              <input
                className="inp"
                placeholder="Телефон (+7 701 ...)"
                value={newBookingForm.phone}
                onChange={(e) =>
                  setNewBookingForm({ ...newBookingForm, phone: e.target.value })
                }
              />
              <input
                className="inp"
                placeholder="Автомобиль и госномер"
                value={newBookingForm.car}
                onChange={(e) =>
                  setNewBookingForm({ ...newBookingForm, car: e.target.value })
                }
              />
              <select
                className="inp"
                value={newBookingForm.serviceId}
                onChange={(e) =>
                  setNewBookingForm({ ...newBookingForm, serviceId: e.target.value })
                }
              >
                {cfg.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {kzt(s.price)}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                className="inp"
                value={newBookingForm.startsAt}
                onChange={(e) =>
                  setNewBookingForm({ ...newBookingForm, startsAt: e.target.value })
                }
              />
              <button type="submit" className="btn-accent w-full">
                Добавить в расписание боксов
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
