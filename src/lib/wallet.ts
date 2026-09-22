import { z } from 'zod';
import { decodeAddress } from '@polkadot/util-crypto';
import { config } from './config';
import { AppError } from './errors';
import { fetchJson } from './http';
import type { Activity, GenerationInput, WalletFeatures } from './types';
const LIMIT = 200;
const blockscoutPage = z.object({items: z.array(z.object({
  hash: z.string(), timestamp: z.string().datetime({offset:true}).nullable(),
  from: z.object({hash:z.string()}), to: z.object({hash:z.string(),is_contract:z.boolean().optional()}).nullable(),
  method: z.string().nullable().optional(), status: z.string().nullable(),
})), next_page_params: z.record(z.union([z.string(),z.number(),z.boolean(),z.null()])).nullable()});
const substratePage = z.object({code:z.number(),data:z.object({count:z.number(),extrinsics:z.array(z.object({
  extrinsic_hash:z.string(),block_timestamp:z.number(),call_module:z.string(),call_module_function:z.string(),
  success:z.boolean(),account_display:z.object({address:z.string()}).nullable().optional(),
})).nullable().optional()}).nullable()});
const subscanEvmPage=z.object({code:z.number(),data:z.object({count:z.number(),list:z.array(z.object({hash:z.string(),from:z.string(),to:z.string().nullable(),success:z.boolean(),block_timestamp:z.number(),method:z.string().nullable().optional(),to_display:z.object({evm_contract:z.unknown().optional()}).nullable().optional()})).nullable().optional()}).nullable()});
function invalid() { return new AppError('INVALID_UPSTREAM','履歴データの形式を確認できませんでした。空のウォレットとしては判定しません。',502); }
export function summarize(input: GenerationInput, activities: Activity[], truncated: boolean, now = Date.now(), pendingTransactions=0): WalletFeatures {
  const unique = [...new Map(activities.map(a => [a.id,a])).values()];
  const timestamps = unique.map(a=>a.timestamp).sort((a,b)=>a-b);
  const successful = unique.filter(a=>a.success);
  const operationCounts = new Map<string, number>();
  const days = new Map<string, { date: string; count: number; successful: number }>();
  for (const a of successful) operationCounts.set(a.kind, (operationCounts.get(a.kind) || 0) + 1);
  for (const a of unique) {
    const date = new Date(a.timestamp).toISOString().slice(0, 10);
    const day = days.get(date) || { date, count: 0, successful: 0 };
    day.count++; if (a.success) day.successful++;
    days.set(date, day);
  }
  return {
    source:input.addressType==='evm'?'Blockscout':'Subscan via PubFi',addressType:input.addressType,address:input.address,
    fetchedAt:new Date(now).toISOString(),observedTransactions:unique.length,pendingTransactions,successfulTransactions:successful.length,
    activeDaysLast30d:new Set(unique.filter(a=>a.timestamp>=now-30*86400000 && a.timestamp<=now).map(a=>new Date(a.timestamp).toISOString().slice(0,10))).size,
    uniqueTargets:new Set(successful.flatMap(a=>a.target?[a.target]:[])).size,
    operationKinds:[...new Set(successful.map(a=>a.kind))].sort(),
    operationDistribution:[...operationCounts].sort(([a],[b])=>a.localeCompare(b)).map(([kind,count])=>({kind,count,share:count/successful.length})),
    dailyActivity:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),
    activeDaysObserved:days.size,
    observedSpanDays:timestamps.length?Math.floor((timestamps.at(-1)!-timestamps[0])/86400000)+1:0,
    stakingInteractions:successful.filter(a=>/^(dappstaking|dappsstaking|dapps_staking|staking)\./i.test(a.kind)).length,
    governanceInteractions:successful.filter(a=>/^(democracy|referenda|convictionvoting|council)\./i.test(a.kind)).length,
    firstObservedAt:timestamps.length?new Date(timestamps[0]).toISOString():null,
    lastObservedAt:timestamps.length?new Date(timestamps.at(-1)!).toISOString():null,
    truncated,sampleLimit:LIMIT,unknownFeatures:['wallet_creation_date','other_chains','defi_protocol_classification','nft_collection','stablecoin_ratio','asset_value',...(input.addressType==='evm'?['staking_classification','governance_classification']:['unique_contracts'])],
  };
}
export async function analyzeWallet(input: GenerationInput): Promise<WalletFeatures> {
  const activities:Activity[]=[];
  let truncated=false;
  let pendingTransactions=0;
  if(input.addressType==='evm') {
    try {
    let cursor:Record<string,string|number|boolean|null>|null=null;
    for(let page=0;page<4;page++){
      const params=new URLSearchParams({...Object.fromEntries(Object.entries(cursor||{}).filter(([,v])=>v!==null).map(([k,v])=>[k,String(v)])),filter:'from'});
      const raw=await fetchJson(`https://astar.blockscout.com/api/v2/addresses/${input.address}/transactions?${params}`,{},8000);
      const parsed=blockscoutPage.safeParse(raw);if(!parsed.success)throw invalid();
      for(const tx of parsed.data.items){if(tx.from.hash.toLowerCase()!==input.address.toLowerCase())throw invalid();if(tx.status===null){pendingTransactions++;continue;}if(!tx.timestamp)throw invalid();activities.push({id:tx.hash,timestamp:Date.parse(tx.timestamp),kind:tx.to?.is_contract?'contract_call':tx.to?'transfer':'contract_creation',target:tx.to?.hash.toLowerCase()||null,success:tx.status==='ok'});}
      cursor=parsed.data.next_page_params;
      if(!cursor)break;
      if(activities.length>=LIMIT || page===3){truncated=true;break;}
    }
    } catch(error) {
      if(!config().pubfiKey)throw error;
      // Refetch the entire sample from the second real indexer; never mix samples or fabricate data.
      return analyzeEvmWithSubscan(input);
    }
  } else {
    const key=config().pubfiKey;if(!key)throw new AppError('NOT_CONFIGURED','Substrateの解析APIが未設定です。管理者による設定をお待ちください。',503);
    for(let page=0;page<10;page++){
      const raw=await fetchJson('https://api.pubfi.ai/v1/gateway/subscan/astar/api/v2/scan/extrinsics',{
        method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({address:input.address,row:20,page,order:'desc',signed:'signed'}),
      });
      const parsed=substratePage.safeParse(raw);if(!parsed.success || parsed.data.code!==0 || !parsed.data.data)throw invalid();
      const {count,extrinsics}=parsed.data.data;
      if(!extrinsics && count!==0)throw invalid();
      for(const tx of extrinsics||[]){
        if(!tx.account_display?.address)throw invalid();
        try { if(Buffer.compare(Buffer.from(decodeAddress(tx.account_display.address)),Buffer.from(decodeAddress(input.address)))!==0)throw invalid(); } catch {throw invalid();}
        activities.push({id:tx.extrinsic_hash,timestamp:tx.block_timestamp*1000,kind:`${tx.call_module}.${tx.call_module_function}`,target:null,success:tx.success});
      }
      if(activities.length>=count)break;
      if(!(extrinsics?.length))throw invalid();
      if(page===9)truncated=true;
    }
  }
  return summarize(input,activities.slice(0,LIMIT),truncated,Date.now(),pendingTransactions);
}
async function analyzeEvmWithSubscan(input:GenerationInput):Promise<WalletFeatures>{
  const activities:Activity[]=[];let truncated=false;
  for(let page=0;page<10;page++){
    const raw=await fetchJson('https://api.pubfi.ai/v1/gateway/subscan/astar/api/scan/evm/v2/transactions',{method:'POST',headers:{Authorization:`Bearer ${config().pubfiKey}`,'Content-Type':'application/json'},body:JSON.stringify({address:input.address,direction:'from',row:20,page})});
    const parsed=subscanEvmPage.safeParse(raw);if(!parsed.success||parsed.data.code!==0||!parsed.data.data)throw invalid();
    const {count,list}=parsed.data.data;if(!list&&count!==0)throw invalid();
    for(const tx of list||[]){if(tx.from.toLowerCase()!==input.address.toLowerCase())throw invalid();activities.push({id:tx.hash,timestamp:tx.block_timestamp*1000,kind:!tx.to?'contract_creation':tx.to_display?.evm_contract?'contract_call':tx.method&&tx.method!=='0x'?'transaction_with_data':'transfer',target:tx.to?.toLowerCase()||null,success:tx.success});}
    if(activities.length>=count)break;
    if(!list?.length)throw invalid();
    if(page===9)truncated=true;
  }
  return {...summarize(input,activities.slice(0,LIMIT),truncated),source:'Subscan via PubFi'};
}
