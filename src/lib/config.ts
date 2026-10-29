import { useEffect, useState } from 'react'
import type { StoreConfig } from './types'
import storesList from '../data/stores.json'

export const allStores = storesList as (StoreConfig & { enabled?: boolean })[]

export const storesMap: Record<string, StoreConfig & { enabled?: boolean }> = Object.fromEntries(
  allStores.map((s) => [s.slug, s])
)

export const DEFAULT_STORE: StoreConfig = {
  slug: 'default-sto',
  name: 'AutoMaster Актау',
  nameFull: 'AutoMaster — Современный автосервис и СТО',
  subtitle: 'Автосервис полного цикла · Актау',
  tagline: 'Запись на диагностику и ремонт в 2 клика со статусом готовности в телефоне',
  city: 'Актау',
  address: 'г. Актау, 25-й микрорайон, строение 15',
  phone: '+7 701 000-00-00',
  allPhones: ['+7 701 000-00-00'],
  whatsappPhone: '77010000000',
  whatsappUrl: 'https://wa.me/77010000000',
  instagram: '',
  rating: 5.0,
  reviewsCount: 150,
  heroPhoto: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=1200&q=85',
  logo: '',
  accent: '#D4FF00',
  demo: true,
  workingHoursText: 'Пн–Сб 09:00–19:00',
  hours: { open: '09:00', close: '19:00' },
  daysOff: [0],
  boxes: 3,
  rubrics: ['Автосервис', 'Компьютерная диагностика', 'Ремонт ходовой части', 'Замена масла'],
  attributes: ['Оплата картой', 'Kaspi QR', 'Зона ожидания', 'Запчасти в наличии'],
  services: allStores[0]?.services ?? [],
  reviews: [
    {
      author: 'Нурлан К.',
      rating: 5,
      date: '2026-10-20',
      text: 'Очень удобно записываться через телефон без звонков. Приехал к своему времени, бокс был свободен!'
    },
    {
      author: 'Ержан М.',
      rating: 5,
      date: '2026-10-18',
      text: 'Отличный сервис, быстро сделали компьютерную диагностику и заменили масло. Рекомендую!'
    }
  ],
  twoGisUrl: 'https://2gis.kz/aktau'
}

export const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`
}

export const isLightAccent = (hex: string) => {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.68
}

export const fallbackImg = (accentHex: string, title = 'Автосервис Актау') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.45"/>
          <stop offset="50%" stop-color="#141821" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#090A0F" stop-opacity="1"/>
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" stroke-opacity="0.05" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="900" height="540" fill="url(#g)"/>
      <rect width="900" height="540" fill="url(#grid)"/>
      <circle cx="760" cy="110" r="180" fill="${accentHex}" fill-opacity="0.15"/>
      <text x="60" y="260" fill="white" fill-opacity="0.22" font-size="44" font-weight="800" font-family="sans-serif">${title.replace(/[<>&"']/g, '')}</text>
    </svg>`
  )}`

export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('sto_theme') as 'dark' | 'light') || 'dark'
  )
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('sto_theme', theme)
  }, [theme])
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')] as const
}
