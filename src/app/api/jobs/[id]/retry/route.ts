import {retryImage} from '@/lib/jobs';
import {assertId,assertOrigin} from '@/lib/api';
import {rateLimit,requestIdentity} from '@/lib/abuse';
import {abuseError} from '@/lib/abuse-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await rateLimit(request);assertOrigin(request);const identity=requestIdentity(request);const {id}=await params;assertId(id);const key=request.headers.get('Idempotency-Key')||'';assertId(key);return Response.json(await retryImage(id,key,identity),{status:202,headers:{'Cache-Control':'no-store'}});}catch(e){return abuseError(e);}}
