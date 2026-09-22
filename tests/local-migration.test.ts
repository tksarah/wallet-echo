import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {newLedger,reserveWallet} from '../src/lib/ledger';

test('legacy migration preserves ledger, judgments, pause state and backup across restart',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'wallet-echo-migration-'));
 try{
  const ledger=newLedger();reserveWallet(ledger,{addressType:'evm',address:'0x'+'1'.repeat(40)});
  ledger.cost.image=0.03;ledger.calls.image=2;
  const original={jobs:{},ledger,judgments:{synthetic:{fingerprint:'fixture',profile:{version:2}}},receptionPaused:true};
  const text=JSON.stringify(original);await writeFile(path.join(directory,'state.json'),text);
  const code=`import {readState,mutate,bindings} from './src/lib/storage.ts';const s=await readState();console.log(JSON.stringify(s));await mutate(s=>{s.concurrentLimit=5});(await bindings()).DB.close();`;
  const run=()=>{const r=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,DATA_DIR:directory},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());};
  const first=run();assert.deepEqual(first.ledger,ledger);assert.deepEqual(first.judgments,original.judgments);assert.equal(first.receptionPaused,true);assert.equal(first.concurrentLimit,3);
  assert.equal(await readFile(path.join(directory,'state.pre-sqlite.json'),'utf8'),text);
  const second=run();assert.equal(second.concurrentLimit,5);assert.deepEqual(second.ledger,ledger);
  assert.equal(await readFile(path.join(directory,'state.json'),'utf8'),text);
 }finally{await rm(directory,{recursive:true,force:true});}
});
