import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";

const conn = postgres(config.DATABASE_URL, { max: 1 });
const db = drizzle(conn);

await migrate(db, { migrationsFolder: "./src/db/migrations" });
await conn.end();
console.log("Migrations applied.");
