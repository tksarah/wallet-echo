import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { summarize } from '../src/lib/wallet';
import { judgeProfile, judgmentCriteria, judgmentFacts, judgmentFingerprint, characterFromProfile, composePrompt, JUDGMENT_VERSION, type JudgmentProfile, type CachedJudgment } from '../src/lib/character';
import { JudgmentCache } from '../src/lib/judgment-cache';
import { transport } from '../src/lib/http';
import { styles } from '../src/lib/styles';
import { motifLabels, temperaments } from '../src/lib/character-art';
import type { Activity, GenerationInput } from '../src/lib/types';
const now=Date.parse('2026-09-22T12:00:00Z');
const input:GenerationInput={addressType:'evm',address:'0x'+'a'.repeat(40),style:'rpg-hero'};
const activities:Activity[]=Array.from({length:6},(_,i)=>({id:`tx-${i}`,timestamp:now-(i%3)*86400000,kind:i<4?'contract_call':'transfer',target:'0x'+String(i).repeat(40),success:i!==5}));
const features=()=>summarize(input,activities,true,now);
function response(request:any,selection:Record<string,string>={},confidence=0.9){
  return {model:'jev-test',answers:Object.fromEntries(Object.entries(request.questions).map(([name,q]:[string,any])=>{
    const keys=Object.keys(q.criteria),choice=selection[name]||keys[0];
    return [name,{type:'choice',choice,confidence,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}];
  }))};
}
function profile():JudgmentProfile{return {version:JUDGMENT_VERSION,model:'test',temperament:'curious',specialTrait:'pathfinder',corrections:[],answers:{temperament:{type:'choice',choice:'curious',confidence:1,probabilities:{curious:1}},specialTrait:{type:'choice',choice:'pathfinder',confidence:1,probabilities:{pathfinder:1}}}};}

test('distribution uses deduplicated successful operations and separately counts daily failures',()=>{
  const f=summarize(input,[...activities,activities[0]],true,now);
  assert.equal(f.observedTransactions,6);assert.equal(f.successfulTransactions,5);
  assert.deepEqual(f.operationDistribution,[{kind:'contract_call',count:4,share:.8},{kind:'transfer',count:1,share:.2}]);
  assert.equal(f.activeDaysObserved,3);assert.equal(f.observedSpanDays,3);
  assert.equal(f.dailyActivity!.reduce((n,d)=>n+d.count,0),6);assert.equal(f.dailyActivity!.reduce((n,d)=>n+d.successful,0),5);
  const empty=summarize(input,[],false,now);assert.deepEqual(empty.operationDistribution,[]);assert.deepEqual(empty.dailyActivity,[]);assert.equal(empty.observedSpanDays,0);
});
test('eligible motifs use only direct successful observable evidence',()=>{
  const evm=judgmentCriteria(features()).specialTrait;
  assert.ok(evm.pathfinder&&evm.signal_weaver&&evm.steady_hands);assert.equal(evm.vault_keeper,undefined);assert.equal(evm.community_sage,undefined);
  const substrate=summarize({...input,addressType:'substrate'},[
    {...activities[0],kind:'dapps_staking.stake'}, {...activities[1],kind:'referenda.vote'}, {...activities[2],kind:'utility.batch'},
  ],false,now);
  const allowed=judgmentCriteria(substrate).specialTrait;
  assert.ok(allowed.vault_keeper&&allowed.community_sage);assert.equal(allowed.signal_weaver,undefined);
  const failed=summarize({...input,addressType:'substrate'},activities.map(a=>({...a,kind:'staking.stake',success:false})),false,now);
  assert.deepEqual(Object.keys(judgmentCriteria(failed).specialTrait),['neutral_echo']);
  assert.equal(judgmentFacts(substrate).uniqueTargets,null);assert.equal(judgmentFacts(features()).stakingInteractions,null);
});
test('fingerprint ignores identifiers, world and fetchedAt, but preserves semantic changes',()=>{
  const f=features();const original=judgmentFingerprint(f);
  assert.equal(judgmentFingerprint({...f,address:'another',fetchedAt:'2099-01-01'}),original);
  assert.equal(judgmentFingerprint({...f,operationKinds:[...f.operationKinds].reverse(),dailyActivity:[...f.dailyActivity!].reverse()}),original);
  for(const patch of [{source:'Subscan via PubFi' as const},{activeDaysLast30d:0},{truncated:false},{unknownFeatures:[]},{successfulTransactions:1}])assert.notEqual(judgmentFingerprint({...f,...patch}),original);
  const payload=JSON.stringify(judgmentFacts(f));assert.ok(!payload.includes(input.address));assert.ok(!payload.includes('tx-'));assert.ok(!payload.includes('rpg-hero'));
});
test('Jev sends factual summaries only; validates confidence and records actual model',async()=>{
  process.env.TYPESAFE_API_KEY='test';const original=transport.fetch;
  try{
    transport.fetch=async(_url,init)=>{const req=JSON.parse(String(init?.body));assert.deepEqual(req.state,{wallet:judgmentFacts(features())});assert.ok(!JSON.stringify(req).includes(input.address));return Response.json(response(req,{temperament:'curious',specialTrait:'pathfinder'}));};
    const p=await judgeProfile(features());assert.equal(p.model,'jev-test');assert.equal(p.temperament,'curious');assert.equal(p.specialTrait,'pathfinder');
    const c=characterFromProfile(features(),'wallet-beast',p);assert.match(c.interpretation!.motif,/角/);assert.ok(c.interpretation!.evidence.some(e=>e.key==='operationKinds'));assert.ok(!JSON.stringify(c).includes('probabilities'));assert.ok(!JSON.stringify(c).includes('confidence'));assert.ok(!JSON.stringify(c).includes('jev-test'));
    transport.fetch=async(_url,init)=>Response.json(response(JSON.parse(String(init?.body)),{temperament:'curious',specialTrait:'pathfinder'},.49));
    const low=await judgeProfile(features());assert.equal(low.temperament,'neutral');assert.equal(low.specialTrait,'neutral_echo');assert.equal(low.corrections.length,2);assert.ok(characterFromProfile(features(),'rpg-hero',low).interpretation!.notice);
    transport.fetch=async(_url,init)=>Response.json(response(JSON.parse(String(init?.body)),{},1));
    for(const n of [0,1,2]){const p=await judgeProfile(summarize(input,activities.slice(0,n),false,now));assert.equal(p.temperament,'neutral');assert.equal(p.specialTrait,'first_echo');assert.deepEqual(p.corrections,['sparse-history']);}
  }finally{transport.fetch=original;}
});
test('invalid Jev options, missing distributions, invalid totals, and malformed responses are rejected',async()=>{
  process.env.TYPESAFE_API_KEY='test';const original=transport.fetch;
  const mutations=[
    (r:any)=>{delete r.answers.temperament.probabilities;},
    (r:any)=>{r.answers.temperament.choice='vault_keeper';},
    (r:any)=>{r.answers.temperament.choice='toString';},
    (r:any)=>{r.answers.temperament.confidence=1.1;},
    (r:any)=>{r.answers.temperament.probabilities.neutral=.5;},
    (r:any)=>{r.answers.specialTrait.choice='vault_keeper';},
    (r:any)=>{delete r.model;},
    (r:any)=>{r.answers.temperament.choice='curious';},
  ];
  try{for(const mutate of mutations){transport.fetch=async(_url,init)=>{const r=response(JSON.parse(String(init?.body)));mutate(r);return Response.json(r);};await assert.rejects(()=>judgeProfile(features()),/応答を確認/);}
    transport.fetch=async()=>Response.json({}, {status:503});await assert.rejects(()=>judgeProfile(features()),/外部サービス/);
  }finally{transport.fetch=original;}
});
test('every world supports every motif and temperament without leaking identifiers or conflicting frames',()=>{
  const prompts=new Set<string>();
  for(const style of styles)for(const temperament of Object.keys(temperaments))for(const specialTrait of Object.keys(motifLabels)){
    const p={...profile(),temperament,specialTrait} as JudgmentProfile;
    const c=characterFromProfile(features(),style.id,p),prompt=composePrompt(c);
    assert.ok(prompt.includes(style.prompt));assert.ok(c.interpretation!.pose&&c.interpretation!.motif);assert.ok(!prompt.includes(input.address));assert.ok(!prompt.includes('undefined'));
    if(style.id==='wallet-beast'){assert.match(prompt,/non-human/);assert.doesNotMatch(prompt,/held inside|cloak|human hands/);}
    if(style.id==='legendary-card'){assert.match(prompt,/border is required/);assert.doesNotMatch(prompt,/No card border/);}
    if(style.id==='collectible')assert.match(prompt,/pedestal/);
    prompts.add(prompt);
  }
  assert.equal(prompts.size,5*6*7);
});
test('cache deduplicates concurrent requests, survives reload, replaces latest, invalidates versions, and recovers failures',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'jev-cache-'));const file=path.join(dir,'judgments.json');let calls=0;
  await writeFile(file,'{}');
  const read=async(key:string)=>(JSON.parse(await readFile(file,'utf8')) as Record<string,CachedJudgment>)[key];
  const write=async(key:string,value:CachedJudgment)=>{const data=JSON.parse(await readFile(file,'utf8'));data[key]=value;await writeFile(file,JSON.stringify(data));};
  const evaluate=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return profile();};
  try{
    const cache=new JudgmentCache(read,write,evaluate);
    const [a,b]=await Promise.all([cache.get('wallet',features()),cache.get('wallet',features())]);assert.deepEqual(a,b);assert.equal(calls,1);
    const restarted=new JudgmentCache(read,write,evaluate);await restarted.get('wallet',features());assert.equal(calls,1);
    await restarted.get('wallet',{...features(),activeDaysLast30d:0});assert.equal(calls,2);assert.equal(Object.keys(JSON.parse(await readFile(file,'utf8'))).length,1);
    const cached=(await read('wallet'))!;cached.profile.version=0;await write('wallet',cached);await restarted.get('wallet',{...features(),activeDaysLast30d:0});assert.equal(calls,3);
    let failed=true;const recovering=new JudgmentCache(read,write,async()=>{if(failed){failed=false;throw new Error('transient');}return evaluate();});
    await assert.rejects(()=>recovering.get('new',features()),/transient/);await recovering.get('new',features());assert.equal(calls,4);
  }finally{await rm(dir,{recursive:true,force:true});}
});
