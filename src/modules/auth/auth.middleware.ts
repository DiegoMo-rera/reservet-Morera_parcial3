import type { NextFunction, Request, Response } from 'express';
import { getCurrentUser, SESSION_COOKIE_NAME } from './auth.service.js';

export function getSessionIdFromRequest(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = part.slice(0, separatorIndex).trim();
    if (key === SESSION_COOKIE_NAME) {
      const value = part.slice(separatorIndex + 1).trim();
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const user = await getCurrentUser(sessionId);

    if (!user) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Autenticación requerida',
        requestId: res.locals.requestId,
      });
      return;
    }

    res.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
