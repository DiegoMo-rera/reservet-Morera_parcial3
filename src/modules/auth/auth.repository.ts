import { pool } from '../../shared/database.js';

export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
}

export interface AuthUser {
  id: number;
  username: string;
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username],
  );
  return result.rows[0] ?? null;
}

export async function createSession(
  sessionId: string,
  userId: number,
  expiresAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [sessionId, userId, expiresAt],
  );
}

export async function findUserBySessionId(sessionId: string): Promise<AuthUser | null> {
  const result = await pool.query<AuthUser>(
    `SELECT u.id, u.username
     FROM user_sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [sessionId],
  );
  return result.rows[0] ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
}
