import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import adminRoutes from "./routes/admin.js";
import { authenticate, requireCsrf } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errors.js";

export const app = express();
const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5175",
  "http://127.0.0.1:5175"
];
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://i.pravatar.cc"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"]
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later.", code: "RATE_LIMITED" }
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many verification code requests. Try again later.", code: "RATE_LIMITED" }
});
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Try again later.", code: "RATE_LIMITED" }
});
app.use("/api/auth/send-otp", otpSendLimiter);
app.use("/api/auth/resend-otp", otpSendLimiter);
app.use("/api/auth/verify-otp", otpVerifyLimiter);
app.use("/api/auth", authRoutes);
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "uploads"), {
  fallthrough: false,
  index: false,
  dotfiles: "deny",
  maxAge: "1d"
}));
app.use("/api/admin", authenticate, requireCsrf, adminRoutes);
app.use("/api", apiRoutes);
app.use((req, res) => res.status(404).json({ error: "Route not found.", code: "NOT_FOUND" }));
app.use(errorHandler);
