import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config';
import { AppError } from './errors';
import { assertOrigin } from './api';
const derive=promisify(scrypt);
const COOKIE='wallet_echo_admin';
import { mutate } from './storage';
export function adminOrigin(request:Request){assertOrigin(request);if(!request.headers.get('origin'))throw new AppError('FORBIDDEN','送信元を確認できません。',403);}
export async function verifyPassword(password:string){
  await mutate(s=>{const now=Date.now();s.loginAttempts=s.loginAttempts.filter(t=>t>now-15*60*1000);if(s.loginAttempts.length>=10)throw new AppError('LOGIN_LIMIT','ログイン試行が多すぎます。15分後にお試しください。',429);s.loginAttempts.push(now);});
  const hash=config().adminPasswordHash;
  if(!hash)throw new AppError('NOT_CONFIGURED','管理者パスワードが未設定です。',503);
  const [salt,expected]=hash.split(':');
  if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(expected||''))throw new AppError('NOT_CONFIGURED','管理者設定を確認してください。',503);
  const actual=await derive(password,salt,64) as Buffer;
  if(!timingSafeEqual(actual,Buffer.from(expected,'hex')))throw new AppError('UNAUTHORIZED','パスワードが違います。',401);
  await mutate(s=>{s.loginAttempts=[];});
}
const signature=(payload:string)=>createHmac('sha256',config().adminPasswordHash).update(payload).digest('hex');
export function issueSession(){const payload=`${Date.now()+8*3600000}.${randomBytes(24).toString('hex')}`;return `${payload}.${signature(payload)}`;}
export function requireAdmin(request:Request){
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  const [expires,nonce,sig]=token.split('.');
  if(!config().adminPasswordHash||!/^\d{13}$/.test(expires||'')||!/^[a-f0-9]{48}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(sig||'')||Number(expires)<Date.now()||!timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(`${expires}.${nonce}`),'hex')))throw new AppError('UNAUTHORIZED','管理者ログインが必要です。',401);
}
export function sessionCookie(request:Request,token:string){const secure=process.env.NODE_ENV==='production'||new URL(request.url).protocol==='https:';return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?28800:0}${secure?'; Secure':''}`;}
