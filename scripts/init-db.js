import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../backend/db.js";

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const schema = await readFile(path.join(scriptDirectory, "..", "backend", "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Database schema and service categories initialized.");
} catch (error) {
  console.error("Database initialization failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
