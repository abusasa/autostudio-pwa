import {useEffect,useRef,useState} from 'react'
import type {Cfg} from '../lib/types'
import {sb} from '../lib/supabase'

type M={id:string;role:'user'|'assistant';content:string}
const sidOf=(slug:string)=>{const k='chat_sid_'+slug;let s=localStorage.getItem(k);if(!s){s=crypto.randomUUID();localStorage.setItem(k,s)}return s}

/** Без `answer` — ИИ «Помощник» (Supabase Realtime + Edge Function). С `answer` — локальные ответы (кабинет владельца). */
export default function Chat({cfg,title='Помощник',hints,answer}:{cfg:Cfg;title?:string;hints:string[];answer?:(q:string)=>string}){
  const [open,setOpen]=useState(false),[q,setQ]=useState(''),[wait,setWait]=useState(false),[log,setLog]=useState<M[]>([])
  const sid=useRef(sidOf(cfg.slug)).current,end=useRef<HTMLDivElement>(null)
  const add=(m:M)=>setLog(l=>l.some(x=>x.id===m.id)?l:[...l,m])
  const ai=!answer&&!!sb

  useEffect(()=>{
    if(!ai)return
    sb!.from('chat_messages').select('id,role,content').eq('session_id',sid).order('created_at').then(r=>setLog((r.data as M[])??[]))
    const ch=sb!.channel('chat-'+sid).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`session_id=eq.${sid}`},
      p=>{const m=p.new as M;add(m);if(m.role==='assistant')setWait(false)}).subscribe()
    return()=>{sb!.removeChannel(ch)}
  },[])
  useEffect(()=>{end.current?.scrollIntoView({behavior:'smooth'})},[log,open,wait])

  async function ask(t:string){
    t=t.trim();if(!t||wait)return;setQ('')
    if(answer){setLog(l=>[...l,{id:crypto.randomUUID(),role:'user',content:t},{id:crypto.randomUUID(),role:'assistant',content:answer(t.toLowerCase())}]);return}
    if(!sb){setLog(l=>[...l,{id:crypto.randomUUID(),role:'assistant',content:'Supabase не настроен (.env).'}]);return}
    setWait(true)
    const {data,error}=await sb.from('chat_messages').insert({store_slug:cfg.slug,session_id:sid,role:'user',content:t.slice(0,500)}).select('id,role,content').single()
    if(error)return setWait(false)
    add(data as M)
    const r=await sb.functions.invoke('assistant',{body:{store_slug:cfg.slug,session_id:sid}})
    if(r.error){setWait(false);add({id:crypto.randomUUID(),role:'assistant',content:'Помощник временно недоступен. Позвоните: '+cfg.phone})}
  }

  return <>
    <button aria-label={title} onClick={()=>setOpen(true)} className="btn fixed right-4 bottom-28 z-30 !rounded-full !px-4 !py-3 shadow-xl">{title}</button>
    {open&&<div className="sheet" onClick={()=>setOpen(false)}><div className="glass flex flex-col gap-3" style={{height:'80vh'}} onClick={e=>e.stopPropagation()} role="dialog" aria-label={title}>
      <div className="flex justify-between items-center"><h2 className="display text-xl">{title}</h2><button className="btn-glass !py-2 !px-3" onClick={()=>setOpen(false)} aria-label="Закрыть">✕</button></div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {!log.length&&<p className="muted text-sm">Спросите про цены или свободное время.</p>}
        {log.map(m=><div key={m.id} className={'bubble '+(m.role==='user'?'u':'a')}>{m.content}</div>)}
        {wait&&<div className="bubble a muted">Помощник печатает…</div>}<div ref={end}/></div>
      <div className="flex flex-wrap gap-2">{hints.map(h=><button key={h} onClick={()=>ask(h)} className="chip">{h}</button>)}</div>
      <div className="flex gap-2"><input className="inp" value={q} maxLength={500} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask(q)} placeholder="Ваш вопрос"/>
      <button className="btn" disabled={wait} onClick={()=>ask(q)}>Отправить</button></div></div></div>}</>
}
