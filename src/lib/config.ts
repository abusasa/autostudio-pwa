import { useEffect, useState } from 'react'
import type { StoreConfig } from './types'
import storesList from '../data/stores.json'

export const allStores = storesList as (StoreConfig & { enabled?: boolean })[]

export const storesMap: Record<string, StoreConfig & { enabled?: boolean }> = Object.fromEntries(
  allStores.map((s) => [s.slug, s])
)

export const DEFAULT_STORE: StoreConfig = allStores[0] || (storesList[0] as StoreConfig)

export const hexToRgb = (hex: string) => {
  const clean = (hex || '#E03626').replace('#', '')
  const num = parseInt(clean, 16) || 0xe03626
  return `${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255}`
}

export const isLightAccent = (hex: string) => {
  const clean = (hex || '#E03626').replace('#', '')
  const num = parseInt(clean, 16) || 0xe03626
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.68
}

export const fallbackImg = (accentHex: string, title = 'MarSagi') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accentHex || '#E03626'}" stop-opacity="0.45"/>
          <stop offset="50%" stop-color="#141821" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#090A0F" stop-opacity="1"/>
        </linearGradient>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" stroke-opacity="0.05" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="900" height="540" fill="url(#g)"/>
      <rect width="900" height="540" fill="url(#grid)"/>
      <circle cx="760" cy="110" r="180" fill="${accentHex || '#E03626'}" fill-opacity="0.15"/>
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
