import {getJob} from '@/lib/jobs';
import {assertId} from '@/lib/api';
import {rateLimit,sessionOwner} from '@/lib/abuse';
import {abuseError} from '@/lib/abuse-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{await rateLimit(request,'read');const owner=sessionOwner(request);const {id}=await params;assertId(id);return Response.json(await getJob(id,owner),{headers:{'Cache-Control':'no-store'}});}catch(e){return abuseError(e);}}
