'use client';
import {Localized} from './language';
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';
type Kind='success'|'warning'|'error';
type Notice={id:string;kind:Kind;message:string;dismissed?:boolean};
type Notifications={items:Notice[];notify:(id:string,kind:Kind,message:string)=>void;clear:(id:string)=>void;dismiss:(id:string)=>void};
const Context=createContext<Notifications>({items:[],notify:()=>{},clear:()=>{},dismiss:()=>{}});
export const useNotifications=()=>useContext(Context);
export function NotificationsProvider({children}:{children:ReactNode}){
  const [items,setItems]=useState<Notice[]>([]);
  const notify=useCallback((id:string,kind:Kind,message:string)=>setItems(previous=>{
    const old=previous.find(n=>n.id===id);if(old?.message===message&&old.kind===kind)return previous;
    return [{id,kind,message},...previous.filter(n=>n.id!==id)];
  }),[]);
  const clear=useCallback((id:string)=>setItems(old=>old.some(n=>n.id===id)?old.filter(n=>n.id!==id):old),[]);
  const dismiss=useCallback((id:string)=>setItems(old=>old.map(n=>n.id===id?{...n,dismissed:true}:n)),[]);
  return <Context.Provider value={{items,notify,clear,dismiss}}>{children}</Context.Provider>;
}
function NoticeItem({notice}:{notice:Notice}){
  const {dismiss}=useNotifications();
  useEffect(()=>{if(notice.kind!=='success')return;const timer=setTimeout(()=>dismiss(notice.id),5000);return()=>clearTimeout(timer);},[notice.id,notice.message,notice.kind,dismiss]);
  return <Localized><div className={`notification notification-${notice.kind}`}>
    <div role={notice.kind==='error'?'alert':'status'} aria-atomic="true"><strong><span aria-hidden="true">{notice.kind==='error'?'!':notice.kind==='warning'?'△':'✓'} </span>{{success:'完了',warning:'お知らせ',error:'操作を確認してください'}[notice.kind]}</strong><p>{notice.message}</p></div>
    <button type="button" aria-label="通知を閉じる" onClick={()=>dismiss(notice.id)}>×</button>
  </div></Localized>;
}
export function NotificationBar({fixed=false}:{fixed?:boolean}){
  const {items}=useNotifications();
  return <Localized><div className={`notification-bar ${fixed?'notification-fixed':''}`} aria-label="操作のお知らせ">{items.filter(n=>!n.dismissed).map(notice=><NoticeItem key={notice.id+notice.message} notice={notice}/>)}</div></Localized>;
}
