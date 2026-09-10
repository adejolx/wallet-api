import { pool } from "../../database/pool.js";
import { WalletRepository } from "./wallet.repository.js";

const checkWalletRepository = async () => {
  const walletRepository = new WalletRepository(pool);

  try {
    console.log(
      "Update existing wallet:",
      await walletRepository.updateBalance(2, 500),
    );
    // expect WalletRow with balance_minor: 500

    console.log(
      "Update missing wallet:",
      await walletRepository.updateBalance(999999, 500),
    );
    // expect null

    console.log(
      "Update with invalid balance:",
      await walletRepository.updateBalance(2, -1),
    );
    // expect validation error
  } catch (error) {
    console.error("Wallet repository verification failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

checkWalletRepository();
