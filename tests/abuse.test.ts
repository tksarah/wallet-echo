import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,scryptSync} from 'node:crypto';
import {LocalDatabase,MemoryBucket} from '../src/lib/local-storage';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {useTestBindings,readState,mutate,type Bindings,type State} from '../src/lib/storage';
import {startJob,getJob,runJob,retryImage,readImage,acknowledgeImage,adminSetConcurrency,adminData} from '../src/lib/jobs';
import {browserCookie,sessionOwner,requestIdentity,clientIp,digest,japanDay,reserveAbuse,rateLimit,recordRejection,rejectionSummary} from '../src/lib/abuse';
import {AppError} from '../src/lib/errors';
import {issueSession} from '../src/lib/admin-auth';
import {POST as concurrencyAPI} from '../src/app/api/admin/concurrency/route';
import {POST as admissionAPI} from '../src/app/api/jobs/route';
import {transport} from '../src/lib/http';

const input=(n:number)=>({addressType:'evm' as const,address:'0x'+n.toString(16).padStart(40,'0'),style:'rpg-hero' as const});
const identity=(n:number)=>({owner:'owner-'+n,ip:'ip-'+n});
test('admission controls: atomic capacity, ownership, quotas, retention and API boundaries',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'wallet-echo-test-'));const localDB=new LocalDatabase(temp);
 const oldEnv={...process.env},oldFetch=transport.fetch;
 try{
 const DB=localDB,BUCKET=new MemoryBucket();

 useTestBindings({DB,BUCKET} as unknown as Bindings);
 process.env.ABUSE_SECRET='test-secret-never-for-production-123456789';process.env.ABUSE_IP_HEADER='x-forwarded-for';process.env.OPENAI_API_KEY='test';process.env.TYPESAFE_API_KEY='test';
 let paidCalls=0;transport.fetch=async()=>{paidCalls++;throw Error('Unexpected external request');};
 const initial=await readState();assert.equal(initial.concurrentLimit,3);
 const reset=()=>mutate(s=>Object.assign(s,structuredClone(initial)));
 for(const limit of [3,4,5]){
  await reset();await adminSetConcurrency(limit);
  const attempts=await Promise.allSettled(Array.from({length:limit+3},(_,i)=>startJob(input(i+1),randomUUID(),identity(i))));
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,limit);
  for(const r of attempts)if(r.status==='rejected')assert.equal(r.reason.code,'BUSY');
  const state=await readState();assert.equal(state.concurrentLimit,limit);assert.equal(state.acceptedAttempts.length,limit);assert.equal((await adminData()).totals.attempts,limit);
 }
 await adminSetConcurrency(3);let s=await readState();assert.equal(Object.values(s.jobs).filter(j=>j.status==='analyzing').length,5);
 await assert.rejects(startJob(input(99),randomUUID(),identity(99)),{code:'BUSY'});
 await mutate(s=>{Object.values(s.jobs).slice(0,2).forEach(j=>{j.status='failed';});});
 await assert.rejects(startJob(input(99),randomUUID(),identity(99)),{code:'BUSY'});
 await mutate(s=>{Object.values(s.jobs).find(j=>j.status==='analyzing')!.status='failed';});
 await startJob(input(99),randomUUID(),identity(99));
 await adminSetConcurrency(4);await startJob(input(98),randomUUID(),identity(98));
 for(const value of [2,6,3.1,'3',null,{},NaN])await assert.rejects(adminSetConcurrency(value),{code:'INVALID_INPUT'});
 assert.equal((await readState()).concurrentLimit,4);
 // Legacy metadata has no setting; history and wallet records survive migration.
 const meta=(await DB.prepare('SELECT value FROM state_records WHERE key=?').bind('meta').first<{value:string}>())!;
 const legacy=JSON.parse(meta.value);delete legacy.concurrentLimit;delete legacy.acceptedAttempts;
 await DB.prepare('UPDATE state_records SET value=? WHERE key=?').bind(JSON.stringify(legacy),'meta').run();
 assert.equal((await readState()).concurrentLimit,3);assert.ok(Object.keys((await readState()).ledger.wallets).length);
 await reset();
 // Global and shared-IP limits must hold at their boundaries under contention.
 await mutate(s=>{s.acceptedAttempts=Array.from({length:99},(_,i)=>({...identity(1000+i),at:Date.now()}));});
 const lastGlobal=await Promise.allSettled(Array.from({length:6},(_,i)=>startJob(input(100+i),randomUUID(),identity(i))));
 assert.equal(lastGlobal.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readState()).acceptedAttempts.length,100);
 await reset();await mutate(s=>{s.acceptedAttempts=Array.from({length:9},(_,i)=>({owner:'previous-'+i,ip:'shared',at:Date.now()}));});
 const lastIp=await Promise.allSettled(Array.from({length:6},(_,i)=>startJob(input(100+i),randomUUID(),{owner:'next-'+i,ip:'shared'})));
 assert.equal(lastIp.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readState()).acceptedAttempts.length,10);
 await reset();
 const key=randomUUID(),who=identity(1);
 const duplicates=await Promise.all(Array.from({length:6},()=>startJob(input(1),key,who)));
 assert.equal(new Set(duplicates.map(j=>j.id)).size,1);assert.equal((await readState()).acceptedAttempts.length,1);
 const id=duplicates[0].id;
 for(const work of [()=>getJob(id,'wrong'),()=>runJob(id,'wrong'),()=>readImage(id,'wrong'),()=>acknowledgeImage(id,randomUUID(),'wrong'),()=>retryImage(id,randomUUID(),identity(2))])await assert.rejects(work(),{code:'NOT_FOUND'});
 assert.equal(paidCalls,0);
 await mutate(s=>{s.jobs[id].status='failed';s.jobs[id].character={} as never;});
 const retryKey=randomUUID();await Promise.all(Array.from({length:5},()=>retryImage(id,retryKey,who)));
 assert.equal((await readState()).acceptedAttempts.length,2);assert.equal((await readState()).ledger.wallets['evm:'+input(1).address].used,2);
 await mutate(s=>{s.jobs[id].status='failed';});await startJob(input(2),randomUUID(),who);
 const before=await readState();await assert.rejects(startJob(input(3),randomUUID(),who),{code:'BROWSER_LIMIT'});
 assert.deepEqual((await readState()).acceptedAttempts,before.acceptedAttempts);
 // Failed persistence must leave the applied setting and allowances unchanged.
 let batches=0;const failingDB={prepare:DB.prepare.bind(DB),batch:async(statements:unknown[])=>{if(++batches===2)throw Error('write failed');return DB.batch(statements as never);}};
 useTestBindings({DB:failingDB,BUCKET} as unknown as Bindings);
 await assert.rejects(adminSetConcurrency(5));
 useTestBindings({DB,BUCKET} as unknown as Bindings);assert.equal((await readState()).concurrentLimit,3);
 // Signed session integrity and normalized IP identity; forwarding headers are ignored.
 const raw=new Request('https://example.com/api/status',{headers:{'x-forwarded-for':'203.0.113.99, 2001:db8:0:0::1'}});
 const cookie=browserCookie(raw)!.split(';')[0];const request=new Request(raw,{headers:{...Object.fromEntries(raw.headers),cookie}});
 assert.equal(clientIp(request),'2001:db8::1');assert.equal(requestIdentity(request).ip,digest('ip','2001:db8::1'));assert.equal(browserCookie(request),undefined);
 assert.throws(()=>sessionOwner(new Request(raw,{headers:{cookie:cookie+'bad'}})),{code:'BROWSER_SESSION'});
 assert.throws(()=>clientIp(new Request(raw,{headers:{'cf-connecting-ip':'203.0.113.1'}})),{code:'SECURITY_UNAVAILABLE'});
 // A shared minute bucket accepts exactly 30, even across concurrent requests.
 const requests=await Promise.allSettled(Array.from({length:35},()=>rateLimit(request)));
 assert.equal(requests.filter(r=>r.status==='fulfilled').length,30);
 assert.ok(requests.filter(r=>r.status==='rejected').every(r=>r.reason.code==='REQUEST_LIMIT'));
 // Invalid submissions are rejected before the external API and consume the minute bucket.
 const malformed=new Request('https://example.com/api/jobs',{method:'POST',headers:{host:'example.com',origin:'https://example.com','x-forwarded-for':'192.0.2.4',cookie,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:'{'});
 for(let i=0;i<30;i++)assert.equal((await admissionAPI(malformed.clone() as Request)).status,400);
 assert.equal((await admissionAPI(malformed.clone() as Request)).status,429);assert.equal(paidCalls,0);
 // Admin authentication, same-origin checks and strict integer validation.
 const salt='a'.repeat(32);process.env.ADMIN_PASSWORD_HASH=salt+':'+scryptSync('test-password',salt,64).toString('hex');
 const adminCookie='wallet_echo_admin='+issueSession();
 const adminRequest=(value:unknown,cookie=adminCookie,origin='https://example.com')=>new Request('https://example.com/api/admin/concurrency',{method:'POST',headers:{cookie,origin,host:'example.com','Content-Type':'application/json'},body:JSON.stringify({concurrentLimit:value})});
 assert.equal((await concurrencyAPI(adminRequest(4,''))).status,401);assert.equal((await concurrencyAPI(adminRequest(4,adminCookie,'https://evil.example'))).status,403);
 assert.equal((await concurrencyAPI(adminRequest('4'))).status,400);assert.equal((await concurrencyAPI(adminRequest(4))).status,200);assert.equal((await adminData()).concurrentLimit,4);
 assert.ok((await readState()).ledger.logs.some(l=>l.event==='同時生成数を変更: 3 → 4'));
 // Retention prunes expired keys and aggregates without storing raw IP addresses.
 await DB.prepare('INSERT INTO abuse_rates VALUES (?,?,0,?)').bind('expired','[]',0).run();
 await DB.prepare('INSERT INTO abuse_rejections VALUES (?,?,1,?)').bind('2000-01-01','BUSY',0).run();
 await recordRejection(new AppError('BUSY','busy',429));const summary=await rejectionSummary();assert.ok(summary.some(r=>r.reason==='BUSY'));assert.ok(!summary.some(r=>r.day==='2000-01-01'));
 assert.equal(await DB.prepare('SELECT key FROM abuse_rates WHERE key=?').bind('expired').first(),null);
 const rows=JSON.stringify((await DB.prepare('SELECT * FROM abuse_rates').all()).results);assert.doesNotMatch(rows,/2001:db8|192\.0\.2/);
 }finally{transport.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);localDB.close();await rm(temp,{recursive:true,force:true});}
});

test('quota windows: rolling hour, Japan midnight, global maximum, and 48-hour retention',()=>{
 const blank=()=>({acceptedAttempts:[]} as unknown as State);
 const at=Date.parse('2026-09-22T01:00:00Z');let s=blank();
 for(let i=0;i<10;i++)reserveAbuse(s,{owner:String(i),ip:'shared'},at);
 assert.throws(()=>reserveAbuse(s,{owner:'next',ip:'shared'},at),{code:'IP_HOURLY_LIMIT'});
 for(let i=10;i<20;i++)reserveAbuse(s,{owner:String(i),ip:'shared'},at+3600000);
 assert.throws(()=>reserveAbuse(s,{owner:'next',ip:'shared'},at+7200000),{code:'IP_DAILY_LIMIT'});
 s=blank();for(let i=0;i<100;i++)reserveAbuse(s,identity(i),at);
 assert.throws(()=>reserveAbuse(s,identity(101),at),{code:'DAILY_LIMIT'});assert.equal(s.acceptedAttempts.length,100);
 const midnight=Date.parse('2026-09-22T15:00:00Z');assert.equal(japanDay(midnight-1),'2026-09-22');assert.equal(japanDay(midnight),'2026-09-23');
 reserveAbuse(s,identity(101),midnight);assert.equal(s.acceptedAttempts.length,101);
 s=blank();for(let i=0;i<3;i++)reserveAbuse(s,identity(1),midnight-1);reserveAbuse(s,identity(1),midnight);assert.equal(s.acceptedAttempts.length,4);
 reserveAbuse(s,identity(2),midnight+48*3600000);assert.equal(s.acceptedAttempts.length,1);
});
