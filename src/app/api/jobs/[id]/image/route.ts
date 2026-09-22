import {readImage,acknowledgeImage} from '@/lib/jobs';
import {assertId,assertOrigin,jsonBody} from '@/lib/api';
import {AppError} from '@/lib/errors';
import {rateLimit,sessionOwner} from '@/lib/abuse';
import {abuseError} from '@/lib/abuse-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{await rateLimit(request,'read');const owner=sessionOwner(request);const {id}=await params;assertId(id);const {bytes,receipt}=await readImage(id,owner);return new Response(bytes,{headers:{'Content-Type':'image/png','Content-Disposition':`inline; filename="wallet-echo-${id}.png"`,'Cache-Control':'private, no-store','X-Image-Receipt':receipt}});}catch(e){return abuseError(e);}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await rateLimit(request,'read');assertOrigin(request);const owner=sessionOwner(request);const {id}=await params;assertId(id);const body=await jsonBody(request);if(typeof body?.receipt!=='string')throw new AppError('INVALID_INPUT','受領情報が必要です。');assertId(body.receipt);await acknowledgeImage(id,body.receipt,owner);return Response.json({received:true},{headers:{'Cache-Control':'no-store'}});}catch(e){return abuseError(e);}}
