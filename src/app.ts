import express, { type Express } from "express";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createWalletRouter } from "./modules/wallet/wallet.controller.js";
import { WalletService } from "./modules/wallet/wallet.service.js";
import { pool } from "./database/pool.js";

const app: Express = express();

const walletRouter = createWalletRouter(new WalletService(pool));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "wallet-api" });
});

app.use(walletRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
