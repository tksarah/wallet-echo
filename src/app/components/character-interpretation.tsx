'use client';
import {Localized,useLanguage} from './language';
import {appearanceText} from '@/lib/translations';
import type { Character } from '@/lib/types';

export default function CharacterInterpretation({character}:{character:Character}) {
  const {language}=useLanguage();
  const interpretation=character.interpretation;
  if(!interpretation)return null;
  return <Localized><section className="interpretation" aria-label="活動から生まれた個性">
    <div className="trait-tags"><span>{interpretation.temperamentLabel}</span><span>{interpretation.motifLabel}</span></div>
    <h4>個性を、こんな姿へ</h4>
    <p>{appearanceText(interpretation.pose,interpretation.motif,language)}</p>
    {interpretation.notice&&<p className="interpretation-notice">{interpretation.notice}</p>}
    <h4>参考にした活動</h4>
    <ul>{interpretation.evidence.map((item,index)=><li key={`${item.key}-${index}`}>{item.text}</li>)}</ul>
    <p className="interpretation-note">取得できた活動から着想した創作上の表現です。同じ活動データなら、世界観を変えても個性を引き継ぎます。</p>
  </section></Localized>;
}
