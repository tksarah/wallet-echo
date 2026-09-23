import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalDatabase,MemoryBucket} from '../src/lib/local-storage';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,scryptSync} from 'node:crypto';
import {useTestBindings,readState,mutate,type Bindings} from '../src/lib/storage';
import {transport} from '../src/lib/http';
import * as jobs from '../src/lib/jobs';
const {adminData,adminReset,adminSetReception}=jobs;
const owners=new Map<string,{owner:string;ip:string}>();
async function startJob(input:Parameters<typeof jobs.startJob>[0],key:string){const identity={owner:key,ip:key};const j=await jobs.startJob(input,key,identity);owners.set(j.id,identity);return j;}
const getJob=(id:string)=>jobs.getJob(id,owners.get(id)!.owner);
const runJob=(id:string,signal?:AbortSignal)=>jobs.runJob(id,owners.get(id)!.owner,signal);
const retryImage=(id:string)=>jobs.retryImage(id,randomUUID(),owners.get(id)!);
const readImage=(id:string)=>jobs.readImage(id,owners.get(id)!.owner);
const acknowledgeImage=(id:string,receipt:string)=>jobs.acknowledgeImage(id,receipt,owners.get(id)!.owner);
import {verifyPassword,issueSession,requireAdmin,adminOrigin} from '../src/lib/admin-auth';
const input={addressType:'evm' as const,address:'0x'+'1'.repeat(40),style:'rpg-hero' as const};
test('Sites: atomic quotas, deduplication, interrupted streams, durable images, admin controls and metering',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'wallet-echo-test-'));const localDB=new LocalDatabase(temp);
 try{
 const DB=localDB,BUCKET=new MemoryBucket();

 useTestBindings({DB,BUCKET} as unknown as Bindings);
 process.env.OPENAI_API_KEY='test';process.env.TYPESAFE_API_KEY='test';
 let calls=0,judgments=0,failImage=false;const imageRequests:Record<string,unknown>[]=[];
 transport.fetch=async(url,init)=>{
   init?.signal?.throwIfAborted();
   if(String(url).includes('blockscout'))return Response.json({items:[],next_page_params:null});
   if(String(url).includes('typesafe')){judgments++;const req=JSON.parse(init!.body as string);return Response.json({model:'jev-test',answers:Object.fromEntries(Object.entries(req.questions).map(([k,q])=>{const keys=Object.keys((q as {criteria:object}).criteria);return [k,{type:'choice',choice:keys[0],confidence:1,probabilities:Object.fromEntries(keys.map((key,i)=>[key,i===0?1:0]))}];}))});}
   calls++;imageRequests.push(JSON.parse(String(init?.body)));await new Promise(r=>setTimeout(r,20));init?.signal?.throwIfAborted();if(failImage)return Response.json({error:'test'},{status:500});
   return Response.json({data:[{b64_json:Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(100)]).toString('base64')}]});
 };
 const key=randomUUID();const pair=await Promise.all([startJob(input,key),startJob(input,key)]);assert.equal(pair[0].id,pair[1].id);assert.equal((await adminData()).totals.attempts,1);
 await assert.rejects(()=>startJob({...input,style:'wallet-beast'},key),{code:'KEY_CONFLICT'});
 const second=await startJob({...input,address:'0x'+'2'.repeat(40),style:'legendary-card'},randomUUID());
 const third=await startJob({...input,address:'0x'+'9'.repeat(40)},randomUUID());
 await assert.rejects(()=>startJob(input,randomUUID()),{code:'BUSY'});
 await mutate(s=>{s.jobs[third.id].leaseUntil=0;});
 const response=await runJob(pair[0].id);await assert.rejects(()=>runJob(pair[0].id),{code:'ALREADY_RUNNING'});await response.text();await (await runJob(second.id)).text();
 assert.equal(imageRequests[0].background,undefined);assert.equal(imageRequests[1].background,'transparent');
 assert.equal((await getJob(pair[0].id)).status,'complete');assert.equal(calls,2);
 const packet=await readImage(pair[0].id);assert.ok((await new Response(packet.bytes).arrayBuffer()).byteLength>0);
 await assert.rejects(()=>acknowledgeImage(pair[0].id,randomUUID()),{code:'INVALID_RECEIPT'});
 await acknowledgeImage(pair[0].id,packet.receipt);await acknowledgeImage(pair[0].id,packet.receipt);await assert.rejects(()=>readImage(pair[0].id),{code:'IMAGE_UNAVAILABLE'});
 assert.equal((await BUCKET.list()).objects.length,1);
 await adminSetReception(true);const before=await adminData();await assert.rejects(()=>startJob(input,randomUUID()),{code:'RECEPTION_PAUSED'});assert.equal((await adminData()).totals.attempts,before.totals.attempts);await adminSetReception(false);
 failImage=true;const failed=await startJob(input,randomUUID());await (await runJob(failed.id)).text();assert.equal((await getJob(failed.id)).error?.retryImage,true);const judged=judgments;
 failImage=false;await retryImage(failed.id);await (await runJob(failed.id)).text();assert.equal(judgments,judged);assert.equal((await getJob(failed.id)).status,'complete');
 await assert.rejects(()=>startJob(input,randomUUID()),{code:'WALLET_LIMIT'});
 await adminReset('evm:'+input.address);assert.equal((await readState()).ledger.wallets['evm:'+input.address].used,0);
 const interrupted=await startJob(input,randomUUID());const ctrl=new AbortController();ctrl.abort();await (await runJob(interrupted.id,ctrl.signal)).text();assert.equal((await getJob(interrupted.id)).status,'failed');const oldCalls=calls;await (await runJob(interrupted.id)).text();assert.equal(calls,oldCalls);
 const mid=await startJob({...input,address:'0x'+'3'.repeat(40)},randomUUID());const midCtrl=new AbortController();const midResponse=await runJob(mid.id,midCtrl.signal);const midRead=midResponse.text();midCtrl.abort();await midRead;assert.equal((await getJob(mid.id)).status,'failed');
 const stale=await startJob(input,randomUUID());await mutate(s=>{s.jobs[stale.id].leaseUntil=0;});assert.equal((await getJob(stale.id)).status,'failed');await (await runJob(stale.id)).text();assert.equal(calls,oldCalls);
 await mutate(s=>{s.jobs[second.id].imageExpiresAt=new Date(0).toISOString();});await assert.rejects(()=>readImage(second.id),{code:'IMAGE_UNAVAILABLE'});
 const adminHash='a'.repeat(32)+':'+scryptSync('correct-password','a'.repeat(32),64).toString('hex');process.env.ADMIN_PASSWORD_HASH=adminHash;
 for(let i=0;i<10;i++)await assert.rejects(()=>verifyPassword('wrong'),{code:'UNAUTHORIZED'});await assert.rejects(()=>verifyPassword('correct-password'),{code:'LOGIN_LIMIT'});
 await mutate(s=>{s.loginAttempts=[];});await verifyPassword('correct-password');requireAdmin(new Request('https://example.com/api/admin/data',{headers:{cookie:'wallet_echo_admin='+issueSession()}}));
 assert.throws(()=>adminOrigin(new Request('https://example.com/api/admin/reset',{headers:{origin:'https://evil.example',host:'example.com'}})),{code:'FORBIDDEN'});
 const report=await adminData();assert.equal(report.totals.calls.image,calls);assert.ok(report.totals.cost.image>0);assert.equal(report.totals.active,0);
 const publicly=JSON.stringify(await getJob(failed.id));assert.doesNotMatch(publicly,/runToken|requestKey|imagePrompt|objectKey|receipt|leaseUntil|probabilities/);
 // Storage failure leaves a receipt-marked image inaccessible, and the next request retries deletion.
 const store=await readState(),objectKey=store.jobs[failed.id].objectKey!;const receipt=store.jobs[failed.id].receipt!;
 useTestBindings({DB,BUCKET:{delete:async()=>{throw Error('storage unavailable')},get:BUCKET.get.bind(BUCKET)}} as unknown as Bindings);
 await acknowledgeImage(failed.id,receipt);assert.ok((await readState()).garbage[objectKey]!==undefined);await assert.rejects(()=>readImage(failed.id),{code:'IMAGE_UNAVAILABLE'});
 useTestBindings({DB,BUCKET} as unknown as Bindings);await getJob(failed.id);assert.equal(await BUCKET.get(objectKey),null);
 }finally{localDB.close();await rm(temp,{recursive:true,force:true});}
});
