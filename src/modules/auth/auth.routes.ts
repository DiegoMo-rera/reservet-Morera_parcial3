import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../../shared/config.js';
import { getSessionIdFromRequest } from './auth.middleware.js';
import {
  AuthServiceError,
  getCurrentUser,
  login,
  logout,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './auth.service.js';

export const authRouter = Router();

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.appEnv === 'pro',
    path: '/',
  };
}

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, user } = await login(req.body);
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      ...getCookieOptions(),
      maxAge: SESSION_TTL_MS,
    });
    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message,
        requestId: res.locals.requestId,
      });
      return;
    }
    next(error);
  }
});

authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    await logout(sessionId);
    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());
    res.status(200).json({ message: 'Sesión cerrada' });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = getSessionIdFromRequest(req);
    const user = await getCurrentUser(sessionId);

    if (!user) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'No autenticado',
        requestId: res.locals.requestId,
      });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});
