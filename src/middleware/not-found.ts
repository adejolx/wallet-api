import type { NextFunction, Request, Response } from "express";

import { NotFoundError } from "../errors/not-found-error.js";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}
