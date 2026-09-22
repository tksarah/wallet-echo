import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
export const dataDir = () => path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || '.data');
export function abuseSecret(){
  if(process.env.ABUSE_SECRET)return process.env.ABUSE_SECRET;
  const file=path.join(dataDir(),'browser-secret');
  mkdirSync(dataDir(),{recursive:true,mode:0o700});
  try{return readFileSync(file,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  try{writeFileSync(file,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  return readFileSync(file,'utf8');
}
export function config() {
  let saved: Record<string, string> = {};
  try { saved = JSON.parse(readFileSync(path.join(dataDir(), 'secrets.json'), 'utf8')); } catch {}
  const get = (name: string) => process.env[name] || saved[name] || '';
  return {
    openaiKey: get('OPENAI_API_KEY'), typesafeKey: get('TYPESAFE_API_KEY'), pubfiKey: get('PUBFI_API_KEY'),
    adminPasswordHash: get('ADMIN_PASSWORD_HASH'),
    abuseIpHeader: get('ABUSE_IP_HEADER'),
    imageModel: get('OPENAI_IMAGE_MODEL') || 'gpt-image-2.5-flare',
    concurrentLimit: Math.max(1, Number(get('MAX_CONCURRENT_JOBS')) || 2),
  };
}
