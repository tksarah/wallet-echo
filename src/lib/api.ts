import { AppError, publicError } from './errors';
export const dynamic='force-dynamic';
export function errorResponse(error:unknown){const e=publicError(error);return Response.json({error:{code:e.code,message:e.message}},{status:e.status,headers:{'Cache-Control':'no-store'}});}
export function assertOrigin(request:Request){
  const origin=request.headers.get('origin');
  const host=request.headers.get('host');
  if(origin){try{const u=new URL(origin);if(u.host!==host||!['http:','https:'].includes(u.protocol))throw new Error();}catch{throw new AppError('FORBIDDEN','このリクエストは許可されていません。',403);}}
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('FORBIDDEN','このリクエストは許可されていません。',403);
}
export async function jsonBody(request:Request,limit=4096){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('CONTENT_TYPE','JSON形式で送信してください。',415);
  const reader=request.body?.getReader();if(!reader)throw new AppError('INVALID_INPUT','入力がありません。');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError('TOO_LARGE','入力が長すぎます。',413);}chunks.push(value);}}finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('INVALID_JSON','入力形式を確認してください。');}
}
export function assertId(id:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw new AppError('NOT_FOUND','結果が見つかりません。',404);}
