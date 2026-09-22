import { adminOrigin, verifyPassword, issueSession, sessionCookie, requireAdmin } from '@/lib/admin-auth';
import { jsonBody, errorResponse } from '@/lib/api';
import { AppError } from '@/lib/errors';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{adminOrigin(request);const b=await jsonBody(request);if(typeof b.password!=='string'||b.password.length>512)throw new AppError('INVALID_INPUT','パスワードを入力してください。');await verifyPassword(b.password);return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(request,issueSession()),'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function DELETE(request:Request){try{adminOrigin(request);return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie(request,''),'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function GET(request:Request){try{requireAdmin(request);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
