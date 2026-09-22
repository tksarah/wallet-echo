import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeWallet} from '../src/lib/wallet';
import {transport,fetchJson} from '../src/lib/http';
const input={addressType:'evm' as const,address:'0x'+'1'.repeat(40),style:'rpg-hero' as const};
test('pending EVM transactions and nullable cursors are not misread as confirmed activity',async()=>{
  const original=transport.fetch;let requests=0;
  transport.fetch=async(url)=>{requests++;if(requests===2)assert.ok(!String(url).includes('null'));return Response.json({items:[{hash:`hash${requests}`,timestamp:'2026-09-21T00:00:00.000000Z',from:{hash:input.address},to:{hash:'0x'+'2'.repeat(40),is_contract:true},status:requests===1?null:'ok'}],next_page_params:requests===1?{block_number:null,index:null,hash:'abc'}:null});};
  try{const f=await analyzeWallet(input);assert.equal(f.pendingTransactions,1);assert.equal(f.observedTransactions,1);assert.equal(f.successfulTransactions,1);assert.equal(requests,2);}finally{transport.fetch=original;}
});
test('failed provider and malformed response never become an empty wallet',async()=>{
  const original=transport.fetch;
  try{transport.fetch=async()=>Response.json({}, {status:403});await assert.rejects(()=>analyzeWallet(input),/認証/);transport.fetch=async()=>Response.json({items:'wrong'});await assert.rejects(()=>analyzeWallet(input),/形式/);}finally{transport.fetch=original;}
});
test('deadline covers response body and cannot wait forever',async()=>{
  const original=transport.fetch;transport.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})}) as Response;
  try{await assert.rejects(()=>fetchJson('https://example.invalid',{},20),/時間内/);}finally{transport.fetch=original;}
});
test('EVM fallback uses real secondary source and reports its provenance',async()=>{
  const original=transport.fetch;const saved=process.env.PUBFI_API_KEY;process.env.PUBFI_API_KEY='test';
  transport.fetch=async(url)=>String(url).includes('blockscout')?Response.json({}, {status:502}):Response.json({code:0,data:{count:1,list:[{hash:'abc',from:input.address,to:'0x'+'2'.repeat(40),success:true,block_timestamp:1789993344,method:'0x12345678',to_display:{evm_contract:{contract_name:'test'}}}]}});
  try{const f=await analyzeWallet(input);assert.equal(f.source,'Subscan via PubFi');assert.equal(f.observedTransactions,1);assert.deepEqual(f.operationKinds,['contract_call']);}finally{transport.fetch=original;if(saved===undefined)delete process.env.PUBFI_API_KEY;else process.env.PUBFI_API_KEY=saved;}
});
