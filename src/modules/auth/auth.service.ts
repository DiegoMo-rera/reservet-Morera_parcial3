import { randomBytes } from 'node:crypto';
import {
  createSession,
  deleteSession,
  findUserBySessionId,
  findUserByUsername,
  type AuthUser,
} from './auth.repository.js';
import { verifyPassword } from './password.js';

export const SESSION_COOKIE_NAME = 'reservet_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

export class AuthServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AuthServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function login(input: unknown): Promise<{ sessionId: string; user: AuthUser }> {
  if (typeof input !== 'object' || input === null) {
    throw new AuthServiceError(400, 'INVALID_INPUT', 'El cuerpo de la petición es inválido');
  }

  const { username, password } = input as { username?: unknown; password?: unknown };

  if (
    typeof username !== 'string' ||
    username.trim().length === 0 ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new AuthServiceError(400, 'INVALID_INPUT', 'Usuario y contraseña son obligatorios');
  }

  const normalizedUsername = username.trim().toLowerCase();
  const user = await findUserByUsername(normalizedUsername);

  if (!user) {
    throw new AuthServiceError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new AuthServiceError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
  }

  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createSession(sessionId, user.id, expiresAt);

  return {
    sessionId,
    user: { id: user.id, username: user.username },
  };
}

export async function getCurrentUser(sessionId: string | undefined): Promise<AuthUser | null> {
  if (!sessionId) return null;
  return findUserBySessionId(sessionId);
}

export async function logout(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await deleteSession(sessionId);
}
