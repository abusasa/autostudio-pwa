import {useEffect,useMemo,useState} from 'react'
import type {Cfg,Busy} from '../lib/types'
import {sb} from '../lib/supabase';import {fallbackImg,useTheme} from '../lib/config'
import {slotsFor,fmt,rub,isOff} from '../lib/slots';import Chat from './Chat'
const KEY='my-booking'
const firstWorkday=(c:Cfg)=>{const d=new Date();while(isOff(c,d))d.setDate(d.getDate()+1);return d}

function Book({cfg,busy,preset,onClose,onDone}:{cfg:Cfg;busy:Busy[];preset?:string;onClose:()=>void;onDone:(s:string)=>void}){
  const [svc,setSvc]=useState(cfg.services.find(s=>s.id===preset)??cfg.services[0]),[day,setDay]=useState(()=>firstWorkday(cfg))
  const [slot,setSlot]=useState<Date|null>(null),[f,setF]=useState({name:'',phone:'',car:''}),[msg,setMsg]=useState(''),[ok,setOk]=useState('')
  const slots=useMemo(()=>slotsFor(cfg,busy,day,svc.duration),[busy,day,svc])
  const days=useMemo(()=>[...Array(14)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d}).filter(d=>!isOff(cfg,d)),[])
  async function submit(){
    if(!slot||!f.name||!f.phone||!f.car)return setMsg('Заполните все поля и выберите время')
    if(!sb)return setMsg('Supabase не настроен (.env)')
    const {error}=await sb.from('bookings').insert({store_slug:cfg.slug,...f,service_name:svc.name,price:svc.price,starts_at:slot.toISOString(),ends_at:new Date(slot.getTime()+svc.duration*6e4).toISOString()})
    if(error)return setMsg('Не удалось записаться: '+error.message)
    const s=`${svc.name} — ${fmt(slot)}`;setOk(s);onDone(s)
  }
  return <div className="sheet" onClick={onClose}><div className="glass space-y-4" onClick={e=>e.stopPropagation()} role="dialog" aria-label="Запись">
    <div className="flex justify-between items-center"><h2 className="display text-2xl">{ok?'Вы записаны':'Запись на ремонт'}</h2><button className="btn-glass !py-2 !px-3" onClick={onClose} aria-label="Закрыть">✕</button></div>
    {ok?<p className="muted">{ok}. Это демо — реальная запись не обрабатывается.</p>:<>
      <select className="inp" value={svc.id} onChange={e=>{setSvc(cfg.services.find(s=>s.id===e.target.value)!);setSlot(null)}}>{cfg.services.map(s=><option key={s.id} value={s.id}>{s.name} — {rub(s.price)}</option>)}</select>
      <div className="flex gap-2 overflow-x-auto pb-1">{days.map(d=><button key={+d} className="chip" aria-pressed={d.toDateString()===day.toDateString()} onClick={()=>{setDay(d);setSlot(null)}}>{d.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric'})}</button>)}</div>
      <div className="grid grid-cols-4 gap-2">{slots.map(({t,free})=><button key={+t} className="chip !shrink" disabled={!free} aria-pressed={!!slot&&+slot===+t} onClick={()=>setSlot(t)}>{t.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</button>)}</div>
      {!slots.length&&<p className="muted text-sm">В этот день сервис не работает.</p>}
      <input className="inp" placeholder="Имя" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
      <input className="inp" placeholder="Телефон" inputMode="tel" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/>
      <input className="inp" placeholder="Авто: марка, модель, год" value={f.car} onChange={e=>setF({...f,car:e.target.value})}/>
      <button className="btn w-full" onClick={submit}>Записаться</button>{msg&&<p className="text-sm accent-msg" style={{color:'rgb(var(--accent))'}}>{msg}</p>}</>}
  </div></div>
}

export default function Client({cfg}:{cfg:Cfg}){
  const [tab,setTab]=useState<'home'|'services'>('home'),[book,setBook]=useState<string|null>(null),[busy,setBusy]=useState<Busy[]>([])
  const [mine,setMine]=useState(()=>localStorage.getItem(KEY+cfg.slug)),[theme,toggle]=useTheme()
  const load=()=>{sb?.from('busy_slots').select('starts_at,ends_at').eq('store_slug',cfg.slug).gte('ends_at',new Date().toISOString()).then(r=>setBusy(r.data??[]))}
  useEffect(()=>{load()},[])
  const minPrice=Math.min(...cfg.services.map(s=>s.price))
  const hero=cfg.hero||fallbackImg(cfg.accent,cfg.name)
  return <div className="max-w-2xl mx-auto pb-36">
    {cfg.demo&&<div className="demo">Демо-версия сайта. Не является реальной службой записи</div>}
    <header className="flex items-center gap-3 px-4 py-3">
      {cfg.logo?<img src={cfg.logo} alt="" className="w-9 h-9 rounded-xl"/>:<div className="w-9 h-9 rounded-xl bg-accent grid place-items-center font-bold text-white">{cfg.name[0]}</div>}
      <b className="display flex-1 truncate">{cfg.name}</b>
      <button className="btn-glass !py-2 !px-3 text-sm" onClick={toggle} aria-label="Сменить тему">{theme==='dark'?'☀︎ Светлая':'☾ Тёмная'}</button>
      <a href={'tel:'+cfg.phone} className="btn !py-2 !px-4 text-sm">Позвонить</a></header>

    {tab==='home'?<main className="px-4 space-y-6">
      <section className="relative rounded-[2rem] overflow-hidden min-h-[20rem] flex items-end">
        <img src={hero} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e=>{(e.target as HTMLImageElement).src=fallbackImg(cfg.accent,cfg.name)}}/>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"/>
        <div className="relative p-6 text-white"><h1 className="display text-3xl">{cfg.tagline}</h1>
          <button className="btn mt-5" onClick={()=>setBook('')}>Записаться на ремонт</button></div></section>
      <div className="glass p-4 grid grid-cols-3 gap-2 text-center">
        {[[String(cfg.services.length),'услуг'],['от '+rub(minPrice),'цены'],[cfg.hours.open+'–'+cfg.hours.close,'график']].map(([v,l])=><div key={l}><div className="display text-lg">{v}</div><div className="muted text-xs">{l}</div></div>)}</div>
      {cfg.gallery.length>0&&<section><h2 className="display text-xl mb-3">Акции</h2><div className="glass px-4">
        {cfg.gallery.map((g,i)=><div className="row" key={i}><b>{g.title}</b><span className="muted text-sm text-right">{g.text}</span></div>)}</div></section>}
      <section><h2 className="display text-xl mb-3">Моя запись</h2><div className="glass p-4">{mine??'Пока нет записей на этом устройстве.'}</div>
        <p className="muted text-sm mt-3">{cfg.address}</p></section>
    </main>:<main className="px-4"><h1 className="display text-3xl py-3">Услуги и цены</h1>
      <div className="glass px-4">{cfg.services.map(s=><button key={s.id} className="row" onClick={()=>setBook(s.id)}>
        <span><b>{s.name}</b><br/><span className="muted text-sm">{s.desc?s.desc+' · ':''}~{s.duration} мин</span></span>
        <b className="whitespace-nowrap" style={{color:'rgb(var(--accent))'}}>{rub(s.price)}</b></button>)}</div></main>}

    <Chat cfg={cfg} hints={['Есть ли окно после 18:00?','Сколько стоит диагностика?']}/>
    <nav className="nav glass" aria-label="Основная навигация">
      <button aria-current={tab==='home'?'page':undefined} onClick={()=>setTab('home')}>Главная</button>
      <button className="fab" onClick={()=>setBook('')}>+ Записаться</button>
      <button aria-current={tab==='services'?'page':undefined} onClick={()=>setTab('services')}>Услуги</button></nav>
    {book!==null&&<Book cfg={cfg} busy={busy} preset={book||undefined} onClose={()=>setBook(null)} onDone={s=>{localStorage.setItem(KEY+cfg.slug,s);setMine(s);load()}}/>}
  </div>
}
