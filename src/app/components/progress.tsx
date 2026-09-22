'use client';
import {Localized} from './language';
import { useEffect, useState } from 'react';
const phases=['analyzing','judging','generating'];
const labels=['履歴取得','個性の判定','画像生成'];
export function ProgressView({status,elapsed,disconnected,onReconnect}:{status:string;elapsed:number;disconnected:boolean;onReconnect:()=>void}){
  const index=Math.max(0,phases.indexOf(status));
  return <Localized><div className={'progress-state '+(disconnected?'is-disconnected':'')}>
    <div className="progress-beacon" aria-hidden="true"><span className="spinner-ring"/><span>✧</span></div>
    <p className="progress-kicker">{disconnected?'接続を確認してください':`STEP ${index+1} / 3 · 処理中`}</p>
    <h3 role="status">{disconnected?'状況を確認できません':`${labels[index]}を進めています`}</h3>
    <p>{disconnected?'通信が途切れています。サーバー側の処理は継続している可能性があります。確認を再開しても、新しい生成は行いません。':'画面を開いたままお待ちください。画像生成には数分かかる場合があります。'}</p>
    <div className="elapsed" aria-live="off">開始から <strong>{Math.floor(elapsed/60)}分{String(elapsed%60).padStart(2,'0')}秒</strong></div>
    {!disconnected&&<div className="progress-light" aria-hidden="true"><span/></div>}
    <ol aria-label="生成の工程">{labels.map((label,i)=><li key={label} className={i<index?'done':i===index?'current':''} aria-current={i===index?'step':undefined}><span>{i<index?'✓':i+1}</span><strong>{label}</strong><small>{i<index?'完了':i===index?(disconnected?'確認待ち':'処理中'):'待機中'}</small></li>)}</ol>
    {disconnected&&<button type="button" className="secondary-button" onClick={onReconnect}>状況の確認を再開</button>}
  </div></Localized>;
}
export default function Progress({status,startedAt,disconnected,onReconnect}:{status:string;startedAt:string;disconnected:boolean;onReconnect:()=>void}){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  return <ProgressView status={status} elapsed={Math.max(0,Math.floor((now-Date.parse(startedAt))/1000))} disconnected={disconnected} onReconnect={onReconnect}/>;
}
