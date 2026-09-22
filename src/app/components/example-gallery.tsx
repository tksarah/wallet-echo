'use client';
import {Localized,useLanguage} from './language';
import {appearanceText} from '@/lib/translations';
import { useRef, useState } from 'react';
import { styles, type GenerationStyle } from '@/lib/styles';
import examples from '@/lib/examples.json';

export default function ExampleGallery({onChoose, busy}: {onChoose: (style: GenerationStyle)=>void; busy: boolean}) {
  const {language}=useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(examples[0]);
  return <Localized><section className="example-gallery" id="examples" aria-labelledby="examples-title">
    <div className="section-heading"><div><h2 id="examples-title">ひとつの個性、5つの姿。</h2></div></div>
    <p className="example-note">同じ活動を5つの世界観で表現した生成例です。実際の結果は活動内容により異なります。</p>
    <div className="example-grid">{styles.map(style=>{
      const sample = examples.find(e=>e.style===style.id)!;
      return <button type="button" className="example-card" key={style.id} aria-label={`${style.name}の完成見本を見る`} onClick={()=>{setSelected(sample);dialog.current?.showModal();}}>
        <img src={sample.thumbnail} alt={`${style.name}の生成例`} width="480" height="480" loading="lazy"/>
        <span className="example-caption"><strong>{style.name}</strong><span>個性と理由を見る ↗</span></span>
      </button>;
    })}</div>
    <dialog className="sample-dialog example-dialog" ref={dialog} aria-labelledby="example-title" onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}>
      <div className="sample-dialog-heading"><h3 id="example-title">{styles.find(s=>s.id===selected.style)?.name} の完成見本</h3><button type="button" className="secondary-button" onClick={()=>dialog.current?.close()} aria-label="完成見本を閉じる">閉じる ×</button></div>
      <div className="example-detail"><img src={selected.image} alt={selected.name} width="1024" height="1024"/>
        <div><h3>{selected.name}</h3><div className="trait-tags"><span>{selected.temperamentLabel}</span><span>{selected.motifLabel}</span></div>
          <h4>個性を、こんな姿へ</h4><p>{appearanceText(selected.pose,selected.motif,language)}</p>
          <h4>参考にした活動</h4><ul>{selected.evidence.map((text,i)=><li key={i}>{text}</li>)}</ul><p className="example-note">{selected.summary}</p>
          <button type="button" className="secondary-button" disabled={busy} onClick={()=>{dialog.current?.close();onChoose(selected.style as GenerationStyle);}}>この世界観でつくる ↗</button>
          {busy&&<p>生成が完了すると世界観を選べます。</p>}
        </div>
      </div>
    </dialog>
  </section></Localized>;
}
