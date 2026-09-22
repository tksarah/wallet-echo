import { requireAdmin, adminOrigin } from '@/lib/admin-auth';
import { jsonBody, errorResponse } from '@/lib/api';
import { adminSetReception } from '@/lib/jobs';
import { AppError } from '@/lib/errors';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireAdmin(request); adminOrigin(request);
    const body = await jsonBody(request);
    if (!body || typeof body.paused !== 'boolean') throw new AppError('INVALID_INPUT', '受付状態を確認してください。');
    return Response.json(await adminSetReception(body.paused), {headers: {'Cache-Control': 'no-store'}});
  } catch (error) { return errorResponse(error); }
}
