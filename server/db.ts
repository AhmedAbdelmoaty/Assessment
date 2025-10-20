import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "../shared/schema.js";

// Configure WebSocket for local development
if (process.env.NODE_ENV !== "production") {
  neonConfig.webSocketConstructor = ws;
}

const connectionString = process.env.DATABASE_URL!;

export const db = drizzle({
  connection: connectionString,
  schema,
});
