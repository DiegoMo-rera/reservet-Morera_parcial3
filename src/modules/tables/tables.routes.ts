import { Router, type NextFunction, type Request, type Response } from 'express';
import { addTable, changeTableStatus, listTables, TableServiceError } from '../tables.service.js';

export const tablesRouter = Router();

function handleError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof TableServiceError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
      requestId: res.locals.requestId,
    });
    return;
  }
  next(error);
}

tablesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tables = await listTables();
    res.status(200).json(tables);
  } catch (error) {
    handleError(error, res, next);
  }
});

tablesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = await addTable(req.body);
    res.status(201).json(table);
  } catch (error) {
    handleError(error, res, next);
  }
});

tablesRouter.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const table = await changeTableStatus(id ?? '', req.body);
    res.status(200).json(table);
  } catch (error) {
    handleError(error, res, next);
  }
});
