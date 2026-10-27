import type { Cfg } from './types'
const mods=import.meta.glob('../services/*/config.json',{eager:true}) as Record<string,{default:Cfg}>
export const stores:Record<string,Cfg>=Object.fromEntries(Object.values(mods).map(m=>[m.default.slug,m.default]))
export const hexToRgb=(h:string)=>{const n=parseInt(h.replace('#',''),16);return `${n>>16} ${(n>>8)&255} ${n&255}`}
export const fallbackImg=(c:string,t='')=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c}' stop-opacity='.5'/><stop offset='1' stop-color='#0A0A0C'/></linearGradient></defs><rect width='800' height='500' fill='url(#g)'/><text x='400' y='265' fill='white' fill-opacity='.35' font-size='38' text-anchor='middle' font-family='sans-serif'>${t}</text></svg>`)}`
