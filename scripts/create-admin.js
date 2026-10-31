import "dotenv/config";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { pool, transaction } from "../backend/db.js";
import { createAdminAccount, promptAdminCredentials, readHiddenPassword } from "./admin-setup.js";

async function promptText(message) {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    return await prompt.question(message);
  } finally {
    prompt.close();
  }
}

async function run() {
  const credentials = await promptAdminCredentials({
    env: process.env,
    promptText,
    promptPassword: (message) => readHiddenPassword(stdin, stdout),
    write: (message) => stdout.write(message),
    canPrompt: Boolean(stdin.isTTY)
  });
  await createAdminAccount({ credentials, transaction, bcrypt });
  stdout.write("Admin account created. You can now sign in.\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    await run();
  } catch (error) {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
