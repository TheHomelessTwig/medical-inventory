import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    code: err.code,
  });

  // PostgreSQL unique violation
  if (err.code === '23505') {
    res.status(409).json({ error: 'A record with this value already exists' });
    return;
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    res.status(400).json({ error: 'Referenced record does not exist' });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(statusCode).json({ error: message });
};

export const createError = (message: string, statusCode = 400): AppError => {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  return err;
};
