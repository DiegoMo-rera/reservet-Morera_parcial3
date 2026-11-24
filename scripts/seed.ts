import 'dotenv/config';
import { pool } from '../src/shared/database.js';
import { hashPassword } from '../src/modules/auth/password.js';

const username = (process.env.SEED_USERNAME ?? 'admin').trim().toLowerCase();
const password = process.env.SEED_PASSWORD ?? 'Reservet123!';

async function seed(): Promise<void> {
  if (!username || password.length < 8) {
    throw new Error(
      'SEED_USERNAME es obligatorio y SEED_PASSWORD debe tener al menos 8 caracteres',
    );
  }

  const passwordHash = await hashPassword(password);

  await pool.query(
    `INSERT INTO users (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, passwordHash],
  );

  console.log(`Usuario de prueba listo: ${username}`);
}

seed()
  .catch((error: unknown) => {
    console.error('Error al ejecutar seed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
