import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "../db.js";
import {
  generateOtp,
  hashOtp,
  issueOtpForEmail,
  matchesOtp,
  OTP_MAX_ATTEMPTS,
  OTP_EXPIRY_MS,
  REGISTRATION_EXPIRY_MS,
  sendOtpEmail
} from "../emailOtp.js";
import { authenticate, clearAuthCookies, requireCsrf, signInCookies } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../middleware/errors.js";
import { schemas, validate } from "../middleware/validation.js";

function publicUser(row) {
  return {
    id: Number(row.id),
    role: row.role,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    emailVerified: row.email_verified === true,
    providerType: row.provider_type || null,
    verificationStatus: row.verification_status || null
  };
}

async function createRegisteredUser(client, registration, passwordHash) {
  const user = await client.query(
    `INSERT INTO users (role, name, email, phone, password_hash, email_verified)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, role, name, email, phone, status, email_verified`,
    [registration.role, registration.name, registration.email, registration.phone, passwordHash]
  );
  const created = user.rows[0];
  if (registration.role === "CUSTOMER") {
    await client.query(
      "INSERT INTO customer_profiles (user_id, address, city, locality, pin_code) VALUES ($1, $2, $3, $4, $5)",
      [created.id, registration.address, registration.city, registration.locality, registration.pinCode || ""]
    );
    return created;
  }

  const provider = await client.query(
    `INSERT INTO provider_profiles (user_id, provider_type, description, experience_years)
     VALUES ($1, $2, $3, $4) RETURNING provider_type, verification_status`,
    [
      created.id,
      registration.role === "BUSINESS_PROVIDER" ? "BUSINESS" : "INDIVIDUAL",
      registration.description,
      registration.experienceYears
    ]
  );
  if (registration.role === "BUSINESS_PROVIDER") {
    await client.query(
      `INSERT INTO business_profiles (user_id, business_name, address, city, locality, pin_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        created.id,
        registration.businessName,
        registration.address,
        registration.city,
        registration.locality,
        registration.pinCode || ""
      ]
    );
    created.name = registration.businessName;
  }
  for (const categoryName of registration.categories) {
    const category = await client.query(
      "SELECT id FROM service_categories WHERE lower(name)=lower($1) AND active=true",
      [categoryName]
    );
    if (!category.rows[0]) {
      throw new HttpError(400, `The service category "${categoryName}" is not available.`, "CATEGORY_NOT_FOUND");
    }
    await client.query(
      "INSERT INTO provider_categories (provider_id,category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [created.id, category.rows[0].id]
    );
  }
  for (const area of registration.serviceAreas) {
    await client.query(
      "INSERT INTO provider_service_areas (provider_id,city,locality,pin_code) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [created.id, area.city, area.locality, area.pinCode]
    );
  }
  created.provider_type = provider.rows[0].provider_type;
  created.verification_status = provider.rows[0].verification_status;
  return created;
}

export function createAuthRouter({
  database = pool,
  runTransaction = transaction,
  deliverEmail = sendOtpEmail
} = {}) {
const router = Router();

router.post("/register", validate(schemas.register), asyncRoute(async (req, res) => {
  const data = req.body;
  const passwordHash = await bcrypt.hash(data.password, 12);
  const pendingId = randomUUID();
  const otp = generateOtp();
  const now = new Date();
  const registrationData = { ...data };
  delete registrationData.password;
  await runTransaction(async (client) => {
    const lockKeys = [`email:${data.email}`, `phone:${data.phone}`].sort();
    for (const key of lockKeys) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    }
    await client.query("DELETE FROM pending_registrations WHERE registration_expires_at <= now()");
    const existing = await client.query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2 LIMIT 1",
      [data.email, data.phone]
    );
    if (existing.rowCount) {
      throw new HttpError(409, "That email address or phone number is already registered.", "CONFLICT");
    }
    const pending = await client.query(
      "SELECT id FROM pending_registrations WHERE email = $1 OR phone = $2 LIMIT 1",
      [data.email, data.phone]
    );
    if (pending.rowCount) {
      throw new HttpError(409, "A registration for that email address or phone number is already pending. Verify it or request a new code.", "REGISTRATION_PENDING");
    }
    await client.query(
      `INSERT INTO pending_registrations
         (id, role, email, phone, registration_data, password_hash, otp_hash,
          otp_expires_at, registration_expires_at, resend_window_started_at, last_sent_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $10)`,
      [
        pendingId,
        data.role,
        data.email,
        data.phone,
        JSON.stringify(registrationData),
        passwordHash,
        hashOtp(pendingId, otp),
        new Date(now.getTime() + OTP_EXPIRY_MS),
        new Date(now.getTime() + REGISTRATION_EXPIRY_MS),
        now
      ]
    );
  });
  await deliverEmail(data.email, otp);
  return res.status(201).json({
    data: { verificationRequired: true, email: data.email, role: data.role }
  });
}));

const sendOtpHandler = asyncRoute(async (req, res) => {
  await issueOtpForEmail(req.body.email, { runTransaction, deliverEmail });
  return res.status(202).json({
    data: { message: "If an eligible account exists, a verification code has been sent." }
  });
});

router.post("/send-otp", validate(schemas.sendOtp), sendOtpHandler);
router.post("/resend-otp", validate(schemas.sendOtp), sendOtpHandler);

router.post("/verify-otp", validate(schemas.verifyOtp), asyncRoute(async (req, res) => {
  const { email, otp } = req.body;
  const result = await runTransaction(async (client) => {
    const pendingResult = await client.query(
      `SELECT id, role, email, phone, registration_data, password_hash, otp_hash,
              otp_expires_at, registration_expires_at, attempt_count
       FROM pending_registrations
       WHERE email = $1
       FOR UPDATE`,
      [email]
    );
    const pending = pendingResult.rows[0];
    if (pending) {
      if (new Date(pending.registration_expires_at).getTime() <= Date.now()) {
        await client.query("DELETE FROM pending_registrations WHERE id = $1", [pending.id]);
        return { kind: "REGISTRATION_EXPIRED" };
      }
      if (new Date(pending.otp_expires_at).getTime() <= Date.now()) return { kind: "EXPIRED" };
      if (Number(pending.attempt_count) >= OTP_MAX_ATTEMPTS) return { kind: "LIMIT" };
      if (!matchesOtp(pending.id, otp, pending.otp_hash)) {
        const attemptResult = await client.query(
          `UPDATE pending_registrations
           SET attempt_count = attempt_count + 1, updated_at = now()
           WHERE id = $1 RETURNING attempt_count`,
          [pending.id]
        );
        return {
          kind: Number(attemptResult.rows[0].attempt_count) >= OTP_MAX_ATTEMPTS ? "LIMIT" : "INVALID"
        };
      }

      const registration = {
        ...pending.registration_data,
        role: pending.role,
        email: pending.email,
        phone: pending.phone || pending.registration_data?.phone
      };
      if (!schemas.register.shape.phone.safeParse(registration.phone).success) {
        throw new HttpError(400, "The pending registration has an invalid phone number. Please register again.", "REGISTRATION_PHONE_INVALID");
      }
      const created = await createRegisteredUser(client, registration, pending.password_hash);
      await client.query("DELETE FROM pending_registrations WHERE id = $1", [pending.id]);
      return { kind: "VERIFIED", user: created };
    }

    const userResult = await client.query(
      `SELECT id, email_verified
       FROM users
       WHERE email = $1 AND role IN ('CUSTOMER', 'INDIVIDUAL_PROVIDER', 'BUSINESS_PROVIDER')
       FOR UPDATE`,
      [email]
    );
    const user = userResult.rows[0];
    if (!user) return { kind: "INVALID" };
    if (user.email_verified) return { kind: "VERIFIED" };

    const otpResult = await client.query(
      `SELECT otp_hash, expires_at, attempt_count
       FROM email_verification_otps WHERE user_id = $1 FOR UPDATE`,
      [user.id]
    );
    const record = otpResult.rows[0];
    if (!record) return { kind: "INVALID" };
    if (new Date(record.expires_at).getTime() <= Date.now()) return { kind: "EXPIRED" };
    if (Number(record.attempt_count) >= OTP_MAX_ATTEMPTS) return { kind: "LIMIT" };
    if (!matchesOtp(user.id, otp, record.otp_hash, process.env.JWT_SECRET)) {
      const attemptResult = await client.query(
        `UPDATE email_verification_otps
         SET attempt_count = attempt_count + 1, updated_at = now()
         WHERE user_id = $1 RETURNING attempt_count`,
        [user.id]
      );
      return {
        kind: Number(attemptResult.rows[0].attempt_count) >= OTP_MAX_ATTEMPTS ? "LIMIT" : "INVALID"
      };
    }

    await client.query(
      "UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1",
      [user.id]
    );
    await client.query("DELETE FROM email_verification_otps WHERE user_id = $1", [user.id]);
    return { kind: "VERIFIED" };
  });

  if (result.kind === "REGISTRATION_EXPIRED") {
    throw new HttpError(400, "This pending registration expired. Please register again.", "REGISTRATION_EXPIRED");
  }
  if (result.kind === "EXPIRED") {
    throw new HttpError(400, "That verification code has expired. Request a new one.", "OTP_EXPIRED");
  }
  if (result.kind === "LIMIT") {
    throw new HttpError(429, "Too many incorrect verification attempts. Request a new code.", "OTP_ATTEMPTS_EXCEEDED");
  }
  if (result.kind === "INVALID") {
    throw new HttpError(400, "The verification code is invalid.", "OTP_INVALID");
  }
  return res.json({
    data: {
      verified: true,
      ...(result.user ? { user: publicUser(result.user) } : {})
    }
  });
}));

router.post("/login", validate(schemas.login), asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const result = await database.query(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.password_hash, u.status, u.email_verified,
            p.provider_type, p.verification_status, b.business_name
     FROM users u
     LEFT JOIN provider_profiles p ON p.user_id = u.id
     LEFT JOIN business_profiles b ON b.user_id = u.id
     WHERE u.email = $1`,
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  }
  if (user.status !== "ACTIVE") {
    throw new HttpError(403, "This account is not active.", "ACCOUNT_INACTIVE");
  }
  if (user.role !== "ADMIN" && !user.email_verified) {
    throw new HttpError(403, "Verify your email address before signing in.", "EMAIL_NOT_VERIFIED");
  }
  if (user.business_name) user.name = user.business_name;
  signInCookies(res, user);
  return res.json({ data: { user: publicUser(user) } });
}));

router.post("/logout", requireCsrf, (req, res) => {
  clearAuthCookies(res);
  res.json({ data: { loggedOut: true } });
});

router.get("/me", authenticate, asyncRoute(async (req, res) => {
  const result = await database.query(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.status, u.email_verified,
            p.provider_type, p.verification_status, b.business_name
     FROM users u
     LEFT JOIN provider_profiles p ON p.user_id = u.id
     LEFT JOIN business_profiles b ON b.user_id = u.id
     WHERE u.id = $1`,
    [req.auth.id]
  );
  if (!result.rows[0]) throw new HttpError(401, "The account no longer exists.", "AUTH_INVALID");
  const user = result.rows[0];
  if (user.business_name) user.name = user.business_name;
  return res.json({ data: { user: publicUser(user) } });
}));

return router;
}

export default createAuthRouter();
