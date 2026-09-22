import { verify } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { dataDir } from '@/lib/config';
import { jsonBody, errorResponse } from '@/lib/api';
import { AppError } from '@/lib/errors';
export const runtime='nodejs';
export const dynamic='force-dynamic';
let setupQueue=Promise.resolve();
const schema=z.object({timestamp:z.number(),nonce:z.string().uuid(),values:z.object({OPENAI_API_KEY:z.string().min(1).max(512).optional(),TYPESAFE_API_KEY:z.string().min(1).max(512).optional(),PUBFI_API_KEY:z.string().max(512).optional(),ABUSE_IP_HEADER:z.enum(['','x-forwarded-for']).optional(),ADMIN_PASSWORD_HASH:z.string().regex(/^[a-f0-9]{32}:[a-f0-9]{128}$/).optional()}).strict()}).strict();
export async function POST(request:Request){
  try{
    const body=await jsonBody(request,16384);const outer=z.object({payload:z.string().max(10000),signature:z.string().max(256)}).strict().safeParse(body);
    if(!outer.success)throw new AppError('FORBIDDEN','設定リクエストが無効です。',403);
    const key=await readFile(path.join(process.cwd(),'deploy-public-key.pub'),'utf8');
    if(!verify(null,Buffer.from(outer.data.payload),key,Buffer.from(outer.data.signature,'base64')))throw new AppError('FORBIDDEN','設定リクエストが無効です。',403);
    const parsed=schema.safeParse(JSON.parse(outer.data.payload));if(!parsed.success||Math.abs(Date.now()-parsed.data.timestamp)>300000)throw new AppError('EXPIRED','設定リクエストの期限が切れています。',403);
    const value=parsed.data;
    const operation=setupQueue.then(async()=>{
      await mkdir(dataDir(),{recursive:true});const receipt=path.join(dataDir(),'setup-receipt.json');
      let last:{timestamp:number}|null=null;try{last=JSON.parse(await readFile(receipt,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(last&&value.timestamp<=last.timestamp)throw new AppError('REPLAY','設定リクエストは処理済みです。',409);
      const target=path.join(dataDir(),'secrets.json');
      let existing:Record<string,string>={};try{existing=JSON.parse(await readFile(target,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      await writeFile(target+'.tmp',JSON.stringify({...existing,...value.values}),{mode:0o600});await rename(target+'.tmp',target);
      await writeFile(receipt,JSON.stringify({timestamp:value.timestamp,nonce:value.nonce}),{mode:0o600});
    });setupQueue=operation.catch(()=>{});await operation;
    return Response.json({configured:true},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return errorResponse(e);}
}
