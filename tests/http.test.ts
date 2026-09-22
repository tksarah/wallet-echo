import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fetchJson} from '../src/lib/http';
test('Node transport refuses redirects without forwarding credentials',async()=>{
 let collected=0;
 const server=createServer((req,res)=>{
   if(req.url==='/ok'){res.setHeader('Content-Type','application/json');res.end('{"healthy":true}');}
   else if(req.url==='/moved'){res.writeHead(302,{Location:'/collect'});res.end();}
   else{collected++;res.end();}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
   assert.deepEqual(await fetchJson(base+'/ok'),{healthy:true});
   await assert.rejects(fetchJson(base+'/moved',{headers:{Authorization:'Bearer test-only'}}),{code:'UPSTREAM_REDIRECT'});
   assert.equal(collected,0);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
