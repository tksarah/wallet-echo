import {startJob} from '@/lib/jobs';
import {validateInput} from '@/lib/validation';
import {assertId,assertOrigin,jsonBody} from '@/lib/api';
import {rateLimit,requestIdentity} from '@/lib/abuse';
import {abuseError} from '@/lib/abuse-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{await rateLimit(request);assertOrigin(request);const identity=requestIdentity(request);const key=request.headers.get('Idempotency-Key')||'';assertId(key);const input=validateInput(await jsonBody(request));return Response.json(await startJob(input,key,identity),{status:202,headers:{'Cache-Control':'no-store'}});}catch(e){return abuseError(e);}}
