import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { config } from "../config";

const conn = postgres(config.DATABASE_URL);
export const db = drizzle(conn, { schema });
