import {isIP} from 'node:net';
import {requireAdmin} from '@/lib/admin-auth';
import {digest,abuseConfigured} from '@/lib/abuse';
import {errorResponse} from '@/lib/api';
export const runtime='nodejs';
// Authenticated diagnostics expose a keyed fingerprint, never a visitor address.
export async function GET(request:Request){try{
 requireAdmin(request);
 const ip=request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'',version=isIP(ip);
 const normalized=version===6?new URL(`http://[${ip}]/`).hostname.slice(1,-1).toLowerCase():ip;
 return Response.json({present:!!ip,valid:!!version,fingerprint:version?digest('ip',normalized):null,enabled:abuseConfigured()},{headers:{'Cache-Control':'no-store'}});
}catch(error){return errorResponse(error);}}
