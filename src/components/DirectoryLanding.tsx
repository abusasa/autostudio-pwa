import React, { useMemo, useState } from 'react'
import {
  Copy,
  Check,
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

  const stores = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allStores
    return allStores.filter((s) =>
      `${s.name} ${s.address} ${s.phone} ${s.subtitle}`.toLowerCase().includes(q)
    )
  }, [search])

  const buildPitchText = (s: StoreConfig) => {
    const baseUrl = window.location.origin
    return (
      `Сәлеметсіз бе! Здравствуйте, руководство ${s.name}!\n\n` +
      `Увидел ваш автосервис в 2ГИС (${s.rating} ★, ${s.reviewsCount} отзывов, ${s.address}), но заметил, что у вас ещё нет собственного мобильного сайта-приложения для онлайн-записи клиентов без звонков.\n\n` +
      `Я уже собрал специально под ваш автосервис готовый рабочий прототип (открывается с телефона как приложение + внутри есть CRM-кабинет приёмщика):\n` +
      `👉 Приложение для клиентов: ${baseUrl}/${s.slug}\n` +
      `👉 Кабинет управления заявками (CRM): ${baseUrl}/${s.slug}/admin\n\n` +
      `Посмотрите с телефона — там уже стоят ваши контакты, график и реальные отзывы из 2ГИС. Если понравится, можем запустить его под ваш сервис за 1 день!`
    )
  }

  const copyPitch = async (s: StoreConfig) => {
    await navigator.clipboard.writeText(buildPitchText(s))
    setCopiedSlug(s.slug)
    setTimeout(() => setCopiedSlug(null), 2500)
  }

  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="card-surface p-6 space-y-3 border border-white/15">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-lime-400/15 text-lime-300 border border-lime-400/30">
          <Sparkles className="w-3.5 h-3.5" />
          <span>База из 25 реальных автосервисов г. Актау (2ГИС без сайтов)</span>
        </div>
        <h1 className="display text-2xl sm:text-3xl font-extrabold">
          Платформа клиентских PWA + CRM для СТО Актау
        </h1>
        <p className="text-sm muted leading-relaxed">
          Для каждого из 25 автосервисов Актау ниже уже сгенерировано персональное мобильное PWA-приложение (с реальным адресом, номером, фото, рейтингом и отзывами из 2ГИС) и индивидуальный CRM-кабинет управления записями на базе Supabase.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href={`/${DEFAULT_STORE.slug}`} className="btn-accent text-xs !py-2.5 !px-4">
            Открыть дефолтный мастер-шаблон (/default-sto)
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
          const waPitchUrl = s.whatsappPhone
            ? `https://wa.me/${s.whatsappPhone}?text=${encodeURIComponent(buildPitchText(s))}`
            : ''

          return (
            <div key={s.slug} className="card-surface p-5 flex flex-col justify-between gap-4 hover:border-white/25 transition">
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
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 shrink-0">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {s.rating.toFixed(1)} ({s.reviewsCount})
                  </span>
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
                      <span>Отправить в WhatsApp</span>
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
                        <span>Текст оффера</span>
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
