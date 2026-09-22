import {requireAdmin,adminOrigin} from '@/lib/admin-auth';
import {jsonBody,errorResponse} from '@/lib/api';
import {adminSetConcurrency} from '@/lib/jobs';
export const runtime='nodejs';
export async function POST(request:Request){
  try{requireAdmin(request);adminOrigin(request);const body=await jsonBody(request);return Response.json(await adminSetConcurrency(body?.concurrentLimit),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return errorResponse(error);}
}
