import { adminLists, type AdminQueries } from './admin-lists';
import { meter } from './meter';
import { reserveWallet, addHistory, recordMeter, updateHistory, resetWallet, log, walletKey } from './ledger';
import { config } from './config';
import { AppError, publicError } from './errors';
import { analyzeWallet } from './wallet';
import { characterFromProfile, composePrompt, judgeProfile, judgmentFingerprint, JUDGMENT_VERSION } from './character';
import { generateImage } from './image';
import type { GenerationInput, Job, WalletFeatures } from './types';
import { bindings, mutate, readState, type State, type StoredJob, type Admission } from './storage';
import {abuseConfigured,assertJobOwner,reserveAbuse,todayAccepted,rejectionSummary,LIMITS,japanDay} from './abuse';
import { execution } from './execution';

const active=(j:Job)=>['analyzing','judging','generating'].includes(j.status);
const now=()=>Date.now();
function unavailable(){return new AppError('IMAGE_UNAVAILABLE','画像は受領済み、または受取期限が終了しています。',410);}
function find(s:State,id:string){const j=s.jobs[id];if(!j||Date.parse(j.expiresAt)<=now())throw new AppError('NOT_FOUND','この結果は見つからないか、保存期間が終了しています。',404);return j;}
function fail(s:State,j:StoredJob,code:string,message:string){if(!active(j))return;const previous=j.status;j.status='failed';j.error={code,message,retryImage:!!j.character};delete j.runToken;updateHistory(s.ledger,j,previous);}
function clean(s:State){
  s.acceptedAttempts=s.acceptedAttempts.filter(a=>a.at>now()-48*3600000);
  for(const [id,j] of Object.entries(s.jobs)){
    if(active(j)&&(j.leaseUntil<=now()||(j.runDeadline!==undefined&&j.runDeadline<=now())))fail(s,j,'INTERRUPTED','生成が中断されたか、待機時間を超えました。自動で再生成していません。');
    if(j.imageDelivery==='pending'&&Date.parse(j.imageExpiresAt||'')<=now()){j.imageDelivery='expired';delete j.imageUrl;if(j.objectKey)s.garbage[j.objectKey]=now();}
    if(Date.parse(j.expiresAt)<=now()&&!active(j)){if(j.objectKey)s.garbage[j.objectKey]=now();delete s.jobs[id];}
  }
  for(const [key,lock] of Object.entries(s.judgmentLocks))if(lock.until<=now())delete s.judgmentLocks[key];
}
async function cleanup(){
  const pending=await mutate(s=>{clean(s);return Object.entries(s.garbage).filter(([,at])=>at<=now()).slice(0,20).map(([key])=>key);});
  if(!pending.length)return;
  const {BUCKET}=await bindings();
  for(const key of pending){try{await BUCKET.delete(key);await mutate(s=>{delete s.garbage[key];});}catch{console.error('Wallet Echo: temporary image cleanup will retry');}}
}
function publicJob(s:State,j:StoredJob):Job{const {owner,retryKeys,requestKey,requestedInput,runToken,leaseUntil,runDeadline,imageOnly,objectKey,receipt,imagePrompt,...safe}=j;return {...structuredClone(safe),walletRemaining:Math.max(0,3-(s.ledger.wallets[walletKey(j.input)]?.used||0))};}
export async function getJob(id:string,owner:string){await cleanup();const s=await readState(),j=find(s,id);assertJobOwner(j,owner);return publicJob(s,j);}
export async function status(){await cleanup();const s=await readState(),c=config();return {ready:!!(c.openaiKey&&c.typesafeKey)&&abuseConfigured(),substrateReady:!!c.pubfiKey,receptionPaused:s.receptionPaused,dailyLimitReached:todayAccepted(s)>=LIMITS.globalDay};}
function reception(s:State){if(s.receptionPaused)throw new AppError('RECEPTION_PAUSED','ただいま生成の受付を一時停止しています。再開までお待ちください。',503);}
function capacity(s:State){if(Object.values(s.jobs).filter(active).length>=s.concurrentLimit)throw new AppError('BUSY','ほかのキャラクターを生成中です。少し待ってからお試しください。',429);}
export async function startJob(input:GenerationInput,requestKey:string,identity:Admission){await cleanup();return mutate(s=>{
  const existing=Object.values(s.jobs).find(j=>j.requestKey===requestKey&&j.owner===identity.owner);
  if(existing){if(JSON.stringify(existing.requestedInput||existing.input)!==JSON.stringify(input))throw new AppError('KEY_CONFLICT','同じ送信IDで異なる入力を送信できません。',409);return publicJob(s,existing);}
  reception(s);const c=config();if(!c.openaiKey||!c.typesafeKey||(input.addressType==='substrate'&&!c.pubfiKey))throw new AppError('NOT_CONFIGURED','生成に必要なAPI設定がまだ完了していません。',503);
  capacity(s);const id=crypto.randomUUID(),date=new Date().toISOString();
  const j:StoredJob={id,requestKey,owner:identity.owner,retryKeys:[],input,requestedInput:input,status:'analyzing',createdAt:date,attemptStartedAt:date,expiresAt:new Date(now()+86400000).toISOString(),leaseUntil:now()+90000};
  reserveAbuse(s,identity);reserveWallet(s.ledger,input);addHistory(s.ledger,j);log(s.ledger,'生成受付',input.address,id);s.jobs[id]=j;return publicJob(s,j);
});}
export async function retryImage(id:string,requestKey:string,identity:Admission){await cleanup();return mutate(s=>{
  const j=find(s,id);assertJobOwner(j,identity.owner);
  if(j.retryKeys?.includes(requestKey))return publicJob(s,j);
  reception(s);
  if(j.status!=='failed'||!j.character||!j.input.style)throw new AppError('NOT_RETRYABLE','この処理は画像のみの再試行ができません。',409);
  capacity(s);reserveAbuse(s,identity);reserveWallet(s.ledger,j.input);const h=s.ledger.history.find(h=>h.id===id);if(h)h.attempts++;
  (j.retryKeys??=[]).push(requestKey);
  j.status='generating';j.imageOnly=true;j.attemptStartedAt=new Date().toISOString();j.error=undefined;j.leaseUntil=now()+90000;delete j.runToken;delete j.runDeadline;log(s.ledger,'画像再試行受付',j.input.address,id);return publicJob(s,j);
});}
function owned(s:State,id:string,token:string){const j=find(s,id);if(!active(j)||j.runToken!==token||j.leaseUntil<=now()||j.runDeadline!<=now())throw new AppError('INTERRUPTED','生成処理が中断されました。',409);return j;}
async function update(id:string,token:string,patch:Partial<StoredJob>){return mutate(s=>{const j=owned(s,id,token),previous=j.status;Object.assign(j,patch);updateHistory(s.ledger,j,previous);return publicJob(s,j);});}
async function profile(id:string,token:string,features:WalletFeatures,signal:AbortSignal){
  const key=walletKey(features),fingerprint=judgmentFingerprint(features);
  for(;;){signal.throwIfAborted();const decision=await mutate(s=>{
    owned(s,id,token);const cached=s.judgments[key];if(cached?.fingerprint===fingerprint&&cached.profile.version===JUDGMENT_VERSION)return {cached:cached.profile,claimed:false};
    const lock=s.judgmentLocks[key];if(lock&&lock.until>now()&&lock.token!==token)return {claimed:false};
    s.judgmentLocks[key]={token,until:now()+90000};return {claimed:true};
  });if(decision.cached)return decision.cached;if(!decision.claimed){await new Promise(r=>setTimeout(r,500));continue;}
  try{const result=await judgeProfile(features);signal.throwIfAborted();await mutate(s=>{owned(s,id,token);if(s.judgmentLocks[key]?.token!==token)throw new AppError('INTERRUPTED','判定が中断されました。',409);s.judgments[key]={fingerprint,profile:result};delete s.judgmentLocks[key];});return result;}
  finally{await mutate(s=>{if(s.judgmentLocks[key]?.token===token)delete s.judgmentLocks[key];});}}
}
export async function runJob(id:string,owner:string,requestSignal?:AbortSignal):Promise<Response>{
  await cleanup();const token=crypto.randomUUID();
  const initial=await mutate(s=>{const j=find(s,id);assertJobOwner(j,owner);if(!active(j))return null;if(j.runToken)throw new AppError('ALREADY_RUNNING','この生成はすでに実行中です。',409);j.runToken=token;j.leaseUntil=now()+90000;j.runDeadline=now()+600000;return {...structuredClone(j),walletRemaining:Math.max(0,3-(s.ledger.wallets[walletKey(j.input)]?.used||0))};});
  if(!initial)return Response.json(await getJob(id,owner));
  const abort=new AbortController();const onAbort=()=>abort.abort();requestSignal?.addEventListener('abort',onAbort,{once:true});if(requestSignal?.aborted)abort.abort();
  const encoder=new TextEncoder();let closed=false;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      const send=(event:unknown)=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}catch{closed=true;abort.abort();}};
      const {owner:privateOwner,retryKeys,requestKey,requestedInput,runToken,leaseUntil,runDeadline,imageOnly,objectKey,receipt,imagePrompt,...firstPublic}=initial;send({job:firstPublic});
      const timer=setInterval(()=>{send({heartbeat:true});},10000);
      let heartbeatBusy=false;
      const lease=setInterval(()=>{if(heartbeatBusy)return;heartbeatBusy=true;void mutate(s=>{const j=owned(s,id,token);j.leaseUntil=now()+90000;for(const lock of Object.values(s.judgmentLocks))if(lock.token===token)lock.until=now()+90000;}).catch(()=>abort.abort()).finally(()=>{heartbeatBusy=false;});},15000);
      const deadline=setTimeout(()=>abort.abort(),600000);
      const task=execution.run(abort.signal,()=>meter.run(async event=>{await mutate(s=>{recordMeter(s.ledger,id,event);});},async()=>{
        try{
          abort.signal.throwIfAborted();let j:StoredJob=initial;
          if(!j.imageOnly){const features=await analyzeWallet(j.input as GenerationInput);abort.signal.throwIfAborted();send({job:await update(id,token,{features,status:'judging'})});const p=await profile(id,token,features,abort.signal);const character=characterFromProfile(features,j.input.style!,p);send({job:await update(id,token,{character,imagePrompt:composePrompt(character),status:'generating'})});}
          j=(await readState()).jobs[id];abort.signal.throwIfAborted();
          const image=await generateImage(j.imagePrompt||composePrompt(j.character!),j.character?.style??j.input.style);abort.signal.throwIfAborted();
          const key='images/'+id+'/'+token,expires=now()+600000,receipt=crypto.randomUUID();
          // Record an orphan-cleanup deadline before storing any bytes.
          await mutate(s=>{owned(s,id,token);s.garbage[key]=expires;});
          const {BUCKET}=await bindings();await BUCKET.put(key,new Uint8Array(image),{httpMetadata:{contentType:'image/png'}});abort.signal.throwIfAborted();
          send({job:await update(id,token,{status:'complete',imageUrl:`/api/jobs/${id}/image`,imageDelivery:'pending',imageExpiresAt:new Date(expires).toISOString(),objectKey:key,receipt,error:undefined})});
        }catch(error){const e=abort.signal.aborted?{code:'INTERRUPTED',message:'接続が切れたか、生成の待機時間を超えました。自動で再生成していません。'}:publicError(error);await mutate(s=>{const j=s.jobs[id];if(j?.runToken===token)fail(s,j,e.code,e.message);});send({job:await getJob(id,owner)});}
      }));
      void task.catch(()=>send({error:'状態の保存に失敗しました。状況の確認を再開してください。'})).finally(()=>{clearInterval(timer);clearInterval(lease);clearTimeout(deadline);requestSignal?.removeEventListener('abort',onAbort);if(!closed){closed=true;controller.close();}});
    },cancel(){closed=true;abort.abort();}
  });
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function readImage(id:string,owner:string){await cleanup();const s=await readState(),j=find(s,id);assertJobOwner(j,owner);if(j.imageDelivery!=='pending'||!j.objectKey||Date.parse(j.imageExpiresAt||'')<=now())throw unavailable();const {BUCKET}=await bindings(),object=await BUCKET.get(j.objectKey);if(!object)throw unavailable();return {bytes:object.body,receipt:j.receipt!};}
export async function acknowledgeImage(id:string,receipt:string,owner:string){await mutate(s=>{const j=find(s,id);assertJobOwner(j,owner);if(j.imageDelivery==='received')return;if(j.receipt!==receipt)throw new AppError('INVALID_RECEIPT','画像の受領確認が一致しません。',409);if(j.objectKey)s.garbage[j.objectKey]=now();j.imageDelivery='received';delete j.imageUrl;});await cleanup();}
export async function adminData(search='',page=1,queries?:AdminQueries){await cleanup();const s=await readState(),l=s.ledger;return {receptionPaused:s.receptionPaused,concurrentLimit:s.concurrentLimit,abuse:{ready:abuseConfigured(),day:japanDay(),accepted:todayAccepted(s),limits:LIMITS,rejections:await rejectionSummary(),stopReason:s.receptionPaused?'RECEPTION_PAUSED':!abuseConfigured()?'SECURITY_UNAVAILABLE':todayAccepted(s)>=LIMITS.globalDay?'DAILY_LIMIT':null},since:l.since,totals:{attempts:l.attempts,completed:l.completed,failed:l.failed,wallets:Object.keys(l.wallets).length,active:Object.values(s.jobs).filter(active).length,calls:l.calls,cost:l.cost,measuredImages:l.measuredImages,estimatedImages:l.estimatedImages,legacyJobs:l.legacyJobs},...adminLists(l,search,page,queries)};}
export async function adminReset(key:string){await cleanup();await mutate(s=>{if(Object.values(s.jobs).some(j=>walletKey(j.input)===key&&active(j)))throw new AppError('BUSY','生成中はリセットできません。',409);resetWallet(s.ledger,key);});}
export async function adminSetReception(paused:boolean){return mutate(s=>{if(s.receptionPaused!==paused){s.receptionPaused=paused;log(s.ledger,paused?'生成受付を一時停止':'生成受付を再開');}return {receptionPaused:paused};});}
export async function adminSetConcurrency(value:unknown){
  if(typeof value!=='number'||!Number.isInteger(value)||![3,4,5].includes(value))throw new AppError('INVALID_INPUT','同時生成数は3・4・5から選んでください。');
  return mutate(s=>{const before=s.concurrentLimit;if(before!==value){s.concurrentLimit=value;log(s.ledger,`同時生成数を変更: ${before} → ${value}`);}return {concurrentLimit:s.concurrentLimit};});
}
