'use client';
import {Localized} from './language';
import type {PageInfo} from '@/lib/admin-lists';
export default function Pagination({info,disabled,onPage,label}:{info:PageInfo;disabled:boolean;onPage:(page:number)=>void;label:string}){
  return <Localized><nav className="pagination" aria-label={`${label}のページ送り`}>
    <span>{info.from}–{info.to} / {info.total}件</span><div><button type="button" className="secondary-button" disabled={disabled||info.page<=1} onClick={()=>onPage(info.page-1)}>前へ</button><span>{info.page} / {info.pages} ページ</span><button type="button" className="secondary-button" disabled={disabled||info.page>=info.pages} onClick={()=>onPage(info.page+1)}>次へ</button></div>
  </nav></Localized>;
}
