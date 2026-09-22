import { requireAdmin } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/api';
import { parseAdminQueries, pageNumber } from '@/lib/admin-lists';
import { adminData } from '@/lib/jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{requireAdmin(request);const q=new URL(request.url).searchParams;const page=pageNumber(q.get('page'));return Response.json(await adminData((q.get('search')||'').slice(0,100),page,parseAdminQueries(q)),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
