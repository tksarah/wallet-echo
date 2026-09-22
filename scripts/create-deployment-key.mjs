import {generateKeyPairSync} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
if(existsSync('.secrets/deploy-private-key.pem')||existsSync('deploy-public-key.pub'))throw Error('Deployment key already exists; refusing to overwrite');
mkdirSync('.secrets',{recursive:true,mode:0o700});
const pair=generateKeyPairSync('ed25519',{privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
writeFileSync('.secrets/deploy-private-key.pem',pair.privateKey,{flag:'wx',mode:0o600});
writeFileSync('deploy-public-key.pub',pair.publicKey,{flag:'wx',mode:0o644});
console.log('Deployment key files created. Keep the private key outside version control.');
