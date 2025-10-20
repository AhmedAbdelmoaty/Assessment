import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import * as schema from "../shared/schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const client = neon(connectionString);
export const db = drizzle(client, { schema });
