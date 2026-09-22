import fs from 'node:fs';
import {sign,randomUUID,scryptSync,randomBytes} from 'node:crypto';
process.loadEnvFile('.env.local');
const url=new URL(process.argv[2]);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Expected the verified application HTTPS origin');
const values={};for(const key of ['OPENAI_API_KEY','TYPESAFE_API_KEY','PUBFI_API_KEY','ABUSE_IP_HEADER']){if(process.env[key])values[key]=process.env[key];}
if(!values.OPENAI_API_KEY||!values.TYPESAFE_API_KEY)throw new Error('Required local credentials are missing');
if(fs.existsSync('admin_pw.txt')){
 const password=fs.readFileSync('admin_pw.txt','utf8').replace(/^\uFEFF/,'').trim();
 if(!password || password.length>512)throw new Error('Admin password file must contain one password, at most 512 characters');
 const salt=randomBytes(16).toString('hex');values.ADMIN_PASSWORD_HASH=salt+':'+scryptSync(password,salt,64).toString('hex');
}
const payload=JSON.stringify({timestamp:Date.now(),nonce:randomUUID(),values});
const signature=sign(null,Buffer.from(payload),fs.readFileSync('.secrets/deploy-private-key.pem','utf8')).toString('base64');
const r=await fetch(new URL('/api/setup',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),redirect:'error',signal:AbortSignal.timeout(15000)});
if(!r.ok)throw new Error(`Secure configuration failed: HTTP ${r.status}`);
console.log('Server API credentials configured securely. No secrets printed.');
