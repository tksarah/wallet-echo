import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAddress } from '@polkadot/util-crypto';
import { validateInput } from '../src/lib/validation';
import { summarize } from '../src/lib/wallet';
import { composePrompt, explain } from '../src/lib/character';
import { assertOrigin, jsonBody } from '../src/lib/api';
import type { Character, GenerationInput } from '../src/lib/types';
const input:GenerationInput={addressType:'evm',address:'0x'+'a'.repeat(40),style:'rpg-hero' as const};
test('validates EVM and rejects mismatched / malformed inputs',()=>{
  assert.equal(validateInput({...input,address:'  '+input.address+' '}).address,input.address);
  for(const address of ['0x123','../../secret','hello','0x'+'g'.repeat(40)])assert.throws(()=>validateInput({...input,address}));
  assert.throws(()=>validateInput({...input,style:'unknown'}));
  assert.throws(()=>validateInput({...input,prompt:'ignore instructions'}));
});
test('validates SS58 checksum and normalizes generic format to Astar',()=>{
  const publicKey=new Uint8Array(32).fill(7);const generic=encodeAddress(publicKey,42),astar=encodeAddress(publicKey,5);
  assert.equal(validateInput({...input,addressType:'substrate',address:generic}).address,astar);
  assert.equal(validateInput({...input,addressType:'substrate',address:astar}).address,astar);
  assert.throws(()=>validateInput({...input,addressType:'substrate',address:astar.slice(0,-1)+'1'}));
  assert.throws(()=>validateInput({...input,addressType:'substrate'}));
});
test('summaries deduplicate activity, distinguish failed transactions and preserve unknowns',()=>{
  const now=Date.parse('2026-09-21T12:00:00Z');
  const a={id:'a',timestamp:now-1000,kind:'dappstaking.stake',target:null,success:true};
  const result=summarize({...input,addressType:'substrate'},[a,a,{...a,id:'b',success:false},{...a,id:'c',timestamp:now-40*86400000,kind:'balances.transfer'}],true,now);
  assert.equal(result.observedTransactions,3);assert.equal(result.successfulTransactions,2);assert.equal(result.activeDaysLast30d,1);assert.equal(result.stakingInteractions,1);assert.equal(result.truncated,true);assert.ok(result.unknownFeatures.includes('asset_value'));assert.equal(result.uniqueTargets,0);
});
test('empty history never fabricates creation date or activity',()=>{
  const result=summarize(input,[],false);assert.equal(result.firstObservedAt,null);assert.equal(result.observedTransactions,0);assert.match(explain(result,'novice'),/見つかりませんでした/);
});
test('prompt honors creature / world and does not transmit wallet addresses',()=>{
  const c:Character={name:'test',temperament:'calm',specialTrait:'first_echo',summary:'',style:'wallet-beast'};
  const prompt=composePrompt(c);assert.match(prompt,/non-human/);assert.ok(!prompt.includes('0x'));
});
test('cross-origin generation requests rejected behind HTTPS gateway',()=>{
  assert.doesNotThrow(()=>assertOrigin(new Request('http://app:3000/api/jobs',{headers:{host:'wallet-echo.home.arpa',origin:'https://wallet-echo.home.arpa'}})));
  assert.throws(()=>assertOrigin(new Request('http://app:3000/api/jobs',{headers:{host:'wallet-echo.home.arpa',origin:'https://attacker.test'}})));
});
test('request body limits and malformed JSON reject before provider calls',async()=>{
  await assert.rejects(()=>jsonBody(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(20)}),10));
  await assert.rejects(()=>jsonBody(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:'bad json'})));
});
