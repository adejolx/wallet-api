import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
  }

  console.error(err);

  return res.status(500).json({
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
  });
}
