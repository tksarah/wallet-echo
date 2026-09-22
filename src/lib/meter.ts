import { AsyncLocalStorage } from 'node:async_hooks';
export type Provider='image'|'pubfi'|'jev';
export type MeterEvent={provider:Provider;phase:'start'|'success'|'error';usd?:number;measured?:boolean};
export const meter=new AsyncLocalStorage<(event:MeterEvent)=>Promise<void>>();
export function providerFor(url:string):Provider|undefined{
  const host=new URL(url).hostname;
  return host==='api.openai.com'?'image':host==='api.pubfi.ai'?'pubfi':host==='api.typesafe.ai'?'jev':undefined;
}
export function imageCost(raw:unknown):number|undefined{
  const u=(raw as {usage?:{output_tokens?:number;input_tokens_details?:{text_tokens?:number;image_tokens?:number}}})?.usage;
  if(!u||!Number.isFinite(u.output_tokens)||!Number.isFinite(u.input_tokens_details?.text_tokens)||!Number.isFinite(u.input_tokens_details?.image_tokens))return undefined;
  return (u.output_tokens!*30+u.input_tokens_details!.text_tokens!*5+u.input_tokens_details!.image_tokens!*8)/1e6;
}
