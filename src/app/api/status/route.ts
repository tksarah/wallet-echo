import {status} from '@/lib/jobs';
import {errorResponse} from '@/lib/api';
import {rateLimit,browserCookie} from '@/lib/abuse';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await rateLimit(request,'read');const cookie=browserCookie(request);const headers=new Headers({'Cache-Control':'no-store'});if(cookie)headers.set('Set-Cookie',cookie);return Response.json(await status(),{headers});}catch(e){return errorResponse(e);}}
