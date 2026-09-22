'use client';
import {Localized} from './language';
import { useEffect, useRef, useState } from 'react';
import type { Job } from '@/lib/types';
import ShareResult from './share-result';
import {useNotifications} from './notifications';
export default function ImageResult({job}:{job:Job}){
  const {notify,clear}=useNotifications();
  const [url,setUrl]=useState(''),[displayed,setDisplayed]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0),[receiving,setReceiving]=useState(false),[ackFailed,setAckFailed]=useState(false);
  const receipt=useRef(''),acknowledged=useRef(false),ackBusy=useRef(false);
  const initial=useRef(job);
  useEffect(()=>{
    const j=initial.current;
    if(j.imageDelivery!=='pending')return;
    const controller=new AbortController();let objectUrl='';let cancelled=false;
    setReceiving(true);setError('');setUrl('');setDisplayed(false);receipt.current='';
    void (async()=>{try{
      const response=await fetch(`/api/jobs/${j.id}/image`,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(response.status===410?'受取期限が終了したか、すでに受領した画像です。再取得はできません。':'画像を受け取れませんでした。受取期限内なら再確認できます。');
      const token=response.headers.get('X-Image-Receipt');if(!token)throw new Error('受領情報を確認できませんでした。');
      const blob=await response.blob();if(cancelled)return;receipt.current=token;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
    }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'画像を受け取れませんでした。');}finally{if(!cancelled)setReceiving(false);}})();
    return()=>{cancelled=true;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[job.id,version]);
  async function acknowledge(){
    if(acknowledged.current||ackBusy.current||!receipt.current)return;ackBusy.current=true;
    try{const r=await fetch(`/api/jobs/${job.id}/image`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receipt:receipt.current}),cache:'no-store'});if(!r.ok)throw new Error();acknowledged.current=true;setAckFailed(false);}catch{setAckFailed(true);}finally{ackBusy.current=false;}
  }
  const unavailable=job.imageDelivery==='received'?'この画像は受領済みです。ページを閉じる・再読み込みすると再表示できません。':job.imageUnavailableReason==='legacy-deleted'?'保存方式の変更により、以前の生成画像は削除されています。':job.imageUnavailableReason==='restarted'?'サーバーの再起動により、未受領の画像を取得できなくなりました。':'画像の受取期限が終了しました。再取得はできません。';
  useEffect(()=>{if(error)notify('image-error','error',error);else clear('image-error');},[error,notify,clear]);
  useEffect(()=>{if(ackFailed)notify('image-ack','warning','画像は受け取りましたが、受領通知を確認できませんでした。結果欄から受領通知を再送できます。');else clear('image-ack');},[ackFailed,notify,clear]);
  useEffect(()=>{if(job.imageDelivery!=='pending')notify('image-unavailable','warning',unavailable);else clear('image-unavailable');},[job.imageDelivery,unavailable,notify,clear]);
  useEffect(()=>()=>{for(const id of ['image-error','image-ack','image-unavailable','share'])clear(id);},[clear]);
  return <Localized><div className="image-delivery">
    {receiving&&<p role="status">画像を受け取っています…</p>}
    {url&&<><div className="generated-image"><img src={url} alt={`${job.character?.name||'Echo'}のキャラクター画像`} width="1024" height="1024" onLoad={()=>{setDisplayed(true);void acknowledge();}} onError={()=>{setError('画像を表示できませんでした。受取期限内にもう一度お試しください。');setUrl('');setDisplayed(false);}}/></div>{displayed&&<><p className="download-reminder">画像はこのページを閉じる・再読み込みする前にダウンロードしてください。</p><a className="secondary-button download" href={url} download={`wallet-echo-${job.id}.png`}>画像をダウンロード <span>↓</span></a><ShareResult name={job.character?.name||'Echo'} style={job.character?.style||job.character?.worldStyle||''}/></>}</>}
    {ackFailed&&<p className="notice">画像は受け取りましたが、サーバーへの受領通知を確認できませんでした。未通知でも10分後は取得できなくなり、次回アクセス時に削除します。<button type="button" className="secondary-button" onClick={()=>void acknowledge()}>受領通知を再送</button></p>}
    {error&&<div className="error">{error}<button type="button" className="secondary-button" onClick={()=>setVersion(v=>v+1)}>画像の受け取りを再確認</button></div>}
    {!url&&!receiving&&!error&&job.imageDelivery!=='pending'&&<p className="notice">{unavailable} 自動で再生成は行いません。</p>}
  </div></Localized>;
}
