export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function publicError(error: unknown) {
  if (error instanceof AppError) return { code: error.code, message: error.message, status: error.status };
  return { code: 'INTERNAL_ERROR', message: '処理を完了できませんでした。少し待ってからもう一度お試しください。', status: 500 };
}
