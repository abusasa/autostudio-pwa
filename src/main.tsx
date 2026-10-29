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

function App() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const slug = parts[0]
  const subRoute = parts[1]

  // Твой закрытый пульт управления всеми 25 СТО
  if (slug === SECRET_HQ_SLUG) {
    return <DirectoryLanding />
  }

  // На главной странице (/) или если сервис отключён — показываем чистый дефолтный шаблон без палева других СТО
  const disabledSlugs: string[] = JSON.parse(
    localStorage.getItem('disabled_sto_slugs') || '[]'
  )

  const foundStore = slug && !disabledSlugs.includes(slug) ? storesMap[slug] : undefined
  const cfg =
    !slug || slug === DEFAULT_STORE.slug
      ? DEFAULT_STORE
      : foundStore && foundStore.enabled !== false
      ? foundStore
      : DEFAULT_STORE

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
