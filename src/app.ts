import express, { type Express } from "express";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

const app: Express = express();

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "wallet-api" });
});

app.use(notFound);
app.use(errorHandler);

export default app;
