import type { Ledger } from './ledger';
export const listNames = ['wallet', 'history', 'log'] as const;
export type ListName = typeof listNames[number];
export type ListQuery = {search:string;page:number};
export type AdminQueries = Record<ListName,ListQuery>;
export type PageInfo = ListQuery & {total:number;pages:number;pageSize:number;from:number;to:number};
export function pageNumber(value:unknown):number {
  const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(100000,Math.floor(n))):1;
}
export function slicePage<T>(items:T[],query:ListQuery,pageSize=50){
  const pages=Math.max(1,Math.ceil(items.length/pageSize));const page=Math.min(pageNumber(query.page),pages);
  const start=(page-1)*pageSize;
  return {items:items.slice(start,start+pageSize),info:{search:query.search,page,pages,pageSize,total:items.length,from:items.length?start+1:0,to:Math.min(start+pageSize,items.length)}};
}
export function adminLists(ledger:Ledger,search='',page=1,queries?:AdminQueries){
  const q=queries||{wallet:{search,page},history:{search,page:1},log:{search,page:1}};
  const matches=(address:string|undefined,term:string)=>!term||(address||'').toLowerCase().includes(term.toLowerCase());
  const wallets=slicePage(Object.values(ledger.wallets).filter(w=>matches(w.address,q.wallet.search)).sort((a,b)=>b.lastAt.localeCompare(a.lastAt)||a.address.localeCompare(b.address)),q.wallet);
  const history=slicePage(ledger.history.filter(h=>matches(h.address,q.history.search)),q.history,queries?50:100);
  const logs=slicePage(ledger.logs.filter(l=>matches(l.address,q.log.search)),q.log,queries?50:100);
  return {wallets:wallets.items,walletCount:wallets.info.total,page:wallets.info.page,history:history.items,logs:logs.items,pagination:{wallet:wallets.info,history:history.info,log:logs.info}};
}
export function parseAdminQueries(params:URLSearchParams):AdminQueries|undefined {
  if(!listNames.some(name=>params.has(name+'Page')||params.has(name+'Search')))return undefined;
  return Object.fromEntries(listNames.map(name=>[name,{search:(params.get(name+'Search')||'').trim().slice(0,100),page:pageNumber(params.get(name+'Page'))}])) as AdminQueries;
}
