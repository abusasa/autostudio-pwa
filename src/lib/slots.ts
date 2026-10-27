import type { Cfg, Busy } from './types'
const STEP=30
const at=(d:Date,hm:string)=>{const[h,m]=hm.split(':').map(Number);const x=new Date(d);x.setHours(h,m,0,0);return x}
export const isOff=(c:Cfg,d:Date)=>c.daysOff.includes(d.getDay())
/** Свободные старты на дату: учитывает график, выходные, длительность услуги и число боксов */
export function slotsFor(c:Cfg,busy:Busy[],day:Date,min:number,now=new Date()){
  if(isOff(c,day))return[] as {t:Date;free:boolean}[]
  const out=[],end=at(day,c.hours.close)
  for(let t=at(day,c.hours.open);t.getTime()+min*6e4<=end.getTime();t=new Date(t.getTime()+STEP*6e4)){
    const e=new Date(t.getTime()+min*6e4)
    const used=busy.filter(b=>new Date(b.starts_at)<e&&new Date(b.ends_at)>t).length
    out.push({t,free:t>now&&used<c.boxes})
  }
  return out
}
export const nextFree=(c:Cfg,busy:Busy[],min:number)=>{
  for(let i=0;i<14;i++){const d=new Date();d.setDate(d.getDate()+i);const s=slotsFor(c,busy,d,min).find(x=>x.free);if(s)return s.t}
  return null
}
export const fmt=(d:Date|string)=>new Date(d).toLocaleString('ru-RU',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
export const rub=(n:number)=>n.toLocaleString('ru-RU')+' ₽'
