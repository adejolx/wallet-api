import { pool } from "./pool.js"

const checkConnection = async () => {
    try {
       const [row]  = await pool.query("SELECT 1 AS ok");
       console.log("Database connection successful:", row);
    } catch(error){
        console.error("Database connection failed:", error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

checkConnection();