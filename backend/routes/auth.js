import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool, transaction } from "../db.js";
import { authenticate, clearAuthCookies, requireCsrf, signInCookies } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../middleware/errors.js";
import { schemas, validate } from "../middleware/validation.js";

const router = Router();

function publicUser(row) {
  return {
    id: Number(row.id),
    role: row.role,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    providerType: row.provider_type || null,
    verificationStatus: row.verification_status || null
  };
}

router.post("/register", validate(schemas.register), asyncRoute(async (req, res) => {
  const data = req.body;
  if (data.role === "BUSINESS_PROVIDER" && !data.businessName) {
    throw new HttpError(400, "Business name is required for a business account.", "VALIDATION_ERROR");
  }
  const passwordHash = await bcrypt.hash(data.password, 12);
  const result = await transaction(async (client) => {
    const user = await client.query(
      `INSERT INTO users (role, name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, role, name, email, phone, status`,
      [data.role, data.name, data.email, data.phone, passwordHash]
    );
    const created = user.rows[0];
    if (data.role === "CUSTOMER") {
      await client.query(
        "INSERT INTO customer_profiles (user_id, address, city, locality, pin_code) VALUES ($1, $2, $3, $4, $5)",
        [created.id, data.address, data.city, data.locality, data.pinCode || ""]
      );
    } else {
      const provider = await client.query(
        `INSERT INTO provider_profiles (user_id, provider_type, description, experience_years)
         VALUES ($1, $2, $3, $4) RETURNING provider_type, verification_status`,
        [created.id, data.role === "BUSINESS_PROVIDER" ? "BUSINESS" : "INDIVIDUAL", data.description, data.experienceYears]
      );
      if (data.role === "BUSINESS_PROVIDER") {
        await client.query(
          `INSERT INTO business_profiles (user_id, business_name, address, city, locality, pin_code)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [created.id, data.businessName, data.address, data.city, data.locality, data.pinCode || ""]
        );
        created.name = data.businessName;
      }
      for (const categoryName of data.categories) {
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
      for (const area of data.serviceAreas) {
        await client.query(
          "INSERT INTO provider_service_areas (provider_id,city,locality,pin_code) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [created.id, area.city, area.locality, area.pinCode]
        );
      }
      created.provider_type = provider.rows[0].provider_type;
      created.verification_status = provider.rows[0].verification_status;
    }
    return created;
  });
  signInCookies(res, result);
  return res.status(201).json({ data: { user: publicUser(result) } });
}));

router.post("/login", validate(schemas.login), asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.password_hash, u.status,
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
  if (user.business_name) user.name = user.business_name;
  signInCookies(res, user);
  return res.json({ data: { user: publicUser(user) } });
}));

router.post("/logout", requireCsrf, (req, res) => {
  clearAuthCookies(res);
  res.json({ data: { loggedOut: true } });
});

router.get("/me", authenticate, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.status,
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

export default router;
