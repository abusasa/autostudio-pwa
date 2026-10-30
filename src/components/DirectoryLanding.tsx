import React, { useEffect, useMemo, useState } from 'react'
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react'
import { allStores, DEFAULT_STORE } from '../lib/config'
import type { StoreConfig } from '../lib/types'

export default function DirectoryLanding() {
  const [search, setSearch] = useState('')
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const [copiedCallSlug, setCopiedCallSlug] = useState<string | null>(null)
  const [pitchLang, setPitchLang] = useState<'ru' | 'kk'>('ru')
  const [disabledSlugs, setDisabledSlugs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('disabled_sto_slugs') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('disabled_sto_slugs', JSON.stringify(disabledSlugs))
  }, [disabledSlugs])

  const toggleStoreEnabled = (slug: string) => {
    setDisabledSlugs((prev) =>
      prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]
    )
  }

  const stores = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allStores
    return allStores.filter((s) =>
      `${s.name} ${s.address} ${s.phone} ${s.subtitle}`.toLowerCase().includes(q)
    )
  }, [search])

  // 1. ТЕКСТ ДЛЯ ЧТЕНИЯ ГОЛОСОМ ВО ВРЕМЯ ЗВОНКА
  const buildCallScript = (s: StoreConfig) => {
    if (pitchLang === 'kk') {
      return (
        `«Ассалаумағалейкум! Бұл Абдулла ғой, «${s.name}» автосервисі бойынша хабарласып тұрмын. ` +
        `2ГИС-те сіздердің рейтингтеріңіз ${s.rating} ★ (${s.reviewsCount} пікір) екен, бірақ клиенттер телефон соқпай онлайн жазылатын жеке қосымша-сайттарыңыз жоқ екен. ` +
        `Мен дәл қазір сіздердің сервиске арнап дайын онлайн-жазылу қосымшасы мен CRM-кабинет жасап қойдым. ` +
        `Қазір осы WhatsApp нөміріңізге сілтемесін жіберсем, телефонмен ашып көресіз бе?»`
      )
    }
    return (
      `«Ассалаумағалейкум! Здравствуйте, это Абдулла, звоню в автосервис «${s.name}». ` +
      `Увидел вас в 2ГИС — у вас отличный рейтинг (${s.rating} ★, ${s.reviewsCount} отзывов), но нет своей системы онлайн-записи для клиентов. ` +
      `Я уже собрал специально под ваш сервис готовое приложение с онлайн-записью и CRM-кабинетом приёмщика. ` +
      `Давайте я прямо сейчас скину вам ссылку на этот WhatsApp, посмотрите с телефона?»`
    )
  }

  // 2. КОРОТКИЙ ТЕКСТ ДЛЯ ОТПРАВКИ В WHATSAPP ПОСЛЕ ЗВОНКА
  const buildWhatsAppMessage = (s: StoreConfig) => {
    const baseUrl = window.location.origin
    if (pitchLang === 'kk') {
      return (
        `Ассалаумағалейкум! Бұл Абдулла, жаңа ғана онлайн-жазылу бойынша хабарласқан едім.\n` +
        `«${s.name}» автосервисіне арналған дайын жүйе:\n\n` +
        `👉 Клиенттерге арналған қосымша: ${baseUrl}/${s.slug}\n` +
        `👉 Қабылдаушы кабинеті (CRM): ${baseUrl}/${s.slug}/admin\n\n` +
        `Телефонмен ашып көріңіз — телефоннан бәрі өте жылдам істейді. Көріп болған соң хабарын беріңіз, бірден іске қосамыз!`
      )
    }
    return (
      `Здравствуйте! Это Абдулла, только что звонил вам по поводу онлайн-записи.\n` +
      `Готовая система для автосервиса «${s.name}»:\n\n` +
      `👉 Клиентская часть: ${baseUrl}/${s.slug}\n` +
      `👉 Кабинет приёмщика (CRM): ${baseUrl}/${s.slug}/admin\n\n` +
      `Откройте с телефона — с телефона всё летает. Как посмотрите, дайте знать, сразу запустим!`
    )
  }

  const copyWhatsApp = async (s: StoreConfig) => {
    await navigator.clipboard.writeText(buildWhatsAppMessage(s))
    setCopiedSlug(s.slug)
    setTimeout(() => setCopiedSlug(null), 2500)
  }

  const copyCall = async (s: StoreConfig) => {
    await navigator.clipboard.writeText(buildCallScript(s))
    setCopiedCallSlug(s.slug)
    setTimeout(() => setCopiedCallSlug(null), 2500)
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="card-surface p-6 space-y-4 border border-white/15">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-lime-400/15 text-lime-300 border border-lime-400/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Закрытый пульт Абдуллы (`/hq-abusasa`) · Клиенты эту страницу не видят</span>
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setPitchLang('ru')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pitchLang === 'ru' ? 'pill-active' : 'muted'
              }`}
            >
              🇷🇺 Русский
            </button>
            <button
              onClick={() => setPitchLang('kk')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pitchLang === 'kk' ? 'pill-active' : 'muted'
              }`}
            >
              🇰🇿 Қазақша
            </button>
          </div>
        </div>

        <h1 className="display text-2xl sm:text-3xl font-extrabold">
          Пульт обзвона и WhatsApp по 25 СТО г. Актау
        </h1>
        <p className="text-sm muted leading-relaxed">
          В каждой карточке теперь отдельно вынесен <b>скрипт для чтения вслух при звонке</b>, а кнопка <b>WhatsApp</b> отправляет короткое сообщение после звонка: <i>«Здравствуйте! Это Абдулла, только что звонил вам по поводу онлайн-записи...»</i>
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="/marsagi" className="btn-accent text-xs !py-2.5 !px-4">
            ⭐ Открыть наш первый заказ: MarSagi (/marsagi — 3 номера!)
          </a>
          <a href="/marsagi/admin" className="btn-glass text-xs !py-2.5 !px-4">
            CRM MarSagi (/marsagi/admin)
          </a>
        </div>
      </header>

      <div className="relative">
        <Search className="w-4 h-4 muted absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          className="inp !pl-11"
          placeholder="Поиск среди 25 СТО Актау по названию, микрорайону или номеру телефона..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stores.map((s, idx) => {
          const isDisabled = disabledSlugs.includes(s.slug)
          const waPitchUrl = s.whatsappPhone
            ? `https://wa.me/${s.whatsappPhone}?text=${encodeURIComponent(buildWhatsAppMessage(s))}`
            : ''

          return (
            <div
              key={s.slug}
              className={`card-surface p-5 flex flex-col justify-between gap-4 transition ${
                s.slug === 'marsagi'
                  ? 'border-2 border-emerald-400/60 bg-emerald-500/5'
                  : isDisabled
                  ? 'opacity-45 border-red-500/20'
                  : 'hover:border-white/25'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-8 h-8 rounded-xl grid place-items-center font-extrabold text-xs shrink-0"
                      style={{ background: s.accent, color: '#0b0c10' }}
                    >
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="display text-base font-extrabold">{s.name}</h2>
                        {s.slug === 'marsagi' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-black">
                            КЛИЕНТ (3 НОМЕРА)
                          </span>
                        )}
                      </div>
                      <div className="text-xs muted">{s.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 shrink-0">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {s.rating.toFixed(1)} ({s.reviewsCount})
                    </span>
                    <button
                      onClick={() => toggleStoreEnabled(s.slug)}
                      className="btn-glass !p-1.5 !rounded-xl text-xs"
                      title={isDisabled ? 'Включить сайт СТО' : 'Отключить сайт СТО'}
                    >
                      {isDisabled ? (
                        <EyeOff className="w-4 h-4 text-red-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="text-xs muted space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{s.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    {s.allPhones.map((ph) => (
                      <a
                        key={ph}
                        href={`tel:${ph}`}
                        className="font-bold text-white hover:underline mr-2"
                      >
                        {ph}
                      </a>
                    ))}
                  </div>
                </div>

                {/* Блок 1: Скрипт для чтения голосом при звонке */}
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                      <PhoneCall className="w-3 h-3" /> 1. Читать при звонке:
                    </span>
                    <button
                      onClick={() => copyCall(s)}
                      className="text-[11px] underline muted hover:text-white"
                    >
                      {copiedCallSlug === s.slug ? 'Скопировано!' : 'Копировать речь'}
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90 select-all">
                    {buildCallScript(s)}
                  </p>
                </div>
              </div>

              {/* Блок 2: Кнопки отправки короткого сообщения в WhatsApp после звонка */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`/${s.slug}`}
                    className="btn-accent !py-2.5 !px-3 text-xs"
                  >
                    <span>Сайт-PWA</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={`/${s.slug}/admin`}
                    className="btn-glass !py-2.5 !px-3 text-xs"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>CRM Кабинет</span>
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {waPitchUrl && (
                    <a
                      href={waPitchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-glass !py-2.5 !px-3 text-xs text-emerald-400 border-emerald-500/30 font-bold"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>2. Скинуть в WhatsApp</span>
                    </a>
                  )}
                  <button
                    onClick={() => copyWhatsApp(s)}
                    className="btn-glass !py-2.5 !px-3 text-xs"
                  >
                    {copiedSlug === s.slug ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Текст для WhatsApp</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
