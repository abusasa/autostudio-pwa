import {useEffect,useMemo,useState} from 'react'
import type {Cfg,Booking} from '../lib/types';import {STATUS} from '../lib/types'
import {sb} from '../lib/supabase';import {useTheme} from '../lib/config';import {fmt,rub} from '../lib/slots';import Chat from './Chat'
export default function Admin({cfg}:{cfg:Cfg}){
  const [pw,setPw]=useState(sessionStorage.getItem('pw'+cfg.slug)??''),[rows,setRows]=useState<Booking[]|null>(null),[err,setErr]=useState(''),[range,setRange]=useState<'day'|'week'>('day'),[theme,toggle]=useTheme()
  const [n,setN]=useState({name:'',phone:'',car:'',svc:cfg.services[0].id,at:''})
  const load=async(p=pw)=>{if(!sb)return setErr('Supabase не настроен');const {data,error}=await sb.rpc('admin_list',{s:cfg.slug,p});if(error)return setErr('Неверный пароль');sessionStorage.setItem('pw'+cfg.slug,p);setErr('');setRows(data)}
  const act=async(fn:string,a:object)=>{await sb!.rpc(fn,{s:cfg.slug,p:pw,...a});load()}
  useEffect(()=>{if(!rows)return;const t=setInterval(()=>load(),15000);return()=>clearInterval(t)},[!!rows,pw])
  const day0=(o=0)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+o);return d}
  const inR=(r:Booking,a:Date,b:Date)=>{const t=new Date(r.starts_at);return t>=a&&t<b}
  const view=useMemo(()=>(rows??[]).filter(r=>inR(r,day0(),day0(range==='day'?1:7))),[rows,range])
  const week=(rows??[]).filter(r=>inR(r,day0(-6),day0(1))),done=(rows??[]).filter(r=>r.status==='done')
  const answer=(q:string)=>{
    if(/завтра/.test(q)){const l=(rows??[]).filter(r=>inR(r,day0(1),day0(2)));return l.length?l.map(r=>`${fmt(r.starts_at).split(', ')[1]} ${r.car} — ${r.service_name}`).join('\n'):'На завтра записей нет.'}
    if(/недел|машин/.test(q))return `За последние 7 дней заездов: ${week.length}.`
    if(/денег|выруч|получен/.test(q))return `Выручка по выданным авто: ${rub(done.reduce((s,r)=>s+r.price,0))}.`
    return 'Спросите: «Что у меня завтра?», «Сколько машин было на неделе?», «Сколько денег получено?»'}
  async function add(){const s=cfg.services.find(x=>x.id===n.svc)!;const a=new Date(n.at);if(!n.name||isNaN(+a))return
    await act('admin_add',{n:n.name,ph:n.phone,c:n.car,sv:s.name,pr:s.price,a:a.toISOString(),e:new Date(+a+s.duration*6e4).toISOString()})}
  if(!rows)return <div className="min-h-screen grid place-items-center p-6"><div className="glass p-6 w-full max-w-sm space-y-3"><h1 className="display text-xl">Кабинет · {cfg.name}</h1>
    <input type="password" className="inp" placeholder="Пароль" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}/><button className="btn w-full" onClick={()=>load()}>Войти</button>{err&&<p className="text-red-500 text-sm">{err}</p>}</div></div>
  return <div className="max-w-3xl mx-auto pb-32">
    {cfg.demo&&<div className="demo">Демо-версия сайта. Не является реальной службой записи</div>}
    <div className="p-4 space-y-4">
    <div className="flex justify-between items-center gap-2"><h1 className="display text-2xl flex-1">{cfg.name}</h1><button className="btn-glass !py-2" onClick={toggle}>{theme==='dark'?'☀︎':'☾'}</button>
      <button className="btn-glass !py-2" onClick={()=>{sessionStorage.clear();setRows(null);setPw('')}}>Выйти</button></div>
    <div className="grid grid-cols-3 gap-3 text-center">{[['Заездов за неделю',week.length],['Выдано',done.length],['Выручка',rub(done.reduce((s,r)=>s+r.price,0))]].map(([l,v])=><div key={l as string} className="glass p-3"><div className="display text-lg" style={{color:'rgb(var(--accent))'}}>{v}</div><div className="text-xs muted">{l}</div></div>)}</div>
    <div className="flex gap-2">{(['day','week'] as const).map(r=><button key={r} onClick={()=>setRange(r)} className={range===r?'btn !py-2':'btn-glass !py-2'}>{r==='day'?'Сегодня':'Неделя'}</button>)}</div>
    <div className="space-y-2">{view.length?view.map(r=><div key={r.id} className="glass p-3 text-sm"><div className="flex justify-between"><b>{fmt(r.starts_at)}</b><span>{rub(r.price)}</span></div>
      <div>{r.name} · <a href={'tel:'+r.phone}>{r.phone}</a> · {r.car}</div><div className="muted">{r.service_name}</div>
      <div className="flex gap-2 mt-2 flex-wrap"><select className="inp !py-1.5 !w-auto" value={r.status} onChange={e=>act('admin_set_status',{b:r.id,st:e.target.value})}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      <button className="btn-glass !py-1 !px-3" onClick={()=>{const v=prompt('Новое время (ГГГГ-ММ-ДД ЧЧ:ММ)',r.starts_at.slice(0,16).replace('T',' '));if(!v)return;const a=new Date(v.replace(' ','T'));if(!isNaN(+a))act('admin_move',{b:r.id,a:a.toISOString(),e:new Date(+a+(+new Date(r.ends_at)-+new Date(r.starts_at))).toISOString()})}}>Перенести</button>
      <button className="btn-glass !py-1 !px-3" onClick={()=>confirm('Отменить и удалить запись?')&&act('admin_set_status',{b:r.id,st:'cancelled'})}>Отменить</button></div></div>):<p className="muted">Записей нет.</p>}</div>
    <div className="glass p-4 space-y-2"><h2 className="display text-lg">Добавить запись</h2>
      {(['name','phone','car'] as const).map(k=><input key={k} className="inp" placeholder={{name:'Имя',phone:'Телефон',car:'Авто'}[k]} value={n[k]} onChange={e=>setN({...n,[k]:e.target.value})}/>)}
      <select className="inp" value={n.svc} onChange={e=>setN({...n,svc:e.target.value})}>{cfg.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input type="datetime-local" className="inp" value={n.at} onChange={e=>setN({...n,at:e.target.value})}/><button className="btn w-full" onClick={add}>Добавить</button></div>
    <Chat cfg={cfg} title="Помощник владельца" hints={['Что у меня завтра?','Сколько машин было на неделе?','Сколько денег получено?']} answer={answer}/></div></div>
}
