import {runJob} from '@/lib/jobs';
import {assertId,assertOrigin} from '@/lib/api';
import {rateLimit,sessionOwner} from '@/lib/abuse';
import {abuseError} from '@/lib/abuse-api';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{await rateLimit(request,'run');assertOrigin(request);const owner=sessionOwner(request);const {id}=await params;assertId(id);return await runJob(id,owner,request.signal);}catch(e){return abuseError(e);}}
