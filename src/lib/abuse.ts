import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {abuseSecret,config} from './config';
import type {LocalDatabase} from './local-storage';
import {AppError} from './errors';
import {bindings,type Admission,type State,type StoredJob} from './storage';

const DAY=86400000,COOKIE='__Host-wallet_echo_browser';
export const LIMITS={browserDay:3,ipHour:10,ipDay:20,globalDay:100,requestMinute:30} as const;
export const japanDay=(at=Date.now())=>new Date(at+9*3600000).toISOString().slice(0,10);
export function abuseConfigured(){return !!(abuseSecret()&&abuseSecret().length>=32&&config().abuseIpHeader==='x-forwarded-for');}
function secret(){const key=abuseSecret();if(!key||key.length<32)throw new AppError('SECURITY_UNAVAILABLE','安全確認の準備中です。しばらく待ってお試しください。',503);return key;}
export function digest(kind:string,value:string){return createHmac('sha256',secret()).update(kind+'\0'+value).digest('hex');}
function secureEqual(a:string,b:string){return /^[a-f0-9]{64}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function sessionOwner(request:Request):string{
  const cookies=request.headers.get('cookie')?.split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='))||[];
  if(cookies.length!==1)throw new AppError('BROWSER_SESSION','ブラウザーの確認が必要です。ページを再読み込みしてください。',401);
  const [id,expiry,sig]=cookies[0].slice(COOKIE.length+1).split('.');
  if(!/^[0-9a-f-]{36}$/.test(id||'')||!/^\d{13}$/.test(expiry||'')||Number(expiry)<Date.now()||!secureEqual(sig||'',digest('cookie',id+'.'+expiry)))throw new AppError('BROWSER_SESSION','ブラウザーの確認が必要です。ページを再読み込みしてください。',401);
  return digest('owner',id);
}
export function browserCookie(request:Request){
  try{sessionOwner(request);return undefined;}catch(e){if(e instanceof AppError&&e.code==='SECURITY_UNAVAILABLE')throw e;}
  const payload=randomUUID()+'.'+(Date.now()+30*DAY);
  return `${COOKIE}=${payload}.${digest('cookie',payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}
// Caddy appends/overwrites the actual peer as the last forwarding address.
// Enable only after authenticated ingress probes; the container is loopback-only.
export function clientIp(request:Request){
  if(config().abuseIpHeader!=='x-forwarded-for')throw new AppError('SECURITY_UNAVAILABLE','安全確認の準備中です。しばらく待ってお試しください。',503);
  const ip=request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'';
  if(!isIP(ip))throw new AppError('SECURITY_UNAVAILABLE','接続元を確認できません。しばらく待ってお試しください。',503);
  return isIP(ip)===6?new URL(`http://[${ip}]/`).hostname.slice(1,-1).toLowerCase():ip;
}
export function requestIdentity(request:Request):Admission{return {owner:sessionOwner(request),ip:digest('ip',clientIp(request))};}
export function assertJobOwner(job:StoredJob,owner:string){
  if(!job.owner||job.owner!==owner)throw new AppError('NOT_FOUND','この結果は見つからないか、保存期間が終了しています。',404);
}
export function todayAccepted(state:State,at=Date.now()){return state.acceptedAttempts.filter(a=>japanDay(a.at)===japanDay(at)).length;}
export function reserveAbuse(state:State,identity:Admission,at=Date.now()){
  state.acceptedAttempts=state.acceptedAttempts.filter(a=>a.at>at-2*DAY);
  const daily=state.acceptedAttempts.filter(a=>japanDay(a.at)===japanDay(at));
  if(daily.length>=LIMITS.globalDay)throw new AppError('DAILY_LIMIT','本日の受付上限に達しました。日本時間の午前0時以降にお試しください。',429);
  if(daily.filter(a=>a.owner===identity.owner).length>=LIMITS.browserDay)throw new AppError('BROWSER_LIMIT','このブラウザーの本日の生成枠を使い切りました。日本時間の午前0時以降にお試しください。',429);
  if(daily.filter(a=>a.ip===identity.ip).length>=LIMITS.ipDay)throw new AppError('IP_DAILY_LIMIT','この接続元の本日の受付上限に達しました。日本時間の午前0時以降にお試しください。',429);
  if(state.acceptedAttempts.filter(a=>a.ip===identity.ip&&a.at>at-3600000).length>=LIMITS.ipHour)throw new AppError('IP_HOURLY_LIMIT','この接続元からの生成が集中しています。時間をおいてお試しください。',429);
  state.acceptedAttempts.push({...identity,at});
}
async function pruneSmallTables(DB:LocalDatabase,at:number){
  await DB.batch([
    DB.prepare('DELETE FROM abuse_rates WHERE key IN (SELECT key FROM abuse_rates WHERE expires_at<=? LIMIT 50)').bind(at),
    DB.prepare('DELETE FROM abuse_rejections WHERE expires_at<=?').bind(at),
  ]);
}
/** Bounded sliding-window check before body parsing or full state reads. */
export async function rateLimit(request:Request,kind:'admission'|'session'|'read'|'run'='admission'){
  const ip=digest('ip',clientIp(request)),at=Date.now(),key=kind+':'+ip;
  const maximum=kind==='read'?240:kind==='run'?60:30;
  const {DB}=await bindings();await pruneSmallTables(DB,at);
  for(let attempt=0;attempt<40;attempt++){
    const row=await DB.prepare('SELECT timestamps,version FROM abuse_rates WHERE key=?').bind(key).first<{timestamps:string;version:number}>();
    const times:number[]=row?JSON.parse(row.timestamps).filter((t:number)=>t>at-60000):[];
    if(times.length>=maximum)throw new AppError('REQUEST_LIMIT','アクセスが集中しています。1分ほど待ってからお試しください。',429);
    times.push(at);
    const result=row?await DB.prepare('UPDATE abuse_rates SET timestamps=?,version=version+1,expires_at=? WHERE key=? AND version=?').bind(JSON.stringify(times),at+2*DAY,key,row.version).run():await DB.prepare('INSERT OR IGNORE INTO abuse_rates (key,timestamps,version,expires_at) VALUES (?,?,0,?)').bind(key,JSON.stringify(times),at+2*DAY).run();
    if(result.meta.changes===1)return;
    await new Promise(resolve=>setTimeout(resolve,5+Math.random()*20));
  }
  throw new AppError('REQUEST_LIMIT','アクセスが集中しています。1分ほど待ってからお試しください。',429);
}
const recordedReasons=new Set(['REQUEST_LIMIT','DAILY_LIMIT','BROWSER_LIMIT','IP_DAILY_LIMIT','IP_HOURLY_LIMIT','SECURITY_UNAVAILABLE','BROWSER_SESSION','BUSY','RECEPTION_PAUSED','WALLET_LIMIT','NOT_FOUND','KEY_CONFLICT','INVALID_INPUT','INVALID_ADDRESS','FORBIDDEN','TOO_LARGE','INVALID_JSON','CONTENT_TYPE']);
export async function recordRejection(error:unknown){
  const reason=error instanceof AppError&&recordedReasons.has(error.code)?error.code:'OTHER';
  const {DB}=await bindings(),at=Date.now();
  await DB.prepare('INSERT INTO abuse_rejections (day,reason,count,expires_at) VALUES (?,?,1,?) ON CONFLICT(day,reason) DO UPDATE SET count=count+1').bind(japanDay(at),reason,at+30*DAY).run();
}
export async function rejectionSummary(){
  const {DB}=await bindings(),at=Date.now();await pruneSmallTables(DB,at);
  return (await DB.prepare('SELECT day,reason,count FROM abuse_rejections WHERE expires_at>? ORDER BY day DESC,reason').bind(at).all<{day:string;reason:string;count:number}>()).results;
}
