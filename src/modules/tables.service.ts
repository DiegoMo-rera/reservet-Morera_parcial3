import {
  createTable,
  findAllTables,
  updateTableStatus,
  type RestaurantTable,
  type TableStatus,
} from './tables/tables.repository.js';

const VALID_STATUSES: readonly TableStatus[] = ['available', 'occupied', 'out_of_service'];

export class TableServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'TableServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function listTables(): Promise<RestaurantTable[]> {
  return findAllTables();
}

export async function addTable(input: unknown): Promise<RestaurantTable> {
  if (typeof input !== 'object' || input === null) {
    throw new TableServiceError(400, 'INVALID_INPUT', 'El cuerpo de la petición es inválido');
  }

  const { name, capacity } = input as { name?: unknown; capacity?: unknown };

  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 80) {
    throw new TableServiceError(
      400,
      'INVALID_NAME',
      'El nombre es obligatorio y debe tener entre 1 y 80 caracteres',
    );
  }

  if (
    typeof capacity !== 'number' ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 20
  ) {
    throw new TableServiceError(
      400,
      'INVALID_CAPACITY',
      'La capacidad debe ser un número entero entre 1 y 20',
    );
  }

  try {
    return await createTable(name.trim(), capacity);
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new TableServiceError(409, 'TABLE_NAME_CONFLICT', 'Ya existe una mesa con ese nombre');
    }
    throw error;
  }
}

export async function changeTableStatus(rawId: string, input: unknown): Promise<RestaurantTable> {
  if (!/^\d+$/.test(rawId)) {
    throw new TableServiceError(400, 'INVALID_ID', 'El identificador de la mesa es inválido');
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TableServiceError(400, 'INVALID_ID', 'El identificador de la mesa es inválido');
  }

  if (typeof input !== 'object' || input === null) {
    throw new TableServiceError(400, 'INVALID_INPUT', 'El cuerpo de la petición es inválido');
  }

  const { status } = input as { status?: unknown };
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as TableStatus)) {
    throw new TableServiceError(
      400,
      'INVALID_STATUS',
      'El estado debe ser available, occupied o out_of_service',
    );
  }

  const updated = await updateTableStatus(id, status as TableStatus);
  if (!updated) {
    throw new TableServiceError(404, 'TABLE_NOT_FOUND', 'Mesa no encontrada');
  }

  return updated;
}
