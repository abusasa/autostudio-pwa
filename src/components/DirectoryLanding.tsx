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
  const [pitchLang, setPitchLang] = useState<'kk' | 'ru'>('kk')
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

  const buildPitchText = (s: StoreConfig) => {
    const baseUrl = window.location.origin
    if (pitchLang === 'kk') {
      return (
        `Ассалаумағалейкум, «${s.name}» автосервисінің басшылығы!\n\n` +
        `2ГИС-тен сіздердің сервисті көрдім (${s.rating} ★, ${s.reviewsCount} пікір, ${s.address}). Клиенттер телефон соқпай-ақ онлайн жазыла алатын жеке мобильді қосымша-сайттарыңыз жоқ екенін байқадым.\n\n` +
        `Мен сіздердің автосервиске арнап дайын жұмыс істейтін мобильді қосымша (PWA) мен тапсырыстарды басқаратын CRM-кабинет жасап қойдым:\n` +
        `👉 Клиенттерге арналған қосымша: ${baseUrl}/${s.slug}\n` +
        `👉 Басшылыққа арналған CRM-кабинет: ${baseUrl}/${s.slug}/admin\n\n` +
        `Телефонмен ашып көріңізші — ішінде сіздердің мекенжай, жұмыс уақыты және 2ГИС-тегі шынайы пікірлер дайын тұр. Ұнаса, бүгін-ақ сіздерге толық қосып бере аламын!`
      )
    }
    return (
      `Ассалаумағалейкум! Здравствуйте, руководство ${s.name}!\n\n` +
      `Увидел ваш автосервис в 2ГИС (${s.rating} ★, ${s.reviewsCount} отзывов, ${s.address}), но заметил, что у вас ещё нет собственного мобильного сайта-приложения для онлайн-записи клиентов без звонков.\n\n` +
      `Я уже собрал специально под ваш автосервис готовый рабочий прототип (открывается с телефона как приложение + внутри есть CRM-кабинет приёмщика):\n` +
      `👉 Приложение для клиентов: ${baseUrl}/${s.slug}\n` +
      `👉 Кабинет управления заявками (CRM): ${baseUrl}/${s.slug}/admin\n\n` +
      `Посмотрите с телефона — там уже стоят ваши контакты, график и реальные отзывы из 2ГИС. Если понравится, можем запустить его под ваш сервис уже сегодня!`
    )
  }

  const copyPitch = async (s: StoreConfig) => {
    await navigator.clipboard.writeText(buildPitchText(s))
    setCopiedSlug(s.slug)
    setTimeout(() => setCopiedSlug(null), 2500)
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="card-surface p-6 space-y-4 border border-white/15">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-lime-400/15 text-lime-300 border border-lime-400/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Закрытый пульт Абусамата (`/hq-abusasa`) · Клиенты эту страницу не видят</span>
          </div>

          <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setPitchLang('kk')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pitchLang === 'kk' ? 'pill-active' : 'muted'
              }`}
            >
              🇰🇿 Оффер Қазақша
            </button>
            <button
              onClick={() => setPitchLang('ru')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                pitchLang === 'ru' ? 'pill-active' : 'muted'
              }`}
            >
              🇷🇺 Оффер Русский
            </button>
          </div>
        </div>

        <h1 className="display text-2xl sm:text-3xl font-extrabold">
          Управление 25 СТО г. Актау
        </h1>
        <p className="text-sm muted leading-relaxed">
          На главной странице `/` теперь открывается нейтральный шаблон, поэтому ни один клиент не увидит список других СТО. Здесь ты можешь в 1 клик отправлять сообщения в WhatsApp (на казахском или русском) и выключать те сервисы, которые не согласились.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`/${DEFAULT_STORE.slug}`} className="btn-accent text-xs !py-2.5 !px-4">
            Открыть дефолтный шаблон (/default-sto)
          </a>
          <a href={`/${DEFAULT_STORE.slug}/admin`} className="btn-glass text-xs !py-2.5 !px-4">
            Открыть демо-CRM (/default-sto/admin)
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
            ? `https://wa.me/${s.whatsappPhone}?text=${encodeURIComponent(buildPitchText(s))}`
            : ''

          return (
            <div
              key={s.slug}
              className={`card-surface p-5 flex flex-col justify-between gap-4 transition ${
                isDisabled ? 'opacity-45 border-red-500/20' : 'hover:border-white/25'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-8 h-8 rounded-xl grid place-items-center font-extrabold text-xs shrink-0"
                      style={{ background: s.accent, color: '#0b0c10' }}
                    >
                      #{idx + 1}
                    </span>
                    <div>
                      <h2 className="display text-base font-extrabold">{s.name}</h2>
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

                <div className="text-xs muted space-y-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{s.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <a href={`tel:${s.phone}`} className="font-bold text-white hover:underline">
                      {s.phone}
                    </a>
                    <span>·</span>
                    <span>{s.workingHoursText}</span>
                  </div>
                </div>
              </div>

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
                      className="btn-glass !py-2 !px-3 text-xs text-emerald-400 border-emerald-500/30"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp ({pitchLang === 'kk' ? 'ҚАЗ' : 'РУС'})</span>
                    </a>
                  )}
                  <button
                    onClick={() => copyPitch(s)}
                    className="btn-glass !py-2 !px-3 text-xs"
                  >
                    {copiedSlug === s.slug ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Текст ({pitchLang === 'kk' ? 'ҚАЗ' : 'РУС'})</span>
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
