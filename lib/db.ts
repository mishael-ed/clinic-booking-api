import { Pool } from "@neondatabase/serverless";

const globalForPool = globalThis as unknown as { pool?: Pool };

export function pool(): Pool {
  if (!globalForPool.pool) {
    globalForPool.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return globalForPool.pool;
}
