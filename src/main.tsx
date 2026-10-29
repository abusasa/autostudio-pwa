import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DEFAULT_STORE, hexToRgb, isLightAccent, storesMap } from './lib/config'
import ClientApp from './components/ClientApp'
import AdminCRM from './components/AdminCRM'
import DirectoryLanding from './components/DirectoryLanding'

document.documentElement.dataset.theme = localStorage.getItem('sto_theme') || 'dark'

function App() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const slug = parts[0]
  const subRoute = parts[1]

  if (!slug) {
    return <DirectoryLanding />
  }

  const cfg = slug === DEFAULT_STORE.slug ? DEFAULT_STORE : storesMap[slug]

  if (!cfg) {
    return <DirectoryLanding />
  }

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
