import {useState} from 'react'
export default function Chat({title,hints,answer}:{title:string;hints:string[];answer:(q:string)=>string}){
  const [open,setOpen]=useState(false),[log,setLog]=useState<{r:'u'|'a';t:string}[]>([]),[q,setQ]=useState('')
  const ask=(t:string)=>{if(!t.trim())return;setLog(l=>[...l,{r:'u',t},{r:'a',t:answer(t.toLowerCase())}]);setQ('')}
  return <>
    <button aria-label="Ассистент" onClick={()=>setOpen(!open)} className="fixed right-4 bottom-24 z-40 w-14 h-14 rounded-full bg-accent shadow-xl text-2xl">💬</button>
    {open&&<div className="fixed right-4 bottom-40 z-40 w-[min(22rem,calc(100vw-2rem))] glass p-4 max-h-[60vh] flex flex-col bg-black/70">
      <div className="font-medium mb-2">{title}</div>
      <div className="overflow-y-auto flex-1 space-y-2 text-sm">{log.map((m,i)=><div key={i} className={m.r==='u'?'text-right text-white/70':'text-white'}>{m.t}</div>)}</div>
      <div className="flex flex-wrap gap-2 my-2">{hints.map(h=><button key={h} onClick={()=>ask(h)} className="text-xs btn-glass !px-3 !py-1.5">{h}</button>)}</div>
      <input className="inp" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask(q)} placeholder="Ваш вопрос"/>
    </div>}</>
}
