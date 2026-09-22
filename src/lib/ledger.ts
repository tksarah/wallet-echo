import { AppError } from './errors';
import type { GenerationInput, Job } from './types';
import type { MeterEvent } from './meter';
export const WALLET_LIMIT=3;
export type WalletRecord={address:string;addressType:string;used:number;total:number;resets:number;lastAt:string};
type Cost={image:number;pubfi:number;jev:number};
export type History={id:string;address:string;addressType:string;world:string;status:string;createdAt:string;updatedAt:string;attempts:number;cost:Cost;error?:string};
export type Ledger={since:string;wallets:Record<string,WalletRecord>;history:History[];logs:{at:string;event:string;address?:string;id?:string}[];calls:Cost;cost:Cost;measuredImages:number;estimatedImages:number;completed:number;failed:number;attempts:number;legacyJobs:number};
const zero=():Cost=>({image:0,pubfi:0,jev:0});
export const walletKey=(i:Pick<GenerationInput,'address'|'addressType'>)=>`${i.addressType}:${i.addressType==='evm'?i.address.toLowerCase():i.address}`;
export function newLedger(jobs:Job[]=[]):Ledger{
  const l:Ledger={since:new Date().toISOString(),wallets:{},history:[],logs:[],calls:zero(),cost:zero(),measuredImages:0,estimatedImages:0,completed:0,failed:0,attempts:0,legacyJobs:jobs.length};
  // Existing retained jobs count toward the quota, but historical API costs are unknown.
  for(const j of jobs){reserveWallet(l,j.input,false);addHistory(l,j);}
  return l;
}
export function log(l:Ledger,event:string,address?:string,id?:string){l.logs.unshift({at:new Date().toISOString(),event,address,id});l.logs=l.logs.slice(0,500);}
export function reserveWallet(l:Ledger,i:Pick<GenerationInput,'address'|'addressType'>,enforce=true){
  const key=walletKey(i);const w=l.wallets[key]||{address:i.address,addressType:i.addressType,used:0,total:0,resets:0,lastAt:''};
  if(enforce&&w.used>=WALLET_LIMIT)throw new AppError('WALLET_LIMIT','このウォレットの3回分の生成枠を使い切りました。上限のリセットは管理者にお問い合わせください。',429);
  w.used++;w.total++;w.lastAt=new Date().toISOString();l.wallets[key]=w;l.attempts++;return w;
}
export function addHistory(l:Ledger,j:Job){l.history.unshift({id:j.id,address:j.input.address,addressType:j.input.addressType,world:j.input.style||j.input.worldStyle,status:j.status,createdAt:j.createdAt,updatedAt:j.createdAt,attempts:1,cost:zero()});l.history=l.history.slice(0,5000);}
export function recordMeter(l:Ledger,id:string,e:MeterEvent){
  const h=l.history.find(h=>h.id===id);
  if(e.phase==='start'){
    l.calls[e.provider]++;
    const usd=e.provider==='image'?.015:e.provider==='pubfi'?.001:0;
    l.cost[e.provider]+=usd;if(h)h.cost[e.provider]+=usd;
    if(e.provider==='image')l.estimatedImages++;
  } else if(e.phase==='success'&&e.provider==='image'&&e.usd!==undefined){
    const delta=e.usd-.015;l.cost.image+=delta;if(h)h.cost.image+=delta;l.estimatedImages--;l.measuredImages++;
  }
  if(e.phase==='error')log(l,`${e.provider} API失敗（費用は暫定）`,h?.address,id);
}
export function updateHistory(l:Ledger,j:Job,previous:string){const h=l.history.find(h=>h.id===j.id);if(h){h.status=j.status;h.updatedAt=new Date().toISOString();h.error=j.error?.code;}
  if(previous!==j.status&&['failed','complete'].includes(j.status)){if(j.status==='complete')l.completed++;else l.failed++;log(l,j.status==='complete'?'生成完了':`生成失敗: ${j.error?.code||'UNKNOWN'}`,j.input.address,j.id);}
}
export function resetWallet(l:Ledger,key:string){const w=l.wallets[key];if(!w)throw new AppError('NOT_FOUND','ウォレットが見つかりません。',404);w.used=0;w.resets++;log(l,'管理者が生成枠をリセット',w.address);}
