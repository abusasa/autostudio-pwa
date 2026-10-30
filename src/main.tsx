import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DEFAULT_STORE, hexToRgb, isLightAccent, storesMap } from './lib/config'
import ClientApp from './components/ClientApp'
import AdminCRM from './components/AdminCRM'
import DirectoryLanding from './components/DirectoryLanding'

document.documentElement.dataset.theme = localStorage.getItem('sto_theme') || 'dark'

// Секретный путь только для Абусамата (никто из клиентов его не угадает)
export const SECRET_HQ_SLUG = 'hq-abusasa'

// Дата дедлайна авто-удаления не ответивших СТО (3 дня от 30 октября 2026 -> 2 ноября 2026 23:59:59)
export const AUTO_CLEANUP_DEADLINE = new Date('2026-11-02T23:59:59+05:00').getTime()

// Сервисы с активным подтверждением / оплатой (никогда не удаляются)
export const WHITELISTED_SLUGS = ['marsagi', 'default-sto']

function App() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const slug = parts[0]
  const subRoute = parts[1]

  const isExpired = Date.now() > AUTO_CLEANUP_DEADLINE

  // Если прошло 3 дня — скрываем / удаляем пульт управления, оставив только работу с клиентами
  if (slug === SECRET_HQ_SLUG) {
    if (isExpired) {
      window.location.replace('/marsagi')
      return null
    }
    return <DirectoryLanding />
  }

  // На главной странице (/) или если сервис отключён/просрочен
  const disabledSlugs: string[] = JSON.parse(
    localStorage.getItem('disabled_sto_slugs') || '[]'
  )

  // Если прошло 3 дня, доступны ТОЛЬКО Whitelist-сервисы (MarSagi и дефолтный)
  const isAllowedSlug = !isExpired || WHITELISTED_SLUGS.includes(slug)

  const foundStore = slug && isAllowedSlug && !disabledSlugs.includes(slug) ? storesMap[slug] : undefined
  const cfg =
    !slug || slug === DEFAULT_STORE.slug
      ? (storesMap['marsagi'] || DEFAULT_STORE)
      : foundStore && foundStore.enabled !== false
      ? foundStore
      : (storesMap['marsagi'] || DEFAULT_STORE)

  document.documentElement.style.setProperty('--accent', hexToRgb(cfg.accent))
  document.documentElement.style.setProperty(
    '--accent-fg',
    isLightAccent(cfg.accent) ? '#0b0c10' : '#ffffff'
  )
  document.title = `${cfg.name} — Онлайн-запись · ${cfg.city}`

  if (subRoute === 'admin') {
    return <AdminCRM cfg={cfg} />
  }

  return <ClientApp cfg={cfg} />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
