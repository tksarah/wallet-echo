import { z } from 'zod';
import { config } from './config';
import { fetchJson } from './http';
import { AppError } from './errors';
export async function generateImage(prompt:string):Promise<Buffer>{
  const c=config();if(!c.openaiKey)throw new AppError('NOT_CONFIGURED','画像生成APIが未設定です。',503);
  const raw=await fetchJson('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${c.openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:c.imageModel,prompt,n:1,size:'1024x1024',quality:'medium',output_format:'png'})},180000);
  const result=z.object({data:z.array(z.object({b64_json:z.string().min(100)})).length(1)}).safeParse(raw);
  if(!result.success)throw new AppError('INVALID_IMAGE','画像を受け取れませんでした。画像生成のみ再試行できます。',502);
  const buffer=Buffer.from(result.data.data[0].b64_json,'base64');
  if(buffer.length>20*1024*1024||buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new AppError('INVALID_IMAGE','生成画像の形式を確認できませんでした。',502);
  return buffer;
}
