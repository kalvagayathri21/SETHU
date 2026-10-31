import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  createAdminAccount,
  promptAdminCredentials,
  readHiddenPassword
} from "./admin-setup.js";

test("admin setup retries invalid interactive input and validates each field", async () => {
  const textAnswers = ["A", "Admin User", "not-an-email", "admin@example.com", "123", "+919876543210"];
  const passwordAnswers = ["short", "A sufficiently long password"];
  const errors = [];
  const credentials = await promptAdminCredentials({
    env: {},
    promptText: async () => textAnswers.shift(),
    promptPassword: async () => passwordAnswers.shift(),
    write: (message) => errors.push(message)
  });

  assert.equal(credentials.ADMIN_NAME, "Admin User");
  assert.equal(credentials.ADMIN_EMAIL, "admin@example.com");
  assert.equal(credentials.ADMIN_PHONE, "+919876543210");
  assert.equal(credentials.ADMIN_PASSWORD, "A sufficiently long password");
  assert.equal(errors.length, 4);
  assert.equal(errors.some((message) => message.includes("short")), false);
});

test("admin setup validates environment credentials and normalizes email", async () => {
  const credentials = await promptAdminCredentials({
    env: {
      ADMIN_NAME: "Admin User",
      ADMIN_EMAIL: " ADMIN@EXAMPLE.COM ",
      ADMIN_PHONE: "+919876543210",
      ADMIN_PASSWORD: "A sufficiently long password"
    },
    promptText: async () => assert.fail("Should not prompt for configured values"),
    promptPassword: async () => assert.fail("Should not prompt for configured values")
  });
  assert.equal(credentials.ADMIN_EMAIL, "admin@example.com");
});

test("admin setup prompts to replace invalid environment values", async () => {
  const prompts = [];
  const credentials = await promptAdminCredentials({
    env: {
      ADMIN_NAME: "Admin User",
      ADMIN_EMAIL: "invalid-email",
      ADMIN_PHONE: "+919876543210",
      ADMIN_PASSWORD: "A sufficiently long password"
    },
    promptText: async (message) => {
      prompts.push(message);
      return "admin@example.com";
    },
    promptPassword: async () => assert.fail("Should not prompt for configured password"),
    write: () => {}
  });

  assert.equal(credentials.ADMIN_EMAIL, "admin@example.com");
  assert.deepEqual(prompts, ["Admin email: "]);
});

test("admin setup reports invalid environment values without prompting in non-interactive mode", async () => {
  await assert.rejects(promptAdminCredentials({
    env: { ADMIN_NAME: "Admin User", ADMIN_EMAIL: "invalid-email" },
    promptText: async () => assert.fail("Must not prompt without a terminal"),
    promptPassword: async () => assert.fail("Must not prompt without a terminal"),
    canPrompt: false
  }), /ADMIN_EMAIL is missing or invalid.*interactive terminal/);
});

test("password input is masked and requires a TTY", async () => {
  const input = new EventEmitter();
  input.isTTY = true;
  input.setEncoding = () => {};
  input.setRawMode = (enabled) => { input.rawMode = enabled; };
  input.resume = () => {};
  const output = { text: "", write(value) { this.text += value; } };
  const result = readHiddenPassword(input, output);
  input.emit("data", "A sufficiently long password");
  input.emit("data", "\r");

  assert.equal(await result, "A sufficiently long password");
  assert.equal(input.rawMode, false);
  assert.equal(output.text.includes("A sufficiently long password"), false);
  assert.match(output.text, /\*{28}/);
  await assert.rejects(readHiddenPassword({ isTTY: false }, output), /terminal is required/);
});

test("admin account creation hashes the password and only inserts a new admin", async () => {
  const calls = [];
  const transaction = async (callback) => callback({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) return { rows: [] };
      return { rows: [{ id: 17 }] };
    }
  });
  const bcrypt = {
    hash: async (password, rounds) => {
      assert.equal(password, "A sufficiently long password");
      assert.equal(rounds, 12);
      return "bcrypt-hash";
    }
  };
  const result = await createAdminAccount({
    credentials: {
      ADMIN_NAME: "Admin User",
      ADMIN_EMAIL: "ADMIN@example.com",
      ADMIN_PHONE: "+919876543210",
      ADMIN_PASSWORD: "A sufficiently long password"
    },
    transaction,
    bcrypt
  });

  assert.deepEqual(result, { id: 17 });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /SELECT id,role,email,phone/);
  assert.match(calls[1].sql, /INSERT INTO users/);
  assert.doesNotMatch(calls[1].sql, /ON CONFLICT|UPDATE/i);
  assert.deepEqual(calls[1].params, ["Admin User", "admin@example.com", "+919876543210", "bcrypt-hash"]);
});

test("duplicate email or phone is rejected without changing an existing account", async () => {
  let insertAttempted = false;
  let passwordHashed = false;
  const transaction = async (callback) => callback({
    query: async (sql) => {
      if (sql.startsWith("SELECT")) {
        return { rows: [{ id: 3, role: "CUSTOMER", email: "admin@example.com", phone: "+919876543210" }] };
      }
      insertAttempted = true;
      return { rows: [] };
    }
  });
  await assert.rejects(createAdminAccount({
    credentials: {
      ADMIN_NAME: "Admin User",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PHONE: "+919876543210",
      ADMIN_PASSWORD: "A sufficiently long password"
    },
    transaction,
    bcrypt: { hash: async () => { passwordHashed = true; return "hash"; } }
  }), /Email and phone number are already registered.*No account was changed/);

  assert.equal(insertAttempted, false);
  assert.equal(passwordHashed, false);
});
