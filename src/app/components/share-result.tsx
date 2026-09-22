'use client';
import {Localized,useLanguage} from './language';
import { useRef, useState } from 'react';
import {useNotifications} from './notifications';
import { shareText, xShareUrl } from '@/lib/sharing';

export default function ShareResult({name, style}: {name: string; style: string}) {
  const {notify,clear}=useNotifications();
  const {language}=useLanguage();
  const text = shareText(name, style, undefined, language);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    setCopied(false);clear('share');
    try { await navigator.clipboard.writeText(text); setCopied(true); setFallback(false);notify('share','success','投稿文をコピーしました。'); }
    catch { setFallback(true);notify('share','warning','自動コピーできませんでした。投稿文の欄から文面を選択してコピーしてください。'); }
  }
  return <Localized><section className="share-result" aria-label="Echoをシェア">
    <h4>あなたのEchoをシェアしよう</h4>
    <p>画像をダウンロードして、投稿画面で添付してください。</p>
    <div className="share-actions">
      <a className="secondary-button" href={xShareUrl(text)} target="_blank" rel="noopener noreferrer">Xに投稿 ↗</a>
      <button type="button" className="secondary-button" onClick={()=>void copy()}>投稿文をコピー</button>
    </div>
    <span>{copied?'投稿文をコピーしました。':''}</span>
    {fallback&&<div className="share-fallback"><label htmlFor="share-text">自動コピーできませんでした。文面を選択してコピーしてください。</label>
      <textarea id="share-text" ref={field} readOnly rows={5} value={text} onFocus={e=>e.currentTarget.select()}/>
      <button type="button" className="secondary-button" onClick={()=>{field.current?.focus();field.current?.select();}}>文面を選択</button>
    </div>}
  </section></Localized>;
}
