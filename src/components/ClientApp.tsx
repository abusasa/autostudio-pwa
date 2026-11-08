import React, { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Briefcase,
  Calendar,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Filter,
  GraduationCap,
  HeartHandshake,
  Instagram,
  MapPin,
  MessageCircle,
  Moon,
  Phone,
  Scissors,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Stethoscope,
  Sun,
  Truck,
  Utensils,
  Wrench,
  X,
} from 'lucide-react'
import type { Booking, BusySlot, ServiceItem, StoreConfig } from '../lib/types'
import { STATUS_COLORS } from '../lib/types'
import { fallbackImg, useTheme } from '../lib/config'
import { getNichePreset } from '../lib/nichePresets'
import { fmtDateTime, fmtReviewDate, generateTimeSlots, isDayOff, kzt } from '../lib/slots'
import { createStoreBooking, fetchBusySlots, fetchStoreBookings, loadLeadStatesLocal } from '../lib/supabase'

const MY_BOOKING_KEY = 'aktau_my_last_booking_'

// Словарь синонимов и ассоциаций автосервиса для умного нестрогого поиска
const AUTO_SYNONYMS: Record<string, string[]> = {
  диагност: ['диагностика', 'вибростенд', 'сканер', 'проверка', 'осмотр', 'компьютерная'],
  ходовк: ['ходовая', 'подвеска', 'амортизатор', 'рычаг', 'сайлентблок', 'ступица', 'пружина', 'вибростенд'],
  подвеск: ['ходовая', 'амортизатор', 'рычаг', 'сайлентблок', 'пружина', 'вибростенд', 'шаровая'],
  мотор: ['двигатель', 'двс', 'грм', 'свечи', 'клапан', 'компрессия', 'масло'],
  двс: ['двигатель', 'мотор', 'грм', 'свечи', 'компрессия', 'масло', 'поршень'],
  двигател: ['двс', 'мотор', 'грм', 'свечи', 'компрессия', 'масло', 'диагностика'],
  коробк: ['кпп', 'акпп', 'мкпп', 'трансмиссия', 'сцепление', 'масло акпп'],
  акпп: ['кпп', 'коробка', 'трансмиссия', 'масло', 'фильтр акпп', 'промывка'],
  кпп: ['акпп', 'мкпп', 'трансмиссия', 'коробка', 'сцепление'],
  тормоз: ['колодки', 'диски', 'суппорт', 'проточка', 'жидкость', 'тж'],
  колодк: ['тормозная', 'тормоза', 'диски', 'суппорт', 'замена колодок'],
  диск: ['проточка', 'тормозной', 'колодки', 'суппорт'],
  проточк: ['диски', 'тормозные', 'колодки', 'суппорт'],
  рейк: ['рулевое', 'рулевая', 'гур', 'тяга', 'наконечник'],
  рулев: ['рейка', 'гур', 'тяга', 'наконечник', 'управление'],
  печк: ['охлаждение', 'промывка печки', 'радиатор', 'антифриз', 'салон'],
  охлажд: ['печка', 'антифриз', 'радиатор', 'термостат', 'помпа'],
  антифриз: ['охлаждение', 'радиатор', 'печка', 'термостат', 'замена'],
  форсунк: ['топливная', 'чистка форсунок', 'ультразвук', 'бензонасос', 'инжектор'],
  топлив: ['форсунки', 'бензонасос', 'фильтр', 'бак', 'чистка'],
  масл: ['замена масла', 'двс', 'акпп', 'фильтр', 'двигатель', 'мотор'],
  детейлинг: ['полировка', 'химчистка', 'мойка', 'оклейка', 'пленка'],
  пленк: ['детейлинг', 'оклейка', 'satin', 'бронепленка', 'кузов'],
  полировк: ['кузов', 'детейлинг', 'фары', 'царапины', 'лак'],
  химчистк: ['салон', 'кожа', 'потолок', 'сиденья', 'детейлинг'],
}

function computeServiceRelevance(svc: ServiceItem, query: string): number {
  const cleanQ = query.toLowerCase().trim()
  if (!cleanQ) return 1

  const name = (svc.name || '').toLowerCase()
  const desc = (svc.desc || '').toLowerCase()
  const cat = (svc.category || '').toLowerCase()
  const fullText = `${name} ${desc} ${cat}`

  // 1. Прямое совпадение всей поисковой фразы целиком
  if (name.includes(cleanQ)) return 100
  if (fullText.includes(cleanQ)) return 80

  // 2. Разбивка на отдельные слова
  const tokens = cleanQ
    .replace(/[^a-zа-яё0-9]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)

  if (tokens.length === 0) return 0

  let score = 0
  let matchedTokens = 0

  for (const token of tokens) {
    const isGeneric = [
      'авто',
      'автомобиль',
      'автомобиля',
      'машина',
      'машины',
      'ремонт',
      'замена',
      'сервис',
      'услуга',
      'услуги',
    ].includes(token)

    const stem = token.length > 4 ? token.slice(0, token.length - 2) : token
    let tokenMatched = false

    if (name.includes(token)) {
      score += 30
      tokenMatched = true
    } else if (name.includes(stem)) {
      score += 20
      tokenMatched = true
    } else if (fullText.includes(token)) {
      score += 15
      tokenMatched = true
    } else if (fullText.includes(stem)) {
      score += 10
      tokenMatched = true
    }

    // Проверка синонимов
    for (const [key, synList] of Object.entries(AUTO_SYNONYMS)) {
      if (token.startsWith(key) || key.startsWith(stem)) {
        for (const syn of synList) {
          if (fullText.includes(syn)) {
            score += 12
            tokenMatched = true
            break
          }
        }
      }
    }

    if (tokenMatched) {
      matchedTokens++
    } else if (isGeneric) {
      score += 4
    }
  }

  return matchedTokens > 0 ? score : 0
}

function cleanWaDigits(phone: string) {
  const d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('8') && d.length === 11) return '7' + d.slice(1)
  return d
}

function firstAvailableWorkday(cfg: StoreConfig) {
  const base = new Date()
  for (let i = 0; i < 10; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    if (!isDayOff(cfg, d)) {
      const testSlots = generateTimeSlots(cfg, [], d, 45)
      if (testSlots.some((s) => s.free)) {
        return d
      }
    }
  }
  return base
}

function NicheIcon({ group, className = 'w-5 h-5' }: { group: string; className?: string }) {
  switch (group) {
    case 'beauty':
      return <Scissors className={className} />
    case 'medical':
      return <Stethoscope className={className} />
    case 'food':
      return <Utensils className={className} />
    case 'home':
      return <Briefcase className={className} />
    case 'education':
      return <GraduationCap className={className} />
    default:
      return <Car className={className} />
  }
}

// Персонализированные блоки преимуществ и направлений под каждую рубрику
function getNicheShowcaseMeta(cfg: StoreConfig, group: string) {
  const cat = (cfg.category || '').toLowerCase()

  if (group === 'medical') {
    return {
      badge: 'Лицензированный подход · Забота о здоровье',
      heroCtaWa: 'Записаться на приём в WhatsApp',
      heroCtaForm: 'Оставить заявку в регистратуру',
      sectionTitle: 'Основные направления центра',
      sectionSub: 'Консультация специалистов, точная диагностика и внимательное отношение к каждому пациенту',
      showPrices: false,
      waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Хочу проконсультироваться и записаться на приём.`,
      highlights: [
        { title: 'Опытные специалисты', desc: 'Квалифицированный персонал и современные протоколы приёма' },
        { title: 'Без очередей', desc: 'Приём строго по предварительной записи в удобное для вас время' },
        { title: 'Стерильность и комфорт', desc: 'Современное оснащение кабинетов и бережный подход' },
      ],
    }
  }

  if (cat.includes('массаж') || cat.includes('спа')) {
    return {
      badge: 'Восстановление · Релакс · Забота о теле',
      heroCtaWa: 'Записаться на сеанс в WhatsApp',
      heroCtaForm: 'Подобрать программу',
      sectionTitle: 'Программы массажа и отдыха',
      sectionSub: 'Напишите нам в WhatsApp — подберём удобное окошко и подходящего мастера',
      showPrices: false,
      waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Подскажите свободные окошки на массаж?`,
      highlights: [
        { title: 'Профессиональные мастера', desc: 'Индивидуальный подбор техники под ваше состояние и запрос' },
        { title: 'Уютная атмосфера', desc: 'Чистые кабинеты, расслабляющая обстановка и одноразовые расходники' },
        { title: 'Быстрая запись в WhatsApp', desc: 'Согласуем удобное время визита за 1 минуту напрямую в чате' },
      ],
    }
  }

  if (group === 'beauty') {
    return {
      badge: 'Бьюти-пространство · Профессиональный уход',
      heroCtaWa: 'Написать в WhatsApp мастеру',
      heroCtaForm: 'Узнать свободное время',
      sectionTitle: 'Направления студии и уход',
      sectionSub: 'Качественные материалы, стерильность и внимание к каждой детали вашего образа',
      showPrices: cat.includes('барбер'),
      waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Подскажите свободное время для записи?`,
      highlights: [
        { title: 'Топ-мастера своего дела', desc: 'Работаем на проверенных материалах с гарантией качества' },
        { title: 'Уютная атмосфера', desc: 'Комфортная зона ожидания, чай/кофе и индивидуальный подход' },
        { title: 'Прямая связь в WhatsApp', desc: 'Пришлём примеры работ и подберём удобное время в один клик' },
      ],
    }
  }

  if (group === 'food') {
    return {
      badge: 'Свежие ингредиенты · Вкус и гостеприимство',
      heroCtaWa: 'Заказать / Написать в WhatsApp',
      heroCtaForm: 'Забронировать / Оставить заявку',
      sectionTitle: 'Наше меню и предложения',
      sectionSub: 'Готовим из свежих продуктов с любовью к каждому гостю и заказу',
      showPrices: true,
      waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Хочу сделать заказ / уточнить наличие.`,
      highlights: [
        { title: 'Всегда свежее', desc: 'Контроль качества ингредиентов и приготовление перед подачей' },
        { title: 'Быстрый заказ в WhatsApp', desc: 'Принимаем предзаказы, бронь столиков и индивидуальные пожелания' },
        { title: 'Высокая оценка гостей', desc: `Рейтинг ${cfg.rating.toFixed(1)} ★ на основе реальных отзывов в 2ГИС` },
      ],
    }
  }

  if (group === 'home') {
    return {
      badge: 'Работа по договору · Гарантия качества',
      heroCtaWa: 'Рассчитать стоимость в WhatsApp',
      heroCtaForm: 'Вызвать специалиста / Замер',
      sectionTitle: 'Виды выполняемых работ',
      sectionSub: 'Бесплатная консультация, точный расчёт сметы и соблюдение сроков',
      showPrices: true,
      waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Хочу рассчитать стоимость и проконсультироваться.`,
      highlights: [
        { title: 'Точный расчёт без переплат', desc: 'Фиксируем стоимость до начала работ и помогаем с выбором материалов' },
        { title: 'Опытная команда', desc: 'Соблюдаем технологию, чистоту и оговорённые сроки сдачи' },
        { title: 'Оценка по фото в WhatsApp', desc: 'Отправьте фото или размеры в WhatsApp для быстрого расчёта цены' },
      ],
    }
  }

  if (group === 'education') {
    return {
      badge: 'Развитие · Результат · Комфортные группы',
      heroCtaWa: 'Записаться на пробное в WhatsApp',
      heroCtaForm: 'Оставить заявку на обучение',
      sectionTitle: 'Программы и направления',
      sectionSub: 'Запишитесь на пробное посещение или получите консультацию в WhatsApp',
      showPrices: true,
      waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Хочу узнать расписание и записаться на пробное занятие.`,
      highlights: [
        { title: 'Индивидуальный подход', desc: 'Внимание к каждому ученику и комфортная атмосфера занятий' },
        { title: 'Удобное расписание', desc: 'Утренние, дневные и вечерние группы в удобном районе города' },
        { title: 'Пробное занятие', desc: 'Познакомьтесь с преподавателями и форматом перед началом курса' },
      ],
    }
  }

  return {
    badge: 'Профессиональный автосервис · Гарантия на работы',
    heroCtaWa: 'Написать мастеру в WhatsApp',
    heroCtaForm: 'Онлайн-запись в бокс',
    sectionTitle: 'Услуги и обслуживание',
    sectionSub: 'Выберите направление для записи ко времени без очередей',
    showPrices: true,
    waPrefill: `Здравствуйте! Пишу с вашего сайта «${cfg.name}». Хочу записаться на обслуживание.`,
    highlights: [
      { title: 'Профессиональная диагностика', desc: 'Точное выявление причины неисправности без навязывания лишних услуг' },
      { title: 'Запись ко времени', desc: 'Приезжайте к назначенному часу без ожидания в живой очереди' },
      { title: 'Прямая связь с мастером', desc: 'Согласование всех этапов работ и запчастей через WhatsApp' },
    ],
  }
}

interface BookModalProps {
  cfg: StoreConfig
  busy: BusySlot[]
  presetServiceId?: string
  onClose: () => void
  onCreated: (booking: Booking) => void
}

function BookModal({ cfg, busy, presetServiceId, onClose, onCreated }: BookModalProps) {
  const preset = useMemo(() => getNichePreset(cfg), [cfg])
  const showcase = useMemo(() => getNicheShowcaseMeta(cfg, preset.group), [cfg, preset.group])
  const isSlotBased = preset.group === 'auto'

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
    const base = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      if (isDayOff(cfg, d)) continue
      if (i === 0) {
        const todaySlots = generateTimeSlots(cfg, [], d, 45)
        if (!todaySlots.some((s) => s.free)) continue
      }
      list.push(d)
    }
    return list
  }, [cfg])

  const slots = useMemo(
    () => generateTimeSlots(cfg, busy, selectedDay, selectedSvc?.duration || 45),
    [cfg, busy, selectedDay, selectedSvc]
  )

  useEffect(() => {
    if (!selectedSlot && slots.length > 0) {
      const firstFree = slots.find((s) => s.free)
      if (firstFree) setSelectedSlot(firstFree.time)
    }
  }, [slots, selectedSlot])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isSlotBased && !selectedSlot) {
      setErrorMsg('Выберите удобное время записи')
      return
    }
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Укажите ваше имя и номер телефона')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const startObj = selectedSlot || new Date(Date.now() + 3600 * 1000)
      const startsAt = startObj.toISOString()
      const endsAt = new Date(
        startObj.getTime() + (selectedSvc?.duration || 45) * 60000
      ).toISOString()

      const { booking } = await createStoreBooking({
        store_slug: cfg.slug,
        name: form.name.trim(),
        phone: form.phone.trim(),
        car: form.car.trim() || 'Заявка с сайта',
        service_name: selectedSvc?.name || 'Консультация / Запись',
        price: selectedSvc?.price || 0,
        starts_at: startsAt,
        ends_at: endsAt,
      })

      setCreatedBooking(booking)
      onCreated(booking)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка при сохранении заявки')
    } finally {
      setSubmitting(false)
    }
  }

  const targetWaDigits = cleanWaDigits(selectedLine || cfg.whatsappPhone || cfg.phone)
  const waConfirmUrl = createdBooking
    ? `https://wa.me/${targetWaDigits}?text=${encodeURIComponent(
        `Здравствуйте! Оставил(а) заявку на сайте «${cfg.name}»:\n` +
          `• Направление: ${createdBooking.service_name}\n` +
          (isSlotBased ? `• Время: ${fmtDateTime(createdBooking.starts_at)}\n` : '') +
          `• Комментарий: ${createdBooking.car}\n` +
          `• Имя: ${createdBooking.name} (${createdBooking.phone})`
      )}`
    : ''

  return (
    <div className="sheet-backdrop md:items-center md:p-4" onClick={onClose}>
      <div
        className="sheet-panel md:rounded-2xl md:border md:max-w-lg space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
          <div>
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: 'rgb(var(--accent))' }}
            >
              {cfg.name} · {cfg.city}
            </span>
            <h3 className="display text-lg font-extrabold mt-0.5">
              {createdBooking
                ? 'Заявка принята!'
                : isSlotBased
                ? 'Онлайн-запись ко времени'
                : 'Быстрая заявка / Связь в WhatsApp'}
            </h3>
          </div>
          <button onClick={onClose} className="btn-glass !p-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdBooking ? (
          <div className="space-y-4 py-2">
            <div className="card-surface p-4 space-y-2 border border-[var(--line)]">
              <div className="flex items-center gap-2 font-bold text-sm" style={{ color: 'rgb(var(--accent))' }}>
                <CheckCircle2 className="w-5 h-5" />
                <span>Ваша заявка передана в {cfg.name}</span>
              </div>
              <div className="text-xs space-y-1 pt-1">
                <div>
                  <span className="muted">Направление:</span> <b>{createdBooking.service_name}</b>
                </div>
                {isSlotBased && (
                  <div>
                    <span className="muted">Дата и время:</span>{' '}
                    <b>{fmtDateTime(createdBooking.starts_at)}</b>
                  </div>
                )}
                <div>
                  <span className="muted">Контакт:</span>{' '}
                  <b>
                    {createdBooking.name} ({createdBooking.phone})
                  </b>
                </div>
              </div>
            </div>

            <a
              href={waConfirmUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-accent w-full text-sm py-3.5"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Продублировать в WhatsApp для мгновенного ответа</span>
            </a>

            <button onClick={onClose} className="btn-glass w-full text-xs py-2.5">
              Вернуться на сайт
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Прямой переход в WhatsApp без заполнения полей */}
            <a
              href={`https://wa.me/${targetWaDigits}?text=${encodeURIComponent(
                showcase.waPrefill
              )}`}
              target="_blank"
              rel="noreferrer"
              className="btn-accent w-full text-sm py-3.5"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{showcase.heroCtaWa} (в 1 клик)</span>
            </a>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[var(--line)]" />
              <span className="flex-shrink mx-3 text-[11px] uppercase tracking-wider muted font-semibold">
                или оставьте контакты для обратного звонка
              </span>
              <div className="flex-grow border-t border-[var(--line)]" />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider muted block mb-1.5">
                Интересующее направление
              </label>
              <select
                className="inp"
                value={selectedSvc?.id}
                onChange={(e) => {
                  const found = cfg.services.find((s) => s.id === e.target.value)
                  if (found) setSelectedSvc(found)
                }}
              >
                {cfg.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {showcase.showPrices && s.price ? ` — от ${kzt(s.price)}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {isSlotBased && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider muted block mb-1.5">
                    День визита
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
                    Свободное время ({cfg.hours.open}–{cfg.hours.close})
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
                            className={`py-2 px-2 rounded-lg text-xs font-bold border transition ${
                              isSelected
                                ? 'pill-active'
                                : free
                                ? 'card-surface hover:border-zinc-400'
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
                      Выберите удобный день или напишите нам напрямую в WhatsApp.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  className="inp"
                  placeholder="Ваше имя"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <input
                  className="inp"
                  placeholder="Ваш телефон (+7 701 ...)"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <input
                className="inp"
                placeholder={preset.itemFieldPlaceholder}
                value={form.car}
                onChange={(e) => setForm({ ...form, car: e.target.value })}
              />
            </div>

            {errorMsg && (
              <div className="text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-glass w-full text-sm py-3 font-bold"
            >
              {submitting ? 'Отправляем...' : 'Оставить заявку на обратный звонок'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ClientApp({ cfg }: { cfg: StoreConfig }) {
  const preset = useMemo(() => getNichePreset(cfg), [cfg])
  const showcase = useMemo(() => getNicheShowcaseMeta(cfg, preset.group), [cfg, preset.group])
  const [activeTab, setActiveTab] = useState<'home' | 'services' | 'reviews' | 'info'>('home')
  const [selectedCategory, setSelectedCategory] = useState<string>('Все')
  const [searchQuery, setSearchQuery] = useState('')
  const [vehicleType, setVehicleType] = useState<'sedan' | 'suv'>('sedan')
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

  const [customServices, setCustomServices] = useState<ServiceItem[] | null>(() => {
    try {
      const raw = localStorage.getItem('marsagi_custom_services')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {
      // fallback
    }
    return null
  })

  useEffect(() => {
    const syncServices = () => {
      try {
        const raw = localStorage.getItem('marsagi_custom_services')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCustomServices(parsed)
            return
          }
        }
        setCustomServices(null)
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', syncServices)
    window.addEventListener('focus', syncServices)
    return () => {
      window.removeEventListener('storage', syncServices)
      window.removeEventListener('focus', syncServices)
    }
  }, [])

  const activeServices = useMemo(() => {
    return customServices || cfg.services
  }, [customServices, cfg.services])

  const categories = useMemo(() => {
    const set = new Set<string>(['Все'])
    activeServices.forEach((s) => {
      if (s.category) set.add(s.category)
    })
    return Array.from(set)
  }, [activeServices])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Все: activeServices.length }
    activeServices.forEach((s) => {
      const cat = s.category || 'Прочее'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [activeServices])

  const categoryHighlights = useMemo(() => {
    return [
      {
        id: 'chassis',
        title: 'Ходовая часть',
        sub: 'Вибростенд, амортизаторы, рычаги, сайлентблоки, ступицы, пружины',
        tag: '38 услуг',
        icon: Wrench,
      },
      {
        id: 'brakes',
        title: 'Тормозная система',
        sub: 'Проточка тормозных дисков, колодки, суппорта, замена ТЖ аппаратом',
        tag: '18 услуг',
        icon: ShieldCheck,
      },
      {
        id: 'steering',
        title: 'Рулевое управление',
        sub: 'Ремонт и регулировка рулевых реек, насосы ГУР, тяги, наконечники',
        tag: '13 услуг',
        icon: SlidersHorizontal,
      },
      {
        id: 'cooling',
        title: 'Система охлаждения',
        sub: 'Аппаратная промывка печки салона, замена антифриза, радиаторы',
        tag: '15 услуг',
        icon: Sparkles,
      },
      {
        id: 'fuel',
        title: 'Топливная система',
        sub: 'Ультразвуковая чистка форсунок, замена бензонасосов, фильтров и бака',
        tag: '8 услуг',
        icon: Filter,
      },
      {
        id: 'transmission',
        title: 'КПП – АКПП',
        sub: 'Замена масел АКПП/МКПП с промывкой, замена сцепления, ремонт трансмиссий',
        tag: '22 услуги',
        icon: Briefcase,
      },
      {
        id: 'engine',
        title: 'Двигатель',
        sub: 'Компьютерная диагностика, замена ГРМ, свечей, замер компрессии, капремонт',
        tag: '35 услуг',
        icon: Car,
      },
      {
        id: 'detailing',
        title: 'Детейлинг',
        sub: 'Полировка кузова, химчистка салона, оклейка пленкой Satin R1, мойка',
        tag: '8 услуг',
        icon: Sparkles,
      },
    ]
  }, [])

  const filteredServices = useMemo(() => {
    let list = (activeServices || []) as (ServiceItem & { priceSuv?: number })[]

    if (selectedCategory !== 'Все') {
      const target = selectedCategory.toLowerCase()
      list = list.filter(
        (s) =>
          (s.category || '').toLowerCase().includes(target) ||
          target.includes((s.category || '').toLowerCase())
      )
    }

    if (searchQuery.trim()) {
      const scored = list
        .map((s) => ({
          service: s,
          score: computeServiceRelevance(s, searchQuery),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)

      return scored.map((item) => item.service)
    }

    return list
  }, [activeServices, selectedCategory, searchQuery])

  const heroImage = cfg.heroPhoto || fallbackImg(cfg.accent, cfg.name)
  const primaryWaDigits = cleanWaDigits(cfg.whatsappPhone || cfg.phone)
  const directWaHref = primaryWaDigits
    ? `https://wa.me/${primaryWaDigits}?text=${encodeURIComponent(showcase.waPrefill)}`
    : `tel:${cfg.phone}`

  async function handleInstallClick() {
    if (pwaInstallPrompt) {
      pwaInstallPrompt.prompt()
      await pwaInstallPrompt.userChoice
      setPwaInstallPrompt(null)
    } else {
      setShowInstallHelp(true)
    }
  }

  return (
    <div className="min-h-dvh pb-24 md:pb-12">
      {/* ВЕРХНЯЯ НАВИГАЦИЯ САЙТА КЛИЕНТА */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[var(--glass)] border-b border-[var(--line)]">
        <div className="max-w-6xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2.5">
          <div
            className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1 mr-1"
            onClick={() => setActiveTab('home')}
          >
            {cfg.logo ? (
              <div className="h-9 px-2 py-1 rounded-xl flex items-center bg-zinc-950/80 border border-white/10 shrink-0">
                <img src={cfg.logo} alt={cfg.name} className="h-6 w-auto object-contain" />
              </div>
            ) : (
              <div
                className="w-9 h-9 rounded-xl grid place-items-center font-black text-white shadow-sm shrink-0"
                style={{ backgroundColor: cfg.accent }}
              >
                <NicheIcon group={preset.group} className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="display text-xs sm:text-base font-extrabold truncate">
                  {cfg.name}
                </h1>
                <span
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: `${cfg.accent}18`,
                    color: cfg.accent,
                  }}
                >
                  ★ {cfg.rating.toFixed(1)}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] muted truncate">
                {cfg.category || cfg.subtitle} · {cfg.city}, {cfg.address}
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1 shrink-0">
            {(
              [
                ['home', 'Главная'],
                ['services', showcase.showPrices ? 'Услуги и цены' : 'Направления'],
                ['reviews', `Отзывы (${cfg.reviewsCount})`],
                ['info', 'Контакты'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === key ? 'pill-active' : 'muted hover:opacity-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleTheme}
              className="btn-glass !p-2"
              title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>

            <a
              href={directWaHref}
              target="_blank"
              rel="noreferrer"
              className="btn-accent !py-2 !px-3 text-xs flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-5 space-y-8">
        {activeTab === 'home' && (
          <>
            {/* ПЕРВЫЙ ЭКРАН: Современный брендированный Hero с фирменным цветом заведения и его фото */}
            <section className="card-surface overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Текстовая часть */}
                <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold"
                        style={{
                          backgroundColor: `${cfg.accent}18`,
                          color: cfg.accent,
                        }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{showcase.badge}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--bg3)]">
                        <Clock className="w-3.5 h-3.5" style={{ color: cfg.accent }} />
                        <span>{cfg.workingHoursText}</span>
                      </span>
                    </div>

                    <h2 className="display text-xl sm:text-3xl lg:text-4xl font-extrabold leading-tight break-words">
                      {cfg.nameFull || cfg.name}
                    </h2>

                    <p className="text-xs sm:text-base muted leading-relaxed max-w-xl break-words">
                      {cfg.city}, {cfg.address}. {showcase.sectionSub}.
                    </p>

                    {/* Главные кнопки конверсии */}
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 pt-2">
                      <a
                        href={directWaHref}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-accent !py-3 !px-5 text-xs sm:text-sm shadow-md justify-center flex items-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{showcase.heroCtaWa}</span>
                      </a>

                      <a
                        href={`tel:${cfg.phone}`}
                        className="btn-glass !py-3 !px-4 text-xs sm:text-sm font-bold justify-center flex items-center gap-2"
                      >
                        <Phone className="w-4 h-4" style={{ color: cfg.accent }} />
                        <span>{cfg.phone}</span>
                      </a>

                      <button
                        onClick={() => setBookingModalSvc('')}
                        className="btn-glass !py-3 !px-4 text-xs font-bold justify-center flex items-center gap-2"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>{showcase.heroCtaForm}</span>
                      </button>
                    </div>
                  </div>

                  {/* Доверительные плашки внизу Hero */}
                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[var(--line)]">
                    <div>
                      <div className="text-[11px] muted font-semibold">Рейтинг в 2ГИС</div>
                      <div className="display text-base sm:text-lg font-extrabold mt-0.5 flex items-center gap-1">
                        <span>{cfg.rating.toFixed(1)}</span>
                        <span className="text-amber-500">★</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] muted font-semibold">Отзывов клиентов</div>
                      <div className="display text-base sm:text-lg font-extrabold mt-0.5">
                        {cfg.reviewsCount}+
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] muted font-semibold">График работы</div>
                      <div className="text-xs sm:text-sm font-extrabold mt-1 truncate">
                        {cfg.hours.open}–{cfg.hours.close}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Фотография сервиса из 2ГИС */}
                <div className="lg:col-span-5 relative min-h-[260px] sm:min-h-[340px] bg-[var(--bg3)]">
                  <img
                    src={heroImage}
                    alt={cfg.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = fallbackImg(cfg.accent, cfg.name)
                    }}
                  />
                  <div
                    className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl backdrop-blur-md bg-black/65 text-white flex items-center justify-between gap-2"
                  >
                    <div className="text-xs">
                      <div className="font-bold">{cfg.name}</div>
                      <div className="text-white/75 text-[11px]">
                        {cfg.city} · {cfg.address}
                      </div>
                    </div>
                    {cfg.instagram && (
                      <a
                        href={cfg.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        <Instagram className="w-3.5 h-3.5" />
                        <span>Instagram</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ПРЕИМУЩЕСТВА ПОД РУБРИКУ */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {showcase.highlights.map((hl, idx) => (
                <div key={idx} className="card-surface p-5 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg grid place-items-center font-extrabold text-xs text-white shrink-0"
                      style={{ backgroundColor: cfg.accent }}
                    >
                      0{idx + 1}
                    </div>
                    <h3 className="font-extrabold text-sm sm:text-base">{hl.title}</h3>
                  </div>
                  <p className="text-xs sm:text-sm muted leading-relaxed">{hl.desc}</p>
                </div>
              ))}
            </section>

            {/* ФОТОГАЛЕРЕЯ (если больше 1 фото) */}
            {cfg.photos && cfg.photos.length > 1 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="display text-lg font-extrabold">
                      Фотографии «{cfg.name}»
                    </h3>
                    <p className="text-xs muted">Реальные фотографии сервиса, оборудования и боксов</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {cfg.photos.slice(0, 4).map((pUrl, i) => {
                    const captions = cfg.slug === 'marsagi' ? [
                      'Фасад и боксы (22-й мкр)',
                      'Приёмная и магазин масел',
                      'Слесарный цех и подъемники',
                      'Детейлинг и полировка'
                    ] : []
                    return (
                      <div
                        key={i}
                        className="group flex flex-col rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--bg3)]"
                      >
                        <div className="aspect-[16/11] overflow-hidden bg-black/40">
                          <img
                            src={pUrl}
                            alt={`${cfg.name} фото ${i + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            loading="lazy"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </div>
                        {captions[i] && (
                          <div className="p-2 text-[11px] font-semibold text-center truncate border-t border-[var(--line)] bg-[var(--card)]">
                            {captions[i]}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* 1. ЗАГОЛОВКИ И НАПРАВЛЕНИЯ УСЛУГ (ПЕРЕХОД В ПАНЕЛЬ УСЛУГ) */}
            <section className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.accent }}>
                    Прейскурант цен 2026
                  </div>
                  <h3 className="display text-xl sm:text-2xl font-extrabold mt-0.5">
                    Категории услуг автосервиса
                  </h3>
                  <p className="text-xs muted mt-1">
                    Нажмите на интересующее направление для перехода к подробному прейскуранту
                  </p>
                </div>
                <div className="text-xs font-bold px-3 py-1 rounded-full bg-[var(--bg3)] border border-[var(--line)]">
                  Всего услуг в базе: {activeServices.length}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {categoryHighlights.map((cat) => {
                  const Icon = cat.icon
                  const isSelected = selectedCategory.toLowerCase().includes(cat.title.toLowerCase())
                  return (
                    <div
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(cat.title)
                        setActiveTab('services')
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className={`card-surface p-4 sm:p-5 flex flex-col justify-between cursor-pointer transition hover:border-[var(--accent)] hover:shadow-md ${
                        isSelected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : ''
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div
                            className="w-10 h-10 rounded-xl grid place-items-center shadow-sm"
                            style={{ backgroundColor: `${cfg.accent}15`, color: cfg.accent }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg3)] text-zinc-400">
                            {cat.tag}
                          </span>
                        </div>
                        <div>
                          <div className="font-extrabold text-base">{cat.title}</div>
                          <p className="text-xs muted mt-1 leading-relaxed line-clamp-2">
                            {cat.sub}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 flex items-center justify-between text-xs font-bold" style={{ color: cfg.accent }}>
                        <span>Смотреть услуги</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-4 rounded-2xl bg-[var(--bg3)] border border-[var(--line)] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-0.5 text-center sm:text-left">
                  <div className="font-extrabold text-sm sm:text-base">
                    Ознакомиться со всеми услугами и ценами
                  </div>
                  <p className="text-xs muted">
                    Полный прейскурант на {activeServices.length} позиций с фильтром по легковым авто и внедорожникам
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('Все')
                    setActiveTab('services')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="btn-accent w-full sm:w-auto !py-2.5 !px-5 text-xs font-bold flex items-center justify-center gap-2 shrink-0 shadow-md"
                >
                  <span>Открыть полный прейскурант ({activeServices.length} услуг)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            {/* ОСОБЕННОСТИ И ТЕГИ ИЗ 2ГИС */}
            {cfg.rubrics && cfg.rubrics.length > 0 && (
              <section className="card-surface p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.accent }}>
                    Профиль организации
                  </div>
                  <h3 className="display text-base sm:text-lg font-extrabold">
                    Все рубрики и специализация «{cfg.name}»
                  </h3>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cfg.rubrics.map((r, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-[var(--bg3)] border border-[var(--line)]"
                      >
                        {r}
                      </span>
                    ))}
                    {cfg.attributes?.slice(0, 6).map((a, i) => (
                      <span
                        key={`attr-${i}`}
                        className="px-3 py-1 rounded-full text-xs muted bg-[var(--bg3)]"
                      >
                        ✓ {a}
                      </span>
                    ))}
                  </div>
                </div>

                <a
                  href={directWaHref}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-accent !py-3 !px-5 text-xs shrink-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Связаться в WhatsApp</span>
                </a>
              </section>
            )}

            {/* РЕАЛЬНЫЕ ПОЛОЖИТЕЛЬНЫЕ ОТЗЫВЫ 2ГИС */}
            {cfg.reviews && cfg.reviews.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="display text-xl font-extrabold">
                      Отзывы {preset.clientsLabel} в 2ГИС
                    </h3>
                    <p className="text-xs muted">
                      Подтверждённый рейтинг {cfg.rating.toFixed(1)} ★ ({cfg.reviewsCount} оценок в {cfg.city})
                    </p>
                  </div>
                  <a
                    href={cfg.twoGisUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-glass !py-2 !px-3.5 text-xs"
                  >
                    <span>Профиль в 2ГИС</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {cfg.reviews.slice(0, 6).map((rev, i) => (
                    <div key={i} className="card-surface p-5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-full grid place-items-center font-extrabold text-xs text-white"
                            style={{ backgroundColor: cfg.accent }}
                          >
                            {(rev.author || 'К')[0]}
                          </div>
                          <div>
                            <div className="font-bold text-xs sm:text-sm">{rev.author}</div>
                            <div className="text-[11px] muted">
                              {fmtReviewDate(rev.date)} · 2ГИС
                            </div>
                          </div>
                        </div>
                        <div className="text-amber-500 text-xs font-bold">
                          {'★'.repeat(rev.rating || 5)}
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm leading-relaxed opacity-90">{rev.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === 'services' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('home')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="btn-glass !py-1.5 !px-3 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>На главную</span>
              </button>
            </div>

            <div className="card-surface p-4 sm:p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.accent }}>
                    Прейскурант услуг 2026
                  </div>
                  <h2 className="display text-xl sm:text-2xl font-extrabold mt-0.5 break-words">
                    {selectedCategory === 'Все' ? 'Полный прейскурант услуг' : `Услуги: ${selectedCategory}`}
                  </h2>
                  <p className="text-xs muted mt-1">
                    Официальный прайс-лист ИП «MarSagi» (цены с учетом НДС 16%) · Найдено услуг: {filteredServices.length} из {activeServices.length}
                  </p>
                </div>

                {/* Тумблер типа кузова (Легковые / Внедорожники) */}
                <div className="inline-flex p-1 rounded-xl bg-[var(--bg3)] border border-[var(--line)] shrink-0 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() => setVehicleType('sedan')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      vehicleType === 'sedan'
                        ? 'bg-[var(--card)] text-white shadow-sm'
                        : 'muted hover:opacity-100'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>Легковые авто</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicleType('suv')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      vehicleType === 'suv'
                        ? 'bg-[var(--card)] text-white shadow-sm'
                        : 'muted hover:opacity-100'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Внедорожники / Бусы</span>
                  </button>
                </div>
              </div>

              {/* Поисковая строка */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по услугам (например: проточка, колодки, вибростенд, рейка, масло, печка)..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs sm:text-sm font-medium focus:outline-none focus:border-[var(--accent)] transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Пилюли категорий */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`pill whitespace-nowrap text-xs ${selectedCategory === cat ? 'pill-active' : ''}`}
                  >
                    {cat} {cat !== 'Все' && categoryCounts[cat] ? `(${categoryCounts[cat]})` : ''}
                  </button>
                ))}
              </div>
            </div>

            {filteredServices.length === 0 ? (
              <div className="card-surface p-12 text-center space-y-3">
                <p className="text-sm font-semibold muted">По вашему запросу ничего не найдено</p>
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCategory('Все')
                  }}
                  className="btn-glass text-xs font-bold"
                >
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredServices.map((svc) => {
                  const activePrice =
                    vehicleType === 'suv' && (svc as any).priceSuv
                      ? (svc as any).priceSuv
                      : svc.price

                  const vehicleLabel =
                    vehicleType === 'suv' && (svc as any).priceSuv
                      ? 'Внедорожник / микроавтобус'
                      : 'Легковой автомобиль'

                  const svcWaUrl = primaryWaDigits
                    ? `https://wa.me/${primaryWaDigits}?text=${encodeURIComponent(
                        `Здравствуйте! Пишу с сайта «${cfg.name}». Интересует услуга: «${svc.name}» (${vehicleLabel}). Какая актуальная цена и когда можно подъехать?`
                      )}`
                    : `tel:${cfg.phone}`

                  return (
                    <div
                      key={svc.id}
                      className="card-surface p-4 sm:p-5 flex flex-col justify-between gap-3 hover:border-zinc-400 transition overflow-hidden break-words min-w-0"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span
                            className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${cfg.accent}15`,
                              color: cfg.accent,
                            }}
                          >
                            {svc.category}
                          </span>
                          {svc.duration > 0 && (
                            <span className="text-[11px] muted flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" />
                              <span>~{svc.duration} мин</span>
                            </span>
                          )}
                        </div>
                        <div className="font-extrabold text-sm sm:text-base leading-snug break-words hyphens-auto min-w-0">
                          {svc.name}
                        </div>
                        {svc.desc && (
                          <div className="text-xs muted leading-relaxed break-words min-w-0">
                            {svc.desc}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] muted uppercase font-bold truncate">
                            {vehicleLabel}
                          </div>
                          <div
                            className="display text-base font-black truncate"
                            style={{ color: cfg.accent }}
                          >
                            от {kzt(activePrice)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                          <button
                            onClick={() => setBookingModalSvc(svc.id)}
                            className="btn-glass flex-1 sm:flex-none !py-2 !px-3 text-xs font-bold text-center"
                          >
                            Записаться
                          </button>
                          <a
                            href={svcWaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-accent flex-1 sm:flex-none !py-2 !px-3 text-xs font-bold text-center flex items-center justify-center gap-1.5"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="space-y-4">
            <div className="card-surface p-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs uppercase font-bold muted">
                  Народный рейтинг 2ГИС · {cfg.city}
                </div>
                <div className="display text-3xl font-extrabold mt-1">
                  {cfg.rating.toFixed(1)} <span className="text-amber-500">★</span>
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
                <span>Открыть в 2ГИС</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {cfg.reviews.map((rev, i) => (
                <div key={i} className="card-surface p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <b className="text-sm">{rev.author}</b>
                    <span className="text-amber-500 text-xs font-bold">
                      {'★'.repeat(rev.rating || 5)}
                    </span>
                  </div>
                  <p className="text-sm opacity-90 leading-relaxed">{rev.text}</p>
                  {rev.date && <div className="text-[11px] muted">{fmtReviewDate(rev.date)}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'info' && (
          <section className="space-y-4">
            <h2 className="display text-2xl font-extrabold">Контакты и адрес</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card-surface p-6 space-y-4 text-sm">
                <div>
                  <div className="text-xs muted">Организация</div>
                  <div className="font-extrabold text-base">{cfg.nameFull || cfg.name}</div>
                </div>
                <div>
                  <div className="text-xs muted">Адрес ({cfg.city})</div>
                  <div className="font-bold">{cfg.address}</div>
                </div>
                <div>
                  <div className="text-xs muted">Режим работы</div>
                  <div className="font-bold">{cfg.workingHoursText}</div>
                </div>
                <div className="pt-2 space-y-2">
                  <a
                    href={directWaHref}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-accent w-full text-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Написать в WhatsApp ({cfg.whatsappPhone || cfg.phone})</span>
                  </a>
                  {cfg.allPhones && cfg.allPhones.length > 1 ? (
                    cfg.allPhones.map((ph, idx) => (
                      <a key={idx} href={`tel:${ph}`} className="btn-glass w-full text-sm flex items-center justify-center gap-2">
                        <Phone className="w-4 h-4" />
                        <span>Позвонить: {ph}</span>
                      </a>
                    ))
                  ) : (
                    <a href={`tel:${cfg.phone}`} className="btn-glass w-full text-sm">
                      <Phone className="w-4 h-4" />
                      <span>Позвонить: {cfg.phone}</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="card-surface p-6 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <ShieldCheck className="w-4 h-4" style={{ color: cfg.accent }} />
                    <span>Гарантия и официальный сервис</span>
                  </div>
                  <p className="text-xs muted leading-relaxed">
                    Все работы в автосервисе «{cfg.name}» выполняются на профессиональном дилерском оборудовании опытными мастерами строго по технологическим регламентам.
                  </p>
                  <div className="space-y-2 pt-1 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Гарантия на все виды слесарных и сервисных работ</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Официальные отчетные документы и чеки для юр. лиц</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Свой магазин масел, фильтров и оригинальных автозапчастей</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="pt-6 pb-8 space-y-3">
          <div className="card-surface p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs muted text-center sm:text-left">
            <div>
              <b>{cfg.name}</b> · {cfg.city}, {cfg.address} · Официальная платформа онлайн-записи
            </div>
            <div className="text-[11px] font-medium">
              Ежедневно с 09:00 до 21:00
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-xs leading-relaxed text-emerald-400 text-center max-w-2xl mx-auto flex items-center justify-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Официальный сайт и онлайн-запись автосервиса «{cfg.name}» · Все права защищены · ИП «MarSagi» (Сагимбеков М.С.)</span>
          </div>
        </footer>
      </main>

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

      {/* Мобильная нижняя панель */}
      <nav
        className="md:hidden fixed bottom-3 inset-x-3 z-40 max-w-md mx-auto glass p-1.5 grid grid-cols-5 items-center justify-items-center shadow-2xl rounded-2xl border border-white/10"
        aria-label="Навигация"
      >
        <button
          onClick={() => {
            setActiveTab('home')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className={`w-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-0.5 rounded-xl transition min-w-0 ${
            activeTab === 'home' ? '' : 'muted'
          }`}
          style={activeTab === 'home' ? { color: cfg.accent } : undefined}
        >
          <Car className="w-4 h-4 shrink-0" />
          <span className="truncate">Главная</span>
        </button>

        <a
          href={directWaHref}
          target="_blank"
          rel="noreferrer"
          className="w-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-0.5 rounded-xl transition min-w-0 text-emerald-400 hover:text-emerald-300"
          title="Написать в WhatsApp"
        >
          <MessageCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="truncate">WhatsApp</span>
        </a>

        {/* Центральная главная кнопка — УСЛУГИ */}
        <button
          onClick={() => {
            setActiveTab('services')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="-mt-4 w-12 h-12 rounded-2xl shadow-xl flex flex-col items-center justify-center shrink-0 border border-white/20 active:scale-95 transition"
          style={{ backgroundColor: cfg.accent }}
          title="Каталог услуг"
        >
          <Wrench className="w-5 h-5 text-white stroke-[2.3]" />
          <span className="text-[9px] font-black uppercase tracking-tight text-white mt-0.5">
            Услуги
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('reviews')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className={`w-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-0.5 rounded-xl transition min-w-0 ${
            activeTab === 'reviews' ? '' : 'muted'
          }`}
          style={activeTab === 'reviews' ? { color: cfg.accent } : undefined}
        >
          <Star className="w-4 h-4 shrink-0" />
          <span className="truncate">Отзывы</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('info')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className={`w-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold py-1 px-0.5 rounded-xl transition min-w-0 ${
            activeTab === 'info' ? '' : 'muted'
          }`}
          style={activeTab === 'info' ? { color: cfg.accent } : undefined}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">Контакты</span>
        </button>
      </nav>
    </div>
  )
}
