import type { RowDataPacket } from "mysql2/promise";

export interface WalletRow extends RowDataPacket {
  id: number;
  user_id: number;
  currency: string;
  balance_minor: number;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow extends RowDataPacket {
  id: number;
  sender_wallet: number;
  recipient_wallet: string;
  amount_minor: number;
  created_at: Date;
  currency: string;
}
