import { readdir, readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const dir = new URL("../migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const f of files) {
  await pool.query(await readFile(new URL(f, dir), "utf8"));
  console.log("applied", f);
}
await pool.end();
