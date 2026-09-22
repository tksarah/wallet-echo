import type { WalletFeatures } from './types';
export function activityMetrics(f:WalletFeatures){
  const days=f.firstObservedAt&&f.lastObservedAt?Math.max(1,Math.floor((Date.parse(f.lastObservedAt)-Date.parse(f.firstObservedAt))/86400000)+1):0;
  return [
    {label:'活動日数',value:`${f.activeDaysLast30d} 日`,help:'直近30日で操作した日数（取得範囲内）'},
    {label:'操作の種類',value:`${f.operationKinds.length} 種類`,help:'成功した送金・コントラクト操作など'},
    {label:'接点の広がり',value:f.addressType==='evm'?`${f.uniqueTargets} 件`:'取得対象外',help:f.addressType==='evm'?'成功した操作の宛先アドレス数':'Substrateでは宛先を取得していません'},
    {label:'観測期間',value:days?`${days} 日`:'履歴なし',help:'取得した最古〜最新の活動。ウォレットの年齢ではありません'},
  ];
}
