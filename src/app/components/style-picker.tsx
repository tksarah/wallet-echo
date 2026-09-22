'use client';
import {Localized} from './language';
import { useRef, useState } from 'react';
import { styles, styleSample, type GenerationStyle } from '@/lib/styles';
export default function StylePicker({value,onChange}:{value:GenerationStyle;onChange:(value:GenerationStyle)=>void}){
  const dialog=useRef<HTMLDialogElement>(null);const [sample,setSample]=useState(styles[0] as typeof styles[number]);
  return <Localized><><div className="style-grid" role="group" aria-label="世界観">{styles.map(style=><div key={style.id} className={'style-card '+(value===style.id?'selected':'')}>
    <button className="sample-thumbnail" type="button" aria-label={`${style.name}のサンプルを拡大`} onClick={()=>{setSample(style);dialog.current?.showModal();}}><img src={styleSample(style.id)} alt={`${style.name}の作風サンプル`} width="88" height="88" loading="lazy"/><span>拡大 ↗</span></button>
    <button className="style-choice" type="button" aria-pressed={value===style.id} onClick={()=>onChange(style.id)}><span><strong>{style.name}</strong><small>{style.description}</small></span><span className="world-check" aria-hidden="true">{value===style.id?'✓':'○'}</span></button>
  </div>)}</div><p className="sample-note">作風サンプル／実際の結果は活動内容により異なります。</p>
  <dialog className="sample-dialog" ref={dialog} aria-labelledby="sample-title" onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}><div><div className="sample-dialog-heading"><h3 id="sample-title">{sample.name}</h3><button type="button" className="secondary-button" onClick={()=>dialog.current?.close()} aria-label="サンプルを閉じる">閉じる ×</button></div><img src={styleSample(sample.id)} alt={`${sample.name}の作風サンプル拡大`} width="1024" height="1024"/><p>{sample.description}</p><small>作風サンプル／実際の結果は活動内容により異なります。</small></div></dialog></></Localized>;
}
