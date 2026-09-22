import { requireAdmin, adminOrigin } from '@/lib/admin-auth';
import { jsonBody, errorResponse } from '@/lib/api';
import { adminReset } from '@/lib/jobs';
import { AppError } from '@/lib/errors';
export const runtime='nodejs';
export async function POST(request:Request){try{requireAdmin(request);adminOrigin(request);const b=await jsonBody(request);if(typeof b.key!=='string'||b.key.length>120)throw new AppError('INVALID_INPUT','アドレスを確認してください。');await adminReset(b.key);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
