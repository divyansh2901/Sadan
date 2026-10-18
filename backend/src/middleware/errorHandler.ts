import { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const asyncHandler =
  (handler: (...args: any[]) => unknown) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const knownClientError = statusCode >= 400 && statusCode < 500;
  console.error('[ERROR]', err?.message ?? err);
  res.status(statusCode).json({
    error: knownClientError ? err.message : 'Internal server error',
  });
}
