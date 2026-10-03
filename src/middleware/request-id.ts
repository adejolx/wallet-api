import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomUUID();
  res.locals.requestId = requestId;
  res.set("X-Request-Id", requestId);

  const startedAt = performance.now();

  res.on("finish", () => {
    const event = {
      requestId,
      method: req.method,
      path: req.path,
      elapsedMs: performance.now() - startedAt,
      statusCode: res.statusCode,
    };

    console.log(JSON.stringify(event));
  });
  next();
}
