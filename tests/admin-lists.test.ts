import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminLists,parseAdminQueries,pageNumber,slicePage,type AdminQueries} from '../src/lib/admin-lists';
import {newLedger} from '../src/lib/ledger';
const queries=():AdminQueries=>({wallet:{search:'',page:1},history:{search:'',page:1},log:{search:'',page:1}});
test('pagination handles empty, exact boundary, next and final pages and invalid numbers',()=>{
  for(const count of [0,50,51,5000]){
    const rows=Array.from({length:count},(_,i)=>i);
    const first=slicePage(rows,{search:'',page:1});assert.equal(first.items.length,Math.min(count,50));assert.equal(first.info.from,count?1:0);
    const last=slicePage(rows,{search:'',page:999999});assert.equal(last.info.page,Math.max(1,Math.ceil(count/50)));assert.equal(last.info.to,count);
    assert.equal(last.items.length,count?count%50||50:0);
  }
  for(const input of ['bad',Infinity,NaN,-1,0])assert.equal(pageNumber(input),1);
  assert.equal(pageNumber(2.9),2);
});
test('all stored history and logs are reachable independently without changing ledger or global totals',()=>{
  const ledger=newLedger();
  for(let i=0;i<5000;i++)ledger.history.push({id:String(i),address:i%2?'alpha':'beta',addressType:'evm',world:'rpg-hero',status:'complete',createdAt:'2026-09-22',updatedAt:'2026-09-22',attempts:1,cost:{image:0,pubfi:0,jev:0}});
  for(let i=0;i<500;i++)ledger.logs.push({at:String(i),event:'event',...(i%2?{address:'alpha'}:{})});
  for(let i=0;i<51;i++)ledger.wallets[String(i)]={address:'wallet-'+i,addressType:'evm',used:1,total:1,resets:0,lastAt:String(i).padStart(3,'0')};
  const before=JSON.stringify(ledger);const q=queries();q.wallet.page=2;q.history.page=100;q.log.page=10;
  let result=adminLists(ledger,'',1,q);assert.equal(result.wallets.length,1);assert.equal(result.history[0].id,'4950');assert.equal(result.logs[0].at,'450');
  q.history={search:'ALPHA',page:999};result=adminLists(ledger,'',1,q);assert.equal(result.pagination.history.total,2500);assert.equal(result.pagination.history.page,50);assert.equal(result.pagination.log.total,500);assert.equal(result.pagination.wallet.page,2);
  q.log.search='alpha';result=adminLists(ledger,'',1,q);assert.equal(result.pagination.log.total,250);
  q.log.search='missing';assert.equal(adminLists(ledger,'',1,q).logs.length,0);
  assert.equal(JSON.stringify(ledger),before);
  const legacy=adminLists(ledger,'',1);assert.equal(legacy.history.length,100);assert.equal(legacy.logs.length,100);assert.equal(legacy.wallets.length,50);
  assert.equal(adminLists(ledger,'alpha',1).walletCount,0);
});
test('new query parameters are independent; legacy parameters do not leak into new filters',()=>{
  assert.equal(parseAdminQueries(new URLSearchParams('search=alpha&page=2')),undefined);
  const q=parseAdminQueries(new URLSearchParams('search=alpha&page=2&historySearch=beta&historyPage=3.9&logPage=Infinity'))!;
  assert.deepEqual(q,{wallet:{search:'',page:1},history:{search:'beta',page:3},log:{search:'',page:1}});
});
