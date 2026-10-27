export type Svc={id:string;name:string;price:number;duration:number}
export type Cfg={slug:string;name:string;tagline:string;logo:string;hero:string;accent:string;demo:boolean;phone:string;messenger:string;address:string;boxes:number;hours:{open:string;close:string};daysOff:number[];services:Svc[];gallery:{img:string;title:string;text:string}[]}
export type Booking={id:string;store_slug:string;name:string;phone:string;car:string;service_name:string;price:number;starts_at:string;ends_at:string;status:'new'|'done'|'cancelled'}
export type Busy={starts_at:string;ends_at:string}
