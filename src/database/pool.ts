import { createPool } from "mysql2/promise";
import { parsePort } from "../config.js";

const port = parsePort(process.env.DB_PORT || "3306");

export const pool = createPool({
    host: process.env.DB_HOST || '',
    port: port,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
})