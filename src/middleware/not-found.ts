import type { Request, Response, NextFunction } from "express";
import { NotFoundError } from "../errors/not-found-error.js";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
}
