import {useEffect,useMemo,useState} from 'react'
import type {Cfg,Busy} from '../lib/types'
import {sb} from '../lib/supabase';import {fallbackImg} from '../lib/config'
import {slotsFor,nextFree,fmt,rub,isOff} from '../lib/slots';import Chat from './Chat'
const KEY='my-booking'
export default function Client({cfg}:{cfg:Cfg}){
  const [busy,setBusy]=useState<Busy[]>([]),[svc,setSvc]=useState(cfg.services[0]),[day,setDay]=useState(()=>{const d=new Date();while(isOff(cfg,d))d.setDate(d.getDate()+1);return d})
  const [slot,setSlot]=useState<Date|null>(null),[f,setF]=useState({name:'',phone:'',car:''}),[msg,setMsg]=useState(''),[mine,setMine]=useState(()=>localStorage.getItem(KEY+cfg.slug))
  const load=()=>sb?.from('busy_slots').select('starts_at,ends_at').eq('store_slug',cfg.slug).gte('ends_at',new Date().toISOString()).then(r=>setBusy(r.data??[]))
  useEffect(()=>{load()},[])
  const slots=useMemo(()=>slotsFor(cfg,busy,day,svc?.duration??60),[busy,day,svc])
  const days=useMemo(()=>[...Array(14)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d}).filter(d=>!isOff(cfg,d)),[])
  const go=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth'})
  async function submit(){
    if(!slot||!f.name||!f.phone||!f.car)return setMsg('Заполните все поля и выберите время')
    if(!sb)return setMsg('Supabase не настроен (.env)')
    const row={store_slug:cfg.slug,...f,service_name:svc.name,price:svc.price,starts_at:slot.toISOString(),ends_at:new Date(slot.getTime()+svc.duration*6e4).toISOString()}
    const {error}=await sb.from('bookings').insert(row)
    if(error)return setMsg('Не удалось записаться: '+error.message)
    const s=`${svc.name} — ${fmt(slot)}`;localStorage.setItem(KEY+cfg.slug,s);setMine(s);setMsg('Вы записаны: '+s);setSlot(null);load()
  }
  const answer=(q:string)=>{
    if(/ближайш|окно|свобод|когда/.test(q)){const t=nextFree(cfg,busy,svc.duration);return t?`Ближайшее окно: ${fmt(t)} (${svc.name}).`:'В ближайшие 2 недели свободных окон нет — позвоните: '+cfg.phone}
    const s=cfg.services.find(x=>q.split(/\s+/).some(w=>w.length>3&&x.name.toLowerCase().includes(w.slice(0,5))))
    if(/стоит|цен|сколько|прайс/.test(q))return s?`${s.name}: ${rub(s.price)}, около ${s.duration} мин.`:'Услуги: '+cfg.services.map(x=>`${x.name} — ${rub(x.price)}`).join('; ')
    if(/найти|адрес|где|как добраться/.test(q))return `${cfg.address}. Телефон: ${cfg.phone}.`
    if(/график|работа|часы/.test(q))return `Работаем ${cfg.hours.open}–${cfg.hours.close}.`
    return 'Я знаю про услуги, цены, график и свободное время. Спросите, например: «Когда ближайшее окно?»'
  }
  const hero=cfg.hero||fallbackImg(cfg.accent,cfg.name)
  return <div className="max-w-2xl mx-auto pb-32">
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-black/50 backdrop-blur-xl border-b border-white/10">
      {cfg.logo?<img src={cfg.logo} alt="" className="w-9 h-9 rounded-xl"/>:<div className="w-9 h-9 rounded-xl bg-accent grid place-items-center font-bold">{cfg.name[0]}</div>}
      <div className="flex-1 min-w-0"><div className="font-medium truncate">{cfg.name}</div>{cfg.demo&&<div className="text-xs text-white/50">Демо-версия системы</div>}</div>
      <a href={'tel:'+cfg.phone} className="btn !py-2 !px-4 text-sm">Позвонить</a></header>
    <section className="relative m-4 rounded-[2rem] overflow-hidden min-h-[22rem] flex items-end">
      <img src={hero} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e=>{(e.target as HTMLImageElement).src=fallbackImg(cfg.accent,cfg.name)}}/>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"/>
      <div className="relative p-6"><h1 className="text-4xl font-semibold tracking-tight">{cfg.name}</h1><p className="text-white/70 mt-2 mb-5">{cfg.tagline}</p>
        <button className="btn-glass" onClick={()=>go('book')}>Записаться в студию</button></div></section>
    <section id="services" className="px-4 mt-8"><h2 className="text-2xl mb-3">Услуги и цены</h2><div className="glass divide-y divide-white/10">
      {cfg.services.map(s=><div key={s.id} className="flex justify-between p-4"><div>{s.name}<div className="text-sm text-white/50">~{s.duration} мин</div></div><div className="text-accent font-medium">{rub(s.price)}</div></div>)}</div></section>
    <section className="px-4 mt-8"><h2 className="text-2xl mb-3">Наши работы</h2><div className="grid grid-cols-2 gap-3">
      {(cfg.gallery.length?cfg.gallery:[{img:'',title:'Скоро здесь',text:'Фото работ'}]).map((g,i)=><figure key={i} className="glass overflow-hidden">
        <img src={g.img||fallbackImg(cfg.accent,g.title)} alt={g.title} className="aspect-[4/3] object-cover w-full" loading="lazy"/><figcaption className="p-3 text-sm"><b>{g.title}</b><div className="text-white/50">{g.text}</div></figcaption></figure>)}</div></section>
    <section id="book" className="px-4 mt-8"><h2 className="text-2xl mb-3">Запись</h2><div className="glass p-4 space-y-4">
      <select className="inp" value={svc.id} onChange={e=>{setSvc(cfg.services.find(s=>s.id===e.target.value)!);setSlot(null)}}>{cfg.services.map(s=><option key={s.id} value={s.id} className="text-black">{s.name} — {rub(s.price)}</option>)}</select>
      <div className="flex gap-2 overflow-x-auto pb-1">{days.map(d=><button key={+d} onClick={()=>{setDay(d);setSlot(null)}} className={`shrink-0 px-4 py-2 rounded-2xl border ${d.toDateString()===day.toDateString()?'bg-accent border-accent':'border-white/10 bg-white/5'}`}>{d.toLocaleDateString('ru-RU',{weekday:'short',day:'numeric'})}</button>)}</div>
      <div className="grid grid-cols-4 gap-2">{slots.map(({t,free})=><button key={+t} disabled={!free} onClick={()=>setSlot(t)} className={`py-2 rounded-xl text-sm border ${slot&&+slot===+t?'bg-accent border-accent':'border-white/10 bg-white/5'} disabled:opacity-25 disabled:line-through`}>{t.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</button>)}</div>
      {!slots.length&&<p className="text-white/50 text-sm">В этот день студия не работает.</p>}
      <input className="inp" placeholder="Имя" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
      <input className="inp" placeholder="Телефон" inputMode="tel" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/>
      <input className="inp" placeholder="Марка и модель авто" value={f.car} onChange={e=>setF({...f,car:e.target.value})}/>
      <button className="btn w-full" onClick={submit}>Подтвердить запись</button>{msg&&<p className="text-sm text-white/70">{msg}</p>}</div></section>
    <section id="mine" className="px-4 mt-8"><h2 className="text-2xl mb-3">Моя запись</h2><div className="glass p-4">{mine??'Пока нет записей на этом устройстве.'}</div>
      <p className="text-sm text-white/50 mt-4">{cfg.address} · {cfg.hours.open}–{cfg.hours.close}</p></section>
    <Chat title="Ассистент студии" hints={['Когда ближайшее окно?','Сколько стоит полировка?','Как найти студию?']} answer={answer}/>
    <nav className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-2xl m-3 glass flex justify-around py-3 bg-black/50" style={{marginBottom:'max(.75rem,env(safe-area-inset-bottom))',marginInline:'.75rem'}}>
      {[['Главная','top'],['Услуги','services'],['Моя запись','mine']].map(([l,id])=><button key={id} onClick={()=>id==='top'?scrollTo({top:0,behavior:'smooth'}):go(id)}>{l}</button>)}</nav></div>
}
