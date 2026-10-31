import "dotenv/config";
import { app } from "./app.js";
import { pool } from "./db.js";
import { expirePendingRequests } from "./routes/api.js";

const required = ["DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and configure it.`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters.");
  process.exit(1);
}

const port = Number(process.env.API_PORT || 3001);
const server = app.listen(port, () => {
  console.log(`SETHU API listening on http://localhost:${port}`);
});

const expiryTimer = setInterval(() => {
  expirePendingRequests().catch((error) => console.error("Request expiry job failed:", error.message));
}, 60_000);
expiryTimer.unref();

async function shutdown() {
  clearInterval(expiryTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
