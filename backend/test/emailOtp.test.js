
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  generateOtp,
  getResendState,
  hashOtp,
  matchesOtp,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_RESEND_WINDOW_MS,
  sendOtpEmail
} from "../emailOtp.js";
import { schemas } from "../middleware/validation.js";

const emailJsEnvKeys = [
  "EMAILJS_SERVICE_ID",
  "EMAILJS_TEMPLATE_ID",
  "EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY"
];

function saveEmailJsEnv() {
  return Object.fromEntries(
    emailJsEnvKeys.map((key) => [key, process.env[key]])
  );
}

function restoreEmailJsEnv(previous) {
  for (const key of emailJsEnvKeys) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
}

function setEmailJsEnv() {
  process.env.EMAILJS_SERVICE_ID = "service_test123";
  process.env.EMAILJS_TEMPLATE_ID = "template_test123";
  process.env.EMAILJS_PUBLIC_KEY = "public_test123";
  process.env.EMAILJS_PRIVATE_KEY = "private_test123";
}

test("OTP generation and keyed hashing preserve the verification secret", () => {
  const otp = generateOtp();
  const secret = "a-test-secret-that-is-never-returned";
  const hash = hashOtp(42, otp, secret);

  assert.match(otp, /^\d{6}$/);
  assert.notEqual(hash, otp);
  assert.equal(hash.length, 64);
  assert.equal(matchesOtp(42, otp, hash, secret), true);
  assert.equal(matchesOtp(43, otp, hash, secret), false);
  assert.equal(matchesOtp(42, otp, hash, "another-secret"), false);
  assert.equal(matchesOtp(42, otp, "not-a-hash", secret), false);
});

test("OTP lifetime and attempt/resend limits are fixed and enforced", () => {
  assert.equal(OTP_EXPIRY_MS, 5 * 60 * 1000);
  assert.equal(OTP_MAX_ATTEMPTS, 5);
  assert.equal(OTP_MAX_RESENDS, 3);
  assert.equal(OTP_RESEND_WINDOW_MS, 15 * 60 * 1000);
  assert.equal(OTP_RESEND_COOLDOWN_MS, 30 * 1000);

  const now = Date.now();
  const windowStartedAt = new Date(now - 60_000);

  assert.deepEqual(
    getResendState({
      resendCount: 2,
      windowStartedAt,
      lastSentAt: new Date(now - 60_000),
      now
    }),
    { allowed: true, resendCount: 3, windowStartedAt }
  );

  assert.equal(getResendState({
    resendCount: 3,
    windowStartedAt,
    lastSentAt: new Date(now - 60_000),
    now
  }).allowed, false);

  assert.equal(getResendState({
    resendCount: 0,
    windowStartedAt,
    lastSentAt: new Date(now - 10_000),
    now
  }).reason, "COOLDOWN");

  assert.equal(getResendState({
    resendCount: 3,
    windowStartedAt: new Date(now - OTP_RESEND_WINDOW_MS - 1),
    lastSentAt: new Date(now - OTP_RESEND_WINDOW_MS - 1),
    now
  }).resendCount, 1);
});

test("OTP endpoints validate normalized email and six-digit codes", () => {
  assert.deepEqual(schemas.sendOtp.parse({
    email: " CUSTOMER@example.com "
  }), {
    email: "customer@example.com"
  });

  assert.deepEqual(schemas.verifyOtp.parse({
    email: "CUSTOMER@example.com",
    otp: "001234"
  }), {
    email: "customer@example.com",
    otp: "001234"
  });

  assert.equal(schemas.verifyOtp.safeParse({
    email: "customer@example.com",
    otp: "12345"
  }).success, false);
});

test("email delivery fails explicitly when EmailJS configuration is absent", async () => {
  const previous = saveEmailJsEnv();

  try {
    for (const key of emailJsEnvKeys) {
      delete process.env[key];
    }

    await assert.rejects(
      sendOtpEmail("customer@example.com", "123456"),
      {
        code: "EMAIL_NOT_CONFIGURED",
        status: 503
      }
    );
  } finally {
    restoreEmailJsEnv(previous);
  }
});

test("email delivery sends OTP through EmailJS using backend-only credentials", async () => {
  const previous = saveEmailJsEnv();
  let requestUrl;
  let requestOptions;

  try {
    setEmailJsEnv();

    await sendOtpEmail("customer@example.com", "001234", {
      async fetchImpl(url, options) {
        requestUrl = url;
        requestOptions = options;
        return { ok: true, status: 200 };
      }
    });

    assert.equal(
      requestUrl,
      "https://api.emailjs.com/api/v1.0/email/send"
    );

    assert.equal(requestOptions.method, "POST");
    assert.equal(
      requestOptions.headers["Content-Type"],
      "application/json"
    );

    const body = JSON.parse(requestOptions.body);

    assert.equal(body.service_id, "service_test123");
    assert.equal(body.template_id, "template_test123");
    assert.equal(body.user_id, "public_test123");
    assert.equal(body.accessToken, "private_test123");
    assert.deepEqual(body.template_params, {
      to_email: "customer@example.com",
      otp_code: "001234"
    });
  } finally {
    restoreEmailJsEnv(previous);
  }
});

test("EmailJS delivery failures return a safe error", async () => {
  const previous = saveEmailJsEnv();

  try {
    setEmailJsEnv();

    await assert.rejects(
      sendOtpEmail("customer@example.com", "001234", {
        async fetchImpl() {
          return { ok: false, status: 403 };
        }
      }),
      {
        code: "EMAIL_DELIVERY_FAILED",
        status: 502
      }
    );
  } finally {
    restoreEmailJsEnv(previous);
  }
});

test("schema defaults existing customer/provider accounts to unverified and keeps admin/demo accounts verified", async () => {
  const schema = await readFile(
    new URL("../schema.sql", import.meta.url),
    "utf8"
  );

  assert.match(schema, /email_verified BOOLEAN NOT NULL DEFAULT false/);
  assert.match(
    schema,
    /ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;/
  );
  assert.match(
    schema,
    /UPDATE users SET email_verified = true WHERE role = 'ADMIN' OR is_sample = true;/
  );
  assert.match(schema, /CREATE TABLE IF NOT EXISTS email_verification_otps/);
  assert.match(schema, /otp_hash TEXT NOT NULL/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pending_registrations/);
  assert.match(schema, /password_hash TEXT NOT NULL/);
  assert.match(schema, /registration_expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(schema, /UNIQUE/);
});

test("auth routes send codes, verify them, and gate customer/provider logins", async () => {
  const authRoutes = await readFile(
    new URL("../routes/auth.js", import.meta.url),
    "utf8"
  );
  const profileRoutes = await readFile(
    new URL("../routes/api.js", import.meta.url),
    "utf8"
  );

  assert.match(authRoutes, /INSERT INTO pending_registrations/);
  assert.match(authRoutes, /delete registrationData\.password/);
  assert.match(authRoutes, /await deliverEmail\(data\.email, otp\)/);
  assert.match(
    authRoutes,
    /await createRegisteredUser\(client, registration, pending\.password_hash\)/
  );
  assert.match(
    authRoutes,
    /DELETE FROM pending_registrations WHERE id = \$1/
  );
  assert.match(authRoutes, /pg_advisory_xact_lock/);
  assert.match(authRoutes, /router\.post\("\/send-otp"/);
  assert.match(authRoutes, /router\.post\("\/resend-otp"/);
  assert.match(authRoutes, /router\.post\("\/verify-otp"/);
  assert.match(
    authRoutes,
    /user\.role !== "ADMIN" && !user\.email_verified/
  );

  for (const role of [
    "CUSTOMER",
    "INDIVIDUAL_PROVIDER",
    "BUSINESS_PROVIDER"
  ]) {
    assert.ok(
      authRoutes.includes(`'${role}'`),
      `${role} should be included in registration verification`
    );
  }

  assert.match(
    profileRoutes,
    /email_verified = CASE WHEN \$5 THEN false ELSE email_verified END/
  );
  assert.match(
    profileRoutes,
    /if \(changedEmail\) await issueOtpForEmail\(changedEmail\)/
  );
});
