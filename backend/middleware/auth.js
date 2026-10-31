import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { HttpError } from "./errors.js";

const authCookie = "sethu_session";
const csrfCookie = "sethu_csrf";

export function signInCookies(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h", issuer: "sethu-api", audience: "sethu-web" }
  );
  const csrf = randomUUID();
  const secure = process.env.COOKIE_SECURE === "true";
  res.cookie(authCookie, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  });
  res.cookie(csrfCookie, csrf, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  });
}

export function clearAuthCookies(res) {
  const secure = process.env.COOKIE_SECURE === "true";
  for (const name of [authCookie, csrfCookie]) {
    res.clearCookie(name, { httpOnly: name === authCookie, secure, sameSite: "strict", path: "/" });
  }
}

export function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookie = req.cookies?.[csrfCookie];
  const header = req.get("x-csrf-token");
  if (!cookie || !header || cookie !== header) {
    return next(new HttpError(403, "The security token is missing or invalid.", "CSRF_INVALID"));
  }
  return next();
}

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[authCookie];
    if (!token) throw new HttpError(401, "Please sign in to continue.", "AUTH_REQUIRED");
    const claims = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "sethu-api",
      audience: "sethu-web"
    });
    const user = await pool.query("SELECT id,role,status FROM users WHERE id=$1", [claims.sub]);
    if (!user.rows[0] || user.rows[0].status !== "ACTIVE") {
      throw new HttpError(401, "This account is not active.", "ACCOUNT_INACTIVE");
    }
    req.auth = { id: Number(user.rows[0].id), role: user.rows[0].role };
    return next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return next(new HttpError(401, "Your session is invalid or has expired.", "AUTH_INVALID"));
    }
    return next(error);
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new HttpError(403, "You do not have permission to perform this action.", "FORBIDDEN"));
    }
    return next();
  };
}
