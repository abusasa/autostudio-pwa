import React from 'react';import {createRoot} from 'react-dom/client';import './index.css'
import {stores,hexToRgb} from './lib/config';import Client from './components/Client';import Admin from './components/Admin'
function App(){
  const [,slug,sub]=location.pathname.split('/'); const cfg=stores[slug]
  if(!cfg)return <div className="p-8 max-w-md mx-auto"><h1 className="text-2xl mb-4">Выберите студию</h1>{Object.values(stores).map(s=><a key={s.slug} href={'/'+s.slug} className="block glass p-4 mb-3">{s.name}</a>)}</div>
  document.documentElement.style.setProperty('--accent',hexToRgb(cfg.accent));document.title=cfg.name
  return sub==='admin'?<Admin cfg={cfg}/>:<Client cfg={cfg}/>
}
createRoot(document.getElementById('root')!).render(<App/>)
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'))
