import { newLedger, type Ledger } from './ledger';
import type { Job, GenerationInput } from './types';
import type { CachedJudgment } from './character';
import { AppError } from './errors';
import {LocalDatabase, MemoryBucket} from './local-storage';
import {dataDir} from './config';
import {readFile,copyFile,chmod} from 'node:fs/promises';
import path from 'node:path';
export type StoredJob = Job & {owner?:string;retryKeys?:string[];requestKey:string;requestedInput?:GenerationInput;runToken?:string;leaseUntil:number;runDeadline?:number;imageOnly?:boolean;objectKey?:string;receipt?:string};
export type Admission={owner:string;ip:string};
export type AcceptedAttempt=Admission & {at:number};
export type State = {jobs:Record<string,StoredJob>;ledger:Ledger;judgments:Record<string,CachedJudgment>;receptionPaused:boolean;concurrentLimit:number;acceptedAttempts:AcceptedAttempt[];loginAttempts:number[];judgmentLocks:Record<string,{token:string;until:number}>;garbage:Record<string,number>};
export type Bindings = {DB:LocalDatabase;BUCKET:MemoryBucket};
let testBindings:Bindings|undefined;
export function useTestBindings(value:Bindings){testBindings=value;}
const globalStore=globalThis as typeof globalThis & {walletEchoLocalStore?:Promise<Bindings>};
export async function bindings():Promise<Bindings>{
  if(testBindings)return testBindings;
  return globalStore.walletEchoLocalStore ??= initialize();
}
async function initialize():Promise<Bindings>{
  const DB=new LocalDatabase(dataDir()),BUCKET=new MemoryBucket();
  await chmod(path.join(dataDir(),'wallet-echo.sqlite'),0o600);
  if(!await DB.prepare('SELECT id FROM state_revision WHERE id=1').first()){
    let legacy:Partial<State>|undefined;
    const oldFile=path.join(dataDir(),'state.json');
    try{legacy=JSON.parse(await readFile(oldFile,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const state={...fresh(),...legacy,concurrentLimit:3,acceptedAttempts:[],loginAttempts:[],judgmentLocks:{},garbage:{}};
    if(legacy){
      if(!legacy.jobs||typeof legacy.jobs!=='object'||!legacy.ledger)throw new Error('Invalid legacy state; migration stopped');
      const backup=path.join(dataDir(),'state.pre-sqlite.json');
      try{await copyFile(oldFile,backup,1);}catch(error){
        if((error as NodeJS.ErrnoException).code!=='EEXIST'||(await readFile(backup,'utf8'))!==(await readFile(oldFile,'utf8')))throw error;
      }
      await chmod(path.join(dataDir(),'state.pre-sqlite.json'),0o600);
    }
    await DB.batch([DB.prepare('INSERT INTO state_revision VALUES (1,0,?)').bind('migration'),...Object.entries(encode(state)).map(([key,value])=>DB.prepare('INSERT INTO state_records VALUES (?,?)').bind(key,value))]);
  }
  // Bytes are intentionally transient; a restart never regenerates an image.
  const rows=await DB.prepare("SELECT key,value FROM state_records WHERE key LIKE 'job:%'").all<{key:string;value:string}>();
  for(const row of rows.results){const job=JSON.parse(row.value) as StoredJob;
    if(['analyzing','judging','generating'].includes(job.status)){job.leaseUntil=0;}
    if(job.imageDelivery==='pending'){job.imageDelivery='unavailable';job.imageUnavailableReason='restarted';delete job.imageUrl;}
    await DB.prepare('UPDATE state_records SET value=? WHERE key=?').bind(JSON.stringify(job),row.key).run();
  }
  return {DB,BUCKET};
}
const fresh=():State=>({jobs:{},ledger:newLedger(),judgments:{},receptionPaused:false,concurrentLimit:3,acceptedAttempts:[],loginAttempts:[],judgmentLocks:{},garbage:{}});
function encode(s:State){
  const {wallets,history,...ledger}=s.ledger;
  const rows:Record<string,string>={meta:JSON.stringify({ledger,receptionPaused:s.receptionPaused,concurrentLimit:s.concurrentLimit,acceptedAttempts:s.acceptedAttempts,loginAttempts:s.loginAttempts,judgmentLocks:s.judgmentLocks,garbage:s.garbage})};
  for(const [kind,items] of Object.entries({job:s.jobs,wallet:wallets,judgment:s.judgments,history:Object.fromEntries(history.map(h=>[h.id,h]))}))for(const [key,value] of Object.entries(items))rows[kind+':'+key]=JSON.stringify(value);
  return rows;
}
function decode(rows:Record<string,string>){
  const s=fresh();
  if(rows.meta){const meta=JSON.parse(rows.meta);Object.assign(s,meta);s.ledger={...meta.ledger,wallets:{},history:[]};}
  if(![3,4,5].includes(s.concurrentLimit))s.concurrentLimit=3;
  for(const [key,value] of Object.entries(rows)){const i=key.indexOf(':');if(i<0)continue;const kind=key.slice(0,i),id=key.slice(i+1),v=JSON.parse(value);if(kind==='job')s.jobs[id]=v;if(kind==='wallet')s.ledger.wallets[id]=v;if(kind==='judgment')s.judgments[id]=v;if(kind==='history')s.ledger.history.push(v);}
  s.ledger.history.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return s;
}
async function snapshot(){
  const {DB}=await bindings();
  await DB.prepare('INSERT OR IGNORE INTO state_revision (id,version,token) VALUES (1,0,?)').bind('').run();
  const result=await DB.batch([DB.prepare('SELECT version FROM state_revision WHERE id=1'),DB.prepare('SELECT key,value FROM state_records')]);
  const rows=Object.fromEntries((result[1].results as {key:string;value:string}[]).map(r=>[r.key,r.value]));
  return {DB,version:Number((result[0].results[0] as {version:number}).version),rows,state:decode(rows)};
}
export async function readState(){return (await snapshot()).state;}
/** Pure callback may run again after a conflict. External I/O must stay outside it. */
export async function mutate<T>(fn:(state:State)=>T):Promise<T>{
  for(let attempt=0;attempt<30;attempt++){
    const {DB,version,rows,state}=await snapshot();const value=fn(state),next=encode(state),token=crypto.randomUUID();
    const statements=[DB.prepare('UPDATE state_revision SET version=version+1,token=? WHERE id=1 AND version=?').bind(token,version)];
    for(const [key,json] of Object.entries(next))if(rows[key]!==json)statements.push(DB.prepare('INSERT INTO state_records (key,value) SELECT ?,? WHERE EXISTS (SELECT 1 FROM state_revision WHERE id=1 AND token=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,json,token));
    for(const key of Object.keys(rows))if(!(key in next))statements.push(DB.prepare('DELETE FROM state_records WHERE key=? AND EXISTS (SELECT 1 FROM state_revision WHERE id=1 AND token=?)').bind(key,token));
    const result=await DB.batch(statements);
    if(result[0].meta.changes===1)return value;
    await new Promise(r=>setTimeout(r,10+Math.random()*30));
  }
  throw new AppError('BUSY','処理が混み合っています。少し待ってお試しください。',429);
}
