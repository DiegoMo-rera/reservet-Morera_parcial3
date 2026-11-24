import { pool } from '../../shared/database.js';

export type TableStatus = 'available' | 'occupied' | 'out_of_service';

export interface RestaurantTable {
  id: number;
  name: string;
  capacity: number;
  status: TableStatus;
  created_at: string;
}

export async function findAllTables(): Promise<RestaurantTable[]> {
  const result = await pool.query<RestaurantTable>(
    'SELECT id, name, capacity, status, created_at FROM restaurant_tables ORDER BY id ASC',
  );
  return result.rows;
}

export async function createTable(name: string, capacity: number): Promise<RestaurantTable> {
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM restaurant_tables WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
    [name],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    throw Object.assign(new Error('Ya existe una mesa con ese nombre'), { code: '23505' });
  }

  const result = await pool.query<RestaurantTable>(
    `INSERT INTO restaurant_tables (name, capacity)
     VALUES ($1, $2)
     RETURNING id, name, capacity, status, created_at`,
    [name, capacity],
  );
  const table = result.rows[0];
  if (!table) {
    throw new Error('No se pudo crear la mesa');
  }
  return table;
}

export async function updateTableStatus(
  id: number,
  status: TableStatus,
): Promise<RestaurantTable | null> {
  const result = await pool.query<RestaurantTable>(
    `UPDATE restaurant_tables
     SET status = $1
     WHERE id = $2
     RETURNING id, name, capacity, status, created_at`,
    [status, id],
  );
  return result.rows[0] ?? null;
}
