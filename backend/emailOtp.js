
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { transaction } from "./db.js";
import { HttpError } from "./middleware/errors.js";

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const REGISTRATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_RESENDS = 3;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(identity, otp, secret = process.env.JWT_SECRET) {
  if (!secret) {
    throw new HttpError(503, "OTP verification is not configured.", "OTP_NOT_CONFIGURED");
  }
  return createHmac("sha256", secret)
    .update(`${identity}:${otp}`)
    .digest("hex");
}

export function matchesOtp(identity, otp, storedHash, secret = process.env.JWT_SECRET) {
  if (!/^[a-f0-9]{64}$/i.test(storedHash || "")) return false;
  const expected = Buffer.from(hashOtp(identity, otp, secret), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return timingSafeEqual(expected, actual);
}

export function getResendState({ resendCount, windowStartedAt, lastSentAt, now }) {
  const windowStart = new Date(windowStartedAt).getTime();
  const windowExpired = now - windowStart >= OTP_RESEND_WINDOW_MS;
  const count = windowExpired ? 0 : Number(resendCount);

  if (!windowExpired && now - new Date(lastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { allowed: false, reason: "COOLDOWN" };
  }
  if (count >= OTP_MAX_RESENDS) {
    return { allowed: false, reason: "LIMIT" };
  }
  return {
    allowed: true,
    resendCount: count + 1,
    windowStartedAt: windowExpired ? new Date(now) : new Date(windowStart)
  };
}

function logDeliveryFailure(error) {
  console.error("Verification email delivery failed", {
    code: error?.code,
    responseCode: error?.responseCode,
    message: error?.message
  });
}

export async function sendOtpEmail(to, otp, { fetchImpl = fetch } = {}) {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    throw new HttpError(
      503,
      "Email verification is not configured.",
      "EMAIL_NOT_CONFIGURED"
    );
  }

  try {
    const response = await fetchImpl(
      "https://api.emailjs.com/api/v1.0/email/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          accessToken: privateKey,
          template_params: {
            to_email: to,
            otp_code: otp
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`EmailJS returned status ${response.status}`);
    }
  } catch (error) {
    logDeliveryFailure(error);
    throw new HttpError(
      502,
      "Verification email could not be sent. Please try again later.",
      "EMAIL_DELIVERY_FAILED"
    );
  }
}

export async function issueOtpForEmail(
  email,
  { runTransaction = transaction, deliverEmail = sendOtpEmail } = {}
) {
  const otp = generateOtp();
  const now = new Date();

  const issue = await runTransaction(async (client) => {
    await client.query(
      "DELETE FROM pending_registrations WHERE registration_expires_at <= now() AND email = $1",
      [email]
    );

    const pendingResult = await client.query(
      `SELECT id, email, resend_count, resend_window_started_at, last_sent_at
       FROM pending_registrations
       WHERE email = $1 AND registration_expires_at > now()
       FOR UPDATE`,
      [email]
    );

    if (pendingResult.rows[0]) {
      const pending = pendingResult.rows[0];
      const state = getResendState({
        resendCount: pending.resend_count,
        windowStartedAt: pending.resend_window_started_at,
        lastSentAt: pending.last_sent_at,
        now: now.getTime()
      });

      if (!state.allowed) return { kind: "RATE_LIMITED" };

      await client.query(
        `UPDATE pending_registrations
         SET otp_hash = $2, otp_expires_at = $3, attempt_count = 0, resend_count = $4,
             resend_window_started_at = $5, last_sent_at = $6, updated_at = $6
         WHERE id = $1`,
        [
          pending.id,
          hashOtp(pending.id, otp),
          new Date(now.getTime() + OTP_EXPIRY_MS),
          state.resendCount,
          state.windowStartedAt,
          now
        ]
      );

      return { kind: "ISSUED", email: pending.email };
    }

    const userResult = await client.query(
      `SELECT id, email, email_verified
       FROM users
       WHERE email = $1 AND role IN ('CUSTOMER', 'INDIVIDUAL_PROVIDER', 'BUSINESS_PROVIDER')
       FOR UPDATE`,
      [email]
    );

    const user = userResult.rows[0];
    if (!user || user.email_verified) return { kind: "NO_SEND" };

    const otpResult = await client.query(
      "SELECT resend_count, resend_window_started_at, last_sent_at FROM email_verification_otps WHERE user_id = $1 FOR UPDATE",
      [user.id]
    );

    const existing = otpResult.rows[0];
    let resendCount = 0;
    let windowStartedAt = now;

    if (existing) {
      const state = getResendState({
        resendCount: existing.resend_count,
        windowStartedAt: existing.resend_window_started_at,
        lastSentAt: existing.last_sent_at,
        now: now.getTime()
      });

      if (!state.allowed) return { kind: "RATE_LIMITED" };

      resendCount = state.resendCount;
      windowStartedAt = state.windowStartedAt;
    }

    const values = [
      user.id,
      hashOtp(user.id, otp),
      new Date(now.getTime() + OTP_EXPIRY_MS),
      resendCount,
      windowStartedAt,
      now
    ];

    if (existing) {
      await client.query(
        `UPDATE email_verification_otps
         SET otp_hash = $2, expires_at = $3, attempt_count = 0, resend_count = $4,
             resend_window_started_at = $5, last_sent_at = $6, updated_at = $6
         WHERE user_id = $1`,
        values
      );
    } else {
      await client.query(
        `INSERT INTO email_verification_otps
           (user_id, otp_hash, expires_at, attempt_count, resend_count, resend_window_started_at, last_sent_at)
         VALUES ($1, $2, $3, 0, $4, $5, $6)`,
        values
      );
    }

    return { kind: "ISSUED", email: user.email };
  });

  if (issue.kind === "RATE_LIMITED") {
    throw new HttpError(
      429,
      "Too many verification code requests. Wait before requesting another.",
      "OTP_RATE_LIMITED"
    );
  }

  if (issue.kind === "ISSUED") {
    await deliverEmail(issue.email, otp);
  }
}
