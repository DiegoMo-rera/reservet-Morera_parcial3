import 'dotenv/config';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const testDbUrl = process.env.TEST_DATABASE_URL;
assert.ok(testDbUrl, 'Falta TEST_DATABASE_URL para ejecutar las pruebas de integración.');

const parsedUrl = new URL(testDbUrl);
assert.ok(
  parsedUrl.pathname.endsWith('_test'),
  `Seguridad: TEST_DATABASE_URL debe apuntar a una base *_test (actual: ${parsedUrl.pathname}).`,
);

// Forzar que el servidor y el pool usen exclusivamente la base _test.
process.env.DATABASE_URL = testDbUrl;

const { app } = await import('../src/app.ts');
const { pool } = await import('../src/shared/database.ts');
const { hashPassword } = await import('../src/modules/auth/password.ts');

let server;
let base;

async function applyMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const migrationsDir = path.resolve('migrations');
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const filename of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
      filename,
    ]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
  }
}

before(async () => {
  await applyMigrations();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE TABLE user_sessions, restaurant_tables, users RESTART IDENTITY CASCADE',
  );
  const passwordHash = await hashPassword('Reservet123!');
  await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [
    'admin',
    passwordHash,
  ]);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function loginAsAdmin() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Reservet123!' }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie, 'Login debe devolver cookie de sesión');
  return cookie.split(';')[0];
}

test('autenticación: login correcto, credenciales inválidas, /me y revocación en logout', async () => {
  // Login incorrecto -> 401 genérico
  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'incorrecta' }),
  });
  assert.equal(badLogin.status, 401);
  const badBody = await badLogin.json();
  assert.equal(badBody.code, 'INVALID_CREDENTIALS');

  // Login correcto -> 200 + cookie HttpOnly
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Reservet123!' }),
  });
  assert.equal(loginRes.status, 200);
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const cookie = setCookie.split(';')[0];

  // Consulta de sesión actual -> 200
  const meRes = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meRes.status, 200);
  assert.deepEqual(await meRes.json(), { user: { id: 1, username: 'admin' } });

  // Logout -> revoca sesión en PostgreSQL
  const logoutRes = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(logoutRes.status, 200);

  // Reutilizar la cookie tras logout -> 401
  const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(afterLogout.status, 401);
});

test('protección de rutas: /api/tables rechaza peticiones sin sesión con 401', async () => {
  for (const [method, endpoint, body] of [
    ['GET', '/api/tables', undefined],
    ['POST', '/api/tables', JSON.stringify({ name: 'Mesa 1', capacity: 4 })],
    ['PATCH', '/api/tables/1/status', JSON.stringify({ status: 'occupied' })],
  ]) {
    const res = await fetch(`${base}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(res.status, 401);
  }
});

test('mesas: crear, listar, actualizar estado y persistencia en PostgreSQL', async () => {
  const cookie = await loginAsAdmin();

  // Lista inicial vacía
  const emptyList = await fetch(`${base}/api/tables`, { headers: { Cookie: cookie } });
  assert.equal(emptyList.status, 200);
  assert.deepEqual(await emptyList.json(), []);

  // Crear mesa válida (capacidad límite 20)
  const createRes = await fetch(`${base}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Salón VIP', capacity: 20 }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.id, 1);
  assert.equal(created.name, 'Salón VIP');
  assert.equal(created.capacity, 20);
  assert.equal(created.status, 'available');

  // Cambiar estado a occupied
  const patchRes = await fetch(`${base}/api/tables/1/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'occupied' }),
  });
  assert.equal(patchRes.status, 200);
  const updated = await patchRes.json();
  assert.equal(updated.status, 'occupied');

  // Verificar persistencia consultando nuevamente GET /api/tables
  const listRes = await fetch(`${base}/api/tables`, { headers: { Cookie: cookie } });
  assert.equal(listRes.status, 200);
  const rows = await listRes.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'occupied');
});

test('mesas: validaciones (400), duplicados (409) y mesa inexistente (404)', async () => {
  const cookie = await loginAsAdmin();

  // Datos inválidos -> 400
  for (const invalidPayload of [
    { name: '', capacity: 4 },
    { name: 'a'.repeat(81), capacity: 4 },
    { name: 'Mesa X', capacity: 0 },
    { name: 'Mesa X', capacity: 21 },
    { name: 'Mesa X', capacity: 2.5 },
  ]) {
    const res = await fetch(`${base}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(invalidPayload),
    });
    assert.equal(res.status, 400);
  }

  // Crear mesa base
  const first = await fetch(`${base}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Terraza 01', capacity: 4 }),
  });
  assert.equal(first.status, 201);

  // Nombre duplicado (insensible a mayúsculas/espacios) -> 409
  const duplicate = await fetch(`${base}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: '  terraza 01 ', capacity: 2 }),
  });
  assert.equal(duplicate.status, 409);

  // Estado inválido o ID inválido en PATCH -> 400
  const badStatus = await fetch(`${base}/api/tables/1/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'reserved' }),
  });
  assert.equal(badStatus.status, 400);

  const badId = await fetch(`${base}/api/tables/abc/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'occupied' }),
  });
  assert.equal(badId.status, 400);

  // Mesa inexistente -> 404
  const notFound = await fetch(`${base}/api/tables/999/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'occupied' }),
  });
  assert.equal(notFound.status, 404);
});
