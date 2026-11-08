import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pool, transaction } from "../db.js";
import { generateOtp, hashOtp, issueOtpForEmail } from "../emailOtp.js";
import { authenticate, allowRoles, requireCsrf } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../middleware/errors.js";
import { assert, schemas, validate } from "../middleware/validation.js";

const router = Router();
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new HttpError(400, "Upload a PNG, JPEG or WebP image.", "UPLOAD_TYPE_INVALID"));
    }
    return callback(null, true);
  }
});
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)) {
      return callback(new HttpError(400, "Upload a PDF, JPEG or PNG document.", "UPLOAD_TYPE_INVALID"));
    }
    return callback(null, true);
  }
});

router.get("/health", asyncRoute(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ data: { status: "ok", database: "connected" } });
}));

router.get("/categories", asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT id, name, slug FROM service_categories WHERE active = true ORDER BY name");
  res.json({ data: result.rows });
}));

router.get("/search", asyncRoute(async (req, res) => {
  const { service = "", category = "", city = "", locality = "", pin = "", providerType = "", location = "", page = "1" } = req.query;
  const pageNumber = Math.max(1, Math.min(10000, Number.parseInt(page, 10) || 1));
  const limit = 20;
  const result = await pool.query(
    `SELECT u.id AS provider_id, u.name AS provider_name, u.phone, u.is_sample,
            p.provider_type, p.description, p.experience_years,
            b.business_name, b.logo_path,
            s.id AS service_id, s.name AS service_name, s.description AS service_description,
            s.pricing_type, s.price_min, s.price_max, c.name AS category, c.slug AS category_slug,
            round(avg(r.rating)::numeric, 1) AS rating, count(DISTINCT r.id)::int AS review_count,
            json_agg(DISTINCT jsonb_build_object('city', a.city, 'locality', a.locality, 'pinCode', a.pin_code)) AS areas
     FROM services s
     JOIN provider_profiles p ON p.user_id = s.provider_id AND p.verification_status = 'APPROVED'
     JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE'
     LEFT JOIN business_profiles b ON b.user_id = p.user_id
     JOIN service_categories c ON c.id = s.category_id AND c.active
     JOIN service_areas a ON a.service_id = s.id
     LEFT JOIN reviews r ON r.provider_id = p.user_id
     WHERE s.active
       AND ($1 = '' OR s.name ILIKE '%' || $1 || '%' OR s.description ILIKE '%' || $1 || '%')
       AND ($2 = '' OR c.slug = $2 OR lower(c.name) = lower($2))
       AND ($3 = '' OR a.city ILIKE '%' || $3 || '%')
       AND ($4 = '' OR a.locality ILIKE '%' || $4 || '%')
       AND ($5 = '' OR a.pin_code = $5)
       AND ($6 = '' OR p.provider_type = $6)
       AND ($7 = '' OR a.city ILIKE '%' || $7 || '%' OR a.locality ILIKE '%' || $7 || '%' OR a.pin_code ILIKE '%' || $7 || '%')
     GROUP BY u.id, p.user_id, b.user_id, s.id, c.id
     ORDER BY rating DESC NULLS LAST, s.created_at DESC
     LIMIT $8 OFFSET $9`,
    [service, category, city, locality, pin, providerType, location, limit, (pageNumber - 1) * limit]
  );
  res.json({ data: result.rows, pagination: { page: pageNumber, limit, hasMore: result.rows.length === limit } });
}));

router.get("/providers/:id", asyncRoute(async (req, res) => {
  assert(/^\d+$/.test(req.params.id), 400, "Provide a valid provider ID.");
  const result = await pool.query(
    `SELECT u.id AS provider_id,u.name AS provider_name,u.is_sample,
            p.provider_type,p.description,p.experience_years,
            b.business_name,b.logo_path,
            COALESCE((
              SELECT json_agg(jsonb_build_object(
                'serviceId',s.id,'name',s.name,'description',s.description,
                'pricingType',s.pricing_type,'priceMin',s.price_min,'priceMax',s.price_max,
                'category',c.name,'categorySlug',c.slug
              ) ORDER BY s.created_at DESC)
              FROM services s JOIN service_categories c ON c.id=s.category_id
              WHERE s.provider_id=u.id AND s.active AND c.active
            ),'[]'::json) AS services,
            COALESCE((
              SELECT json_agg(DISTINCT jsonb_build_object(
                'city',a.city,'locality',a.locality,'pinCode',a.pin_code
              ))
              FROM services s JOIN service_areas a ON a.service_id=s.id
              WHERE s.provider_id=u.id AND s.active
            ),'[]'::json) AS areas,
            COALESCE((
              SELECT round(avg(r.rating)::numeric,1)
              FROM reviews r WHERE r.provider_id=u.id
            ),0) AS rating,
            (SELECT count(*)::int FROM reviews r WHERE r.provider_id=u.id) AS review_count,
            COALESCE((
              SELECT json_agg(jsonb_build_object(
                'rating',r.rating,'body',r.body,'createdAt',r.created_at,
                'customerName',customer.name,'serviceName',s.name
              ) ORDER BY r.created_at DESC)
              FROM reviews r
              JOIN users customer ON customer.id=r.customer_id
              JOIN bookings booking ON booking.id=r.booking_id
              JOIN services s ON s.id=booking.service_id
              WHERE r.provider_id=u.id
            ),'[]'::json) AS reviews
     FROM users u
     JOIN provider_profiles p ON p.user_id=u.id
     LEFT JOIN business_profiles b ON b.user_id=u.id
     WHERE u.id=$1 AND u.status='ACTIVE' AND p.verification_status='APPROVED'`,
    [req.params.id]
  );
  assert(result.rows[0], 404, "Provider profile not found.");
  res.json({ data: result.rows[0] });
}));

router.get("/providers/:id/slots", asyncRoute(async (req, res) => {
  const date = String(req.query.date || "");
  const serviceId = Number(req.query.serviceId);
  const timezone = process.env.APP_TIME_ZONE || "Asia/Kolkata";
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)), 400, "Provide a valid appointment date.");
  assert(Number.isInteger(serviceId) && serviceId > 0, 400, "Provide a valid service ID.");
  const result = await pool.query(
    `WITH schedule AS (
       SELECT a.start_time,a.end_time,a.appointment_minutes FROM provider_availability a
       JOIN provider_profiles p ON p.user_id=a.provider_id AND p.verification_status='APPROVED'
       JOIN users u ON u.id=p.user_id AND u.status='ACTIVE' AND NOT u.is_sample
       JOIN services s ON s.provider_id=a.provider_id AND s.id=$4 AND s.active
         AND s.duration_minutes=a.appointment_minutes
       WHERE a.provider_id=$1 AND a.weekday=extract(dow from $2::date)::int
     ), slots AS (
       SELECT slot_start,slot_start + schedule.appointment_minutes * interval '1 minute' AS slot_end
       FROM schedule,
       LATERAL generate_series(
         ($2::date + schedule.start_time) AT TIME ZONE $3,
         (($2::date + schedule.end_time) AT TIME ZONE $3) - schedule.appointment_minutes * interval '1 minute',
         schedule.appointment_minutes * interval '1 minute'
       ) AS slot_start
     )
     SELECT slot_start,slot_end FROM slots
     WHERE slot_start > now()
       AND NOT EXISTS (SELECT 1 FROM blocked_slots b WHERE b.provider_id=$1 AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
       AND NOT EXISTS (SELECT 1 FROM service_requests r WHERE r.provider_id=$1 AND r.status IN ('PENDING','ACCEPTED','IN_PROGRESS') AND r.expires_at > now() AND tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.provider_id=$1 AND b.status IN ('CONFIRMED','IN_PROGRESS') AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot_start,slot_end,'[)'))
     ORDER BY slot_start`,
    [req.params.id, date, timezone, serviceId]
  );
  res.json({ data: result.rows });
}));

router.use(authenticate, requireCsrf);

router.get("/profile", asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.status, u.created_at,
            cp.address, cp.city, cp.locality, cp.pin_code,
            p.provider_type, p.description, p.experience_years, p.verification_status, p.verification_reason,
            b.business_name, b.logo_path, b.address AS business_address, b.city AS business_city,
            b.locality AS business_locality, b.pin_code AS business_pin_code,
            COALESCE((SELECT json_agg(c.name ORDER BY c.name) FROM provider_categories pc
              JOIN service_categories c ON c.id=pc.category_id WHERE pc.provider_id=u.id),'[]') AS categories,
            COALESCE((SELECT json_agg(jsonb_build_object('city',a.city,'locality',a.locality,'pinCode',a.pin_code))
              FROM provider_service_areas a WHERE a.provider_id=u.id),'[]') AS areas
     FROM users u
     LEFT JOIN customer_profiles cp ON cp.user_id = u.id
     LEFT JOIN provider_profiles p ON p.user_id = u.id
     LEFT JOIN business_profiles b ON b.user_id = u.id
     WHERE u.id = $1`,
    [req.auth.id]
  );
  assert(result.rows[0], 404, "Profile not found.");
  const row = result.rows[0];
  if (row.business_name) row.name = row.business_name;
  res.json({ data: row });
}));

router.patch("/profile", asyncRoute(async (req, res) => {
  const { name, email, phone, description, experienceYears, address, city, locality, pinCode, businessName } = req.body;
  const requestedEmail = email ? String(email).trim().toLowerCase() : null;
  const categories = req.body.categories;
  const serviceAreas = req.body.serviceAreas;
  assert(!requestedEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail), 400, "Enter a valid email address.");
  if (categories !== undefined) assert(Array.isArray(categories) && categories.length <= 20, 400, "Invalid provider categories.");
  if (serviceAreas !== undefined) assert(Array.isArray(serviceAreas) && serviceAreas.length <= 100, 400, "Invalid provider service areas.");
  const changedEmail = await transaction(async (client) => {
    const currentUser = await client.query(
      "SELECT email, role FROM users WHERE id = $1 FOR UPDATE",
      [req.auth.id]
    );
    assert(currentUser.rows[0], 404, "Profile not found.");
    const emailChanged = Boolean(
      requestedEmail &&
      requestedEmail !== currentUser.rows[0].email &&
      currentUser.rows[0].role !== "ADMIN"
    );
    const user = await client.query(
      `UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email),
       email_verified = CASE WHEN $5 THEN false ELSE email_verified END,
       phone = COALESCE($4, phone), updated_at = now()
       WHERE id = $1 RETURNING email, role`,
      [req.auth.id, name || null, requestedEmail, phone || null, emailChanged]
    );
    assert(user.rowCount, 404, "Profile not found.");
    if (emailChanged) {
      const otpRecord = await client.query(
        "SELECT user_id FROM email_verification_otps WHERE user_id = $1 FOR UPDATE",
        [req.auth.id]
      );
      if (otpRecord.rowCount) {
        await client.query(
          `UPDATE email_verification_otps
           SET otp_hash = $2, expires_at = now(), attempt_count = 0, updated_at = now()
           WHERE user_id = $1`,
          [req.auth.id, hashOtp(req.auth.id, generateOtp(), process.env.JWT_SECRET)]
        );
      }
    }
    if (req.auth.role === "CUSTOMER") {
      await client.query(
        `UPDATE customer_profiles SET address = COALESCE($2, address), city = COALESCE($3, city),
         locality = COALESCE($4, locality), pin_code = COALESCE($5, pin_code) WHERE user_id = $1`,
        [req.auth.id, address ?? null, city ?? null, locality ?? null, pinCode ?? null]
      );
    } else {
      await client.query(
        `UPDATE provider_profiles SET description = COALESCE($2, description),
         experience_years = COALESCE($3, experience_years) WHERE user_id = $1`,
        [req.auth.id, description ?? null, experienceYears ?? null]
      );
      if (req.auth.role === "BUSINESS_PROVIDER") {
        await client.query(
          `UPDATE business_profiles SET business_name = COALESCE($2, business_name),
           address = COALESCE($3, address), city = COALESCE($4, city),
           locality = COALESCE($5, locality), pin_code = COALESCE($6, pin_code)
           WHERE user_id = $1`,
          [req.auth.id, businessName ?? null, address ?? null, city ?? null, locality ?? null, pinCode ?? null]
        );
      }
      if (categories !== undefined) {
        await client.query("DELETE FROM provider_categories WHERE provider_id=$1", [req.auth.id]);
        for (const categoryName of categories) {
          const category = await client.query("SELECT id FROM service_categories WHERE lower(name)=lower($1) AND active", [categoryName]);
          assert(category.rows[0], 400, `The service category "${categoryName}" is unavailable.`);
          await client.query("INSERT INTO provider_categories (provider_id,category_id) VALUES ($1,$2)", [req.auth.id, category.rows[0].id]);
        }
      }
      if (serviceAreas !== undefined) {
        await client.query("DELETE FROM provider_service_areas WHERE provider_id=$1", [req.auth.id]);
        for (const area of serviceAreas) {
          assert(area && typeof area.city === "string" && area.city.trim().length >= 2 &&
            typeof area.locality === "string" && area.locality.trim().length >= 2 &&
            /^\d{6}$/.test(area.pinCode || ""), 400, "Each service area needs a city, locality and six-digit PIN code.");
          await client.query(
            "INSERT INTO provider_service_areas (provider_id,city,locality,pin_code) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [req.auth.id, area.city.trim(), area.locality.trim(), area.pinCode]
          );
        }
      }
    }
    return emailChanged ? user.rows[0].email : null;
  });
  if (changedEmail) await issueOtpForEmail(changedEmail);
  res.json({ data: { updated: true } });
}));

router.post("/profile/logo", allowRoles("BUSINESS_PROVIDER"), imageUpload.single("logo"), asyncRoute(async (req, res) => {
  assert(req.file, 400, "Select a business logo image.");
  assert(isSupportedImage(req.file), 400, "The selected file is not a valid supported image.");
  const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[req.file.mimetype];
  const fileName = `${randomUUID()}${extension}`;
  await writeFile(path.join(uploadDirectory, fileName), req.file.buffer, { flag: "wx" });
  const logoPath = `/uploads/${fileName}`;
  await pool.query("UPDATE business_profiles SET logo_path = $2 WHERE user_id = $1", [req.auth.id, logoPath]);
  res.json({ data: { logoPath } });
}));

router.post("/profile/documents", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), documentUpload.single("document"), asyncRoute(async (req, res) => {
  assert(req.file, 400, "Select a verification document.");
  assert(isSupportedDocument(req.file), 400, "The selected file is not a valid supported document.");
  const directory = path.resolve(process.env.PRIVATE_UPLOAD_DIR || "private-uploads");
  await mkdir(directory, { recursive: true });
  const extension = req.file.mimetype === "application/pdf" ? ".pdf" : req.file.mimetype === "image/png" ? ".png" : ".jpg";
  const storageName = `${randomUUID()}${extension}`;
  await writeFile(path.join(directory, storageName), req.file.buffer, { flag: "wx" });
  const result = await pool.query(
    `INSERT INTO provider_documents (provider_id,original_name,storage_name,mime_type,size_bytes)
     VALUES ($1,$2,$3,$4,$5) RETURNING id,original_name,mime_type,size_bytes,created_at`,
    [req.auth.id, path.basename(req.file.originalname).slice(0, 200), storageName, req.file.mimetype, req.file.size]
  );
  res.status(201).json({ data: result.rows[0] });
}));

router.get("/services", asyncRoute(async (req, res) => {
  const providerId = req.auth.role === "ADMIN" ? Number(req.query.providerId) : req.auth.id;
  assert(providerId, 400, "Provider ID is required.");
  const result = await pool.query(
    `SELECT s.*, c.name AS category, c.slug AS category_slug,
            COALESCE(json_agg(jsonb_build_object('city', a.city, 'locality', a.locality, 'pinCode', a.pin_code))
              FILTER (WHERE a.id IS NOT NULL), '[]') AS areas
     FROM services s JOIN service_categories c ON c.id = s.category_id
     LEFT JOIN service_areas a ON a.service_id = s.id
     WHERE s.provider_id = $1 GROUP BY s.id, c.id ORDER BY s.created_at DESC`,
    [providerId]
  );
  if (req.auth.role !== "ADMIN") {
    res.json({ data: result.rows });
    return;
  }
  res.json({ data: result.rows });
}));

router.post("/services", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), validate(schemas.service), asyncRoute(async (req, res) => {
  const service = req.body;
  const created = await transaction(async (client) => {
    const provider = await client.query("SELECT verification_status FROM provider_profiles WHERE user_id = $1", [req.auth.id]);
    assert(provider.rows[0], 404, "Provider profile not found.");
    const category = await client.query("SELECT id FROM service_categories WHERE id=$1 AND active", [service.categoryId]);
    assert(category.rows[0], 400, "The selected service category is unavailable.");
    const result = await client.query(
      `INSERT INTO services (provider_id, category_id, name, description, pricing_type, price_min, price_max, duration_minutes, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth.id, service.categoryId, service.name, service.description, service.pricingType, service.priceMin, service.pricingType === "RANGE" ? service.priceMax : null, service.durationMinutes, service.active]
    );
    await replaceServiceAreas(client, result.rows[0].id, service.areas);
    return result.rows[0];
  });
  res.status(201).json({ data: created });
}));

router.patch("/services/:id", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), validate(schemas.service), asyncRoute(async (req, res) => {
  const service = req.body;
  const updated = await transaction(async (client) => {
    const category = await client.query("SELECT id FROM service_categories WHERE id=$1 AND active", [service.categoryId]);
    assert(category.rows[0], 400, "The selected service category is unavailable.");
    const result = await client.query(
      `UPDATE services SET category_id=$3,name=$4,description=$5,pricing_type=$6,price_min=$7,
       price_max=$8,duration_minutes=$9,active=$10,updated_at=now()
       WHERE id=$1 AND provider_id=$2 RETURNING *`,
      [req.params.id, req.auth.id, service.categoryId, service.name, service.description, service.pricingType, service.priceMin, service.pricingType === "RANGE" ? service.priceMax : null, service.durationMinutes, service.active]
    );
    assert(result.rowCount, 404, "Service not found.");
    await replaceServiceAreas(client, result.rows[0].id, service.areas);
    return result.rows[0];
  });
  res.json({ data: updated });
}));

router.delete("/services/:id", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM services WHERE id=$1 AND provider_id=$2", [req.params.id, req.auth.id]);
  assert(result.rowCount, 404, "Service not found.");
  res.status(204).end();
}));

async function replaceServiceAreas(client, serviceId, areas) {
  await client.query("DELETE FROM service_areas WHERE service_id = $1", [serviceId]);
  for (const area of areas) {
    await client.query(
      "INSERT INTO service_areas (service_id, city, locality, pin_code) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [serviceId, area.city, area.locality, area.pinCode]
    );
  }
}

router.get("/availability", asyncRoute(async (req, res) => {
  const providerId = req.auth.role === "CUSTOMER" ? Number(req.query.providerId) : req.auth.id;
  assert(providerId, 400, "Provider ID is required.");
  const [hours, blocked] = await Promise.all([
    pool.query("SELECT weekday, start_time, end_time, appointment_minutes FROM provider_availability WHERE provider_id=$1 ORDER BY weekday", [providerId]),
    pool.query("SELECT id, starts_at, ends_at, reason FROM blocked_slots WHERE provider_id=$1 AND ends_at > now() ORDER BY starts_at", [providerId])
  ]);
  res.json({ data: { availability: hours.rows, blockedSlots: blocked.rows } });
}));

router.put("/availability", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const days = req.body.days;
  assert(Array.isArray(days) && days.length > 0 && days.length <= 7, 400, "Select at least one working day.");
  const appointmentMinutes = Number(req.body.appointmentMinutes);
  assert(Number.isInteger(appointmentMinutes) && appointmentMinutes >= 15 && appointmentMinutes <= 480, 400, "Appointment duration must be from 15 to 480 minutes.");
  for (const day of days) {
    assert(Number.isInteger(day.weekday) && day.weekday >= 0 && day.weekday <= 6, 400, "Invalid weekday.");
    assert(/^\d{2}:\d{2}$/.test(day.startTime) && /^\d{2}:\d{2}$/.test(day.endTime) && day.endTime > day.startTime, 400, "Working hours are invalid.");
  }
  await transaction(async (client) => {
    await client.query("DELETE FROM provider_availability WHERE provider_id=$1", [req.auth.id]);
    for (const day of days) {
      await client.query(
        "INSERT INTO provider_availability (provider_id,weekday,start_time,end_time,appointment_minutes) VALUES ($1,$2,$3,$4,$5)",
        [req.auth.id, day.weekday, day.startTime, day.endTime, appointmentMinutes]
      );
    }
  });
  res.json({ data: { saved: true } });
}));

router.post("/availability/blocked-slots", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const startsAt = new Date(req.body.startsAt);
  const endsAt = new Date(req.body.endsAt);
  assert(Number.isFinite(startsAt.getTime()) && Number.isFinite(endsAt.getTime()) && endsAt > startsAt, 400, "Provide a valid blocked time range.");
  const result = await pool.query(
    "INSERT INTO blocked_slots (provider_id, starts_at, ends_at, reason) VALUES ($1,$2,$3,$4) RETURNING *",
    [req.auth.id, startsAt, endsAt, String(req.body.reason || "").slice(0, 300)]
  );
  res.status(201).json({ data: result.rows[0] });
}));

router.delete("/availability/blocked-slots/:id", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM blocked_slots WHERE id=$1 AND provider_id=$2", [req.params.id, req.auth.id]);
  assert(result.rowCount, 404, "Blocked time was not found.");
  res.status(204).end();
}));

router.get("/requests", asyncRoute(async (req, res) => {
  await expirePendingRequests();
  const query = req.auth.role === "CUSTOMER"
    ? `SELECT r.*, s.name AS service_name, u.name AS provider_name, b.business_name
       FROM service_requests r JOIN services s ON s.id=r.service_id JOIN users u ON u.id=r.provider_id
       LEFT JOIN business_profiles b ON b.user_id=u.id WHERE r.customer_id=$1 ORDER BY r.created_at DESC`
    : `SELECT r.*, s.name AS service_name, u.name AS customer_name, u.phone AS customer_phone
       FROM service_requests r JOIN services s ON s.id=r.service_id JOIN users u ON u.id=r.customer_id
       WHERE r.provider_id=$1 ORDER BY r.created_at DESC`;
  const result = await pool.query(query, [req.auth.id]);
  res.json({ data: result.rows });
}));

router.post("/requests", allowRoles("CUSTOMER"), validate(schemas.request), asyncRoute(async (req, res) => {
  const request = req.body;
  const start = new Date(request.startsAt);
  const end = new Date(request.endsAt);
  assert(end > start && end - start <= 24 * 60 * 60 * 1000, 400, "The appointment time range is invalid.");
  const created = await transaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [request.providerId]);
    const provider = await client.query(
      `SELECT p.verification_status, u.status, u.is_sample, s.provider_id, s.active, s.duration_minutes,
         EXISTS (SELECT 1 FROM service_areas a WHERE a.service_id=s.id
           AND lower(a.city)=lower($3) AND lower(a.locality)=lower($4) AND a.pin_code=$5) AS serves_area
       FROM provider_profiles p JOIN users u ON u.id=p.user_id
       JOIN services s ON s.id=$2 WHERE p.user_id=$1 FOR UPDATE`,
      [request.providerId, request.serviceId, request.city, request.locality, request.pinCode]
    );
    assert(provider.rows[0], 404, "Provider or service was not found.");
    assert(!provider.rows[0].is_sample, 409, "Sample providers are not accepting booking requests.");
    assert(provider.rows[0].verification_status === "APPROVED" && provider.rows[0].status === "ACTIVE", 403, "This provider is not available for new requests.");
    assert(Number(provider.rows[0].provider_id) === request.providerId && provider.rows[0].active, 400, "The selected service does not belong to this provider or is inactive.");
    assert(provider.rows[0].serves_area, 400, "The provider does not serve the selected location for this service.");
    const matchingHours = await client.query(
      `SELECT appointment_minutes FROM provider_availability
       WHERE provider_id=$1
         AND weekday=extract(dow from $2::timestamptz AT TIME ZONE $4)::int
         AND $3::timestamptz > $2::timestamptz
         AND ($2::timestamptz AT TIME ZONE $4)::time >= start_time
         AND ($3::timestamptz AT TIME ZONE $4)::time <= end_time
         AND mod(extract(epoch from (($2::timestamptz AT TIME ZONE $4)::time - start_time))::int, appointment_minutes * 60)=0
         AND extract(epoch from ($3::timestamptz - $2::timestamptz))::int = appointment_minutes * 60
         AND appointment_minutes * 60 = $5
       LIMIT 1`,
      [request.providerId, start, end, process.env.APP_TIME_ZONE || "Asia/Kolkata", provider.rows[0].duration_minutes]
    );
    assert(matchingHours.rowCount, 409, "The selected time is outside the provider's working schedule.");
    const blocked = await client.query(
      "SELECT 1 FROM blocked_slots WHERE provider_id=$1 AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2,$3,'[)')",
      [request.providerId, start, end]
    );
    assert(!blocked.rowCount, 409, "The selected time is blocked.");
    const inserted = await client.query(
      `INSERT INTO service_requests (customer_id,provider_id,service_id,city,locality,pin_code,starts_at,ends_at,request_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.auth.id, request.providerId, request.serviceId, request.city, request.locality, request.pinCode, start, end, request.type]
    );
    await notify(client, request.providerId, "NEW_REQUEST", "You have a new service request.", { requestId: inserted.rows[0].id });
    return inserted.rows[0];
  });
  res.status(201).json({ data: created });
}));

router.patch("/requests/:id/status", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), validate(schemas.status), asyncRoute(async (req, res) => {
  const nextStatus = req.body.status.toUpperCase();
  assert(["ACCEPTED", "REJECTED"].includes(nextStatus), 400, "Requests can only be accepted or rejected here.");
  await expirePendingRequests();
  const updated = await transaction(async (client) => {
    const request = await client.query("SELECT * FROM service_requests WHERE id=$1 AND provider_id=$2 FOR UPDATE", [req.params.id, req.auth.id]);
    assert(request.rows[0], 404, "Request not found.");
    assert(request.rows[0].status === "PENDING" && new Date(request.rows[0].expires_at) > new Date(), 409, "This request is no longer pending or has expired.");
    if (nextStatus === "ACCEPTED") {
      const conflicts = await client.query(
        `SELECT 1 FROM bookings WHERE provider_id=$1 AND status IN ('CONFIRMED','IN_PROGRESS')
         AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2,$3,'[)')`,
        [req.auth.id, request.rows[0].starts_at, request.rows[0].ends_at]
      );
      assert(!conflicts.rowCount, 409, "This time has already been booked.");
    }
    const changed = await client.query(
      "UPDATE service_requests SET status=$2,updated_at=now() WHERE id=$1 RETURNING *",
      [req.params.id, nextStatus]
    );
    if (nextStatus === "ACCEPTED") {
      const booking = await client.query(
        `INSERT INTO bookings (request_id,customer_id,provider_id,service_id,starts_at,ends_at,status)
         VALUES ($1,$2,$3,$4,$5,$6,'CONFIRMED') RETURNING id`,
        [changed.rows[0].id, changed.rows[0].customer_id, changed.rows[0].provider_id, changed.rows[0].service_id, changed.rows[0].starts_at, changed.rows[0].ends_at]
      );
      await client.query(
        "INSERT INTO booking_status_history (booking_id,changed_by,old_status,new_status) VALUES ($1,$2,NULL,'CONFIRMED')",
        [booking.rows[0].id, req.auth.id]
      );
    }
    await notify(client, changed.rows[0].customer_id, `REQUEST_${nextStatus}`, `Your service request was ${nextStatus.toLowerCase()}.`, { requestId: changed.rows[0].id });
    return changed.rows[0];
  });
  res.json({ data: updated });
}));

router.post("/requests/:id/cancel", allowRoles("CUSTOMER"), asyncRoute(async (req, res) => {
  const cancelled = await transaction(async (client) => {
    const request = await client.query("SELECT * FROM service_requests WHERE id=$1 AND customer_id=$2 FOR UPDATE", [req.params.id, req.auth.id]);
    assert(request.rows[0], 404, "Request not found.");
    assert(request.rows[0].status === "PENDING" && new Date(request.rows[0].expires_at) > new Date(), 409, "Only pending, unexpired requests can be cancelled.");
    await client.query("UPDATE service_requests SET status='CANCELLED',updated_at=now() WHERE id=$1", [req.params.id]);
    await notify(client, request.rows[0].provider_id, "REQUEST_CANCELLED", "A customer cancelled a service request.", { requestId: request.rows[0].id });
    return true;
  });
  res.json({ data: { cancelled } });
}));

router.get("/bookings", asyncRoute(async (req, res) => {
  await expirePendingRequests();
  const column = req.auth.role === "CUSTOMER" ? "r.customer_id" : "r.provider_id";
  const result = await pool.query(
    `SELECT r.id AS request_id, b.id AS booking_id, r.status AS request_status,
            COALESCE(b.status,r.status) AS status, r.starts_at, r.ends_at, r.request_type,
            s.name AS service_name, customer.name AS customer_name, provider.name AS provider_name,
            r.customer_id, r.provider_id
     FROM service_requests r JOIN services s ON s.id=r.service_id
     JOIN users customer ON customer.id=r.customer_id JOIN users provider ON provider.id=r.provider_id
     LEFT JOIN bookings b ON b.request_id=r.id
     WHERE ${column}=$1 ORDER BY r.starts_at DESC`,
    [req.auth.id]
  );
  res.json({ data: result.rows });
}));

router.patch("/bookings/:id/status", allowRoles("INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"), validate(schemas.status), asyncRoute(async (req, res) => {
  const nextStatus = req.body.status.toUpperCase();
  const transitions = { IN_PROGRESS: ["CONFIRMED"], COMPLETED: ["IN_PROGRESS"], CANCELLED: ["CONFIRMED", "IN_PROGRESS"] };
  assert(transitions[nextStatus], 400, "Unsupported booking status.");
  const result = await transaction(async (client) => {
    const booking = await client.query(
      `SELECT b.*,r.customer_id FROM bookings b JOIN service_requests r ON r.id=b.request_id
       WHERE b.id=$1 AND b.provider_id=$2 FOR UPDATE`,
      [req.params.id, req.auth.id]
    );
    assert(booking.rows[0], 404, "Booking not found.");
    assert(transitions[nextStatus].includes(booking.rows[0].status), 409, "This booking cannot transition to that status.");
    const updated = await client.query("UPDATE bookings SET status=$2,updated_at=now() WHERE id=$1 RETURNING *", [req.params.id, nextStatus]);
    await client.query("UPDATE service_requests SET status=$2,updated_at=now() WHERE id=$1", [booking.rows[0].request_id, nextStatus]);
    await client.query(
      "INSERT INTO booking_status_history (booking_id,changed_by,old_status,new_status) VALUES ($1,$2,$3,$4)",
      [req.params.id, req.auth.id, booking.rows[0].status, nextStatus]
    );
    await notify(client, booking.rows[0].customer_id, `BOOKING_${nextStatus}`, `Your booking is now ${nextStatus.toLowerCase().replace("_", " ")}.`, { bookingId: req.params.id });
    return updated.rows[0];
  });
  res.json({ data: result });
}));

router.post("/bookings/:id/cancel", asyncRoute(async (req, res) => {
  const result = await transaction(async (client) => {
    const booking = await client.query(
      "SELECT * FROM bookings WHERE id=$1 AND (customer_id=$2 OR provider_id=$2) FOR UPDATE",
      [req.params.id, req.auth.id]
    );
    assert(booking.rows[0], 404, "Booking not found.");
    assert(["CONFIRMED", "IN_PROGRESS"].includes(booking.rows[0].status), 409, "This booking cannot be cancelled.");
    await client.query("UPDATE bookings SET status='CANCELLED',updated_at=now() WHERE id=$1", [req.params.id]);
    await client.query("UPDATE service_requests SET status='CANCELLED',updated_at=now() WHERE id=$1", [booking.rows[0].request_id]);
    await client.query(
      "INSERT INTO booking_status_history (booking_id,changed_by,old_status,new_status) VALUES ($1,$2,$3,'CANCELLED')",
      [req.params.id, req.auth.id, booking.rows[0].status]
    );
    const recipient = Number(booking.rows[0].customer_id) === req.auth.id ? booking.rows[0].provider_id : booking.rows[0].customer_id;
    await notify(client, recipient, "BOOKING_CANCELLED", "A booking was cancelled.", { bookingId: req.params.id });
    return true;
  });
  res.json({ data: { cancelled: result } });
}));

router.get("/providers/:id/reviews", asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT r.id,r.rating,r.body,r.created_at,u.name AS customer_name,s.name AS service_name
     FROM reviews r JOIN users u ON u.id=r.customer_id JOIN bookings b ON b.id=r.booking_id
     JOIN services s ON s.id=b.service_id WHERE r.provider_id=$1 ORDER BY r.created_at DESC`,
    [req.params.id]
  );
  res.json({ data: result.rows });
}));

router.post("/reviews/:id/report", asyncRoute(async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  assert(reason.length >= 5 && reason.length <= 1000, 400, "Enter a reason for reporting this review.");
  const result = await pool.query(
    `INSERT INTO review_reports (review_id,reporter_id,reason)
     SELECT id,$2,$3 FROM reviews WHERE id=$1 RETURNING *`,
    [req.params.id, req.auth.id, reason]
  );
  assert(result.rows[0], 404, "Review not found.");
  res.status(201).json({ data: result.rows[0] });
}));

router.post("/bookings/:id/reviews", allowRoles("CUSTOMER"), asyncRoute(async (req, res) => {
  const rating = Number(req.body.rating);
  const body = String(req.body.body || "").trim();
  assert(Number.isInteger(rating) && rating >= 1 && rating <= 5 && body.length >= 2 && body.length <= 3000, 400, "Enter a rating from 1 to 5 and a review.");
  const result = await pool.query(
    `INSERT INTO reviews (booking_id,customer_id,provider_id,rating,body)
     SELECT b.id,b.customer_id,b.provider_id,$3,$4 FROM bookings b
     WHERE b.id=$1 AND b.customer_id=$2 AND b.status='COMPLETED' RETURNING *`,
    [req.params.id, req.auth.id, rating, body]
  );
  assert(result.rowCount, 409, "Only completed bookings can be reviewed, and each booking can have one review.");
  await pool.query("INSERT INTO notifications (user_id,kind,message,data) VALUES ($1,'NEW_REVIEW','You received a new customer review.',$2)", [result.rows[0].provider_id, { reviewId: result.rows[0].id }]);
  res.status(201).json({ data: result.rows[0] });
}));

router.post("/complaints", allowRoles("CUSTOMER"), asyncRoute(async (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const details = String(req.body.details || "").trim();
  assert(subject.length >= 3 && subject.length <= 200 && details.length >= 5 && details.length <= 5000, 400, "Enter a subject and complaint details.");
  if (req.body.bookingId) {
    const booking = await pool.query("SELECT id FROM bookings WHERE id=$1 AND customer_id=$2", [req.body.bookingId, req.auth.id]);
    assert(booking.rows[0], 404, "The linked booking was not found.");
  }
  if (req.body.reviewId) {
    const review = await pool.query("SELECT id FROM reviews WHERE id=$1 AND customer_id=$2", [req.body.reviewId, req.auth.id]);
    assert(review.rows[0], 404, "The linked review was not found.");
  }
  const result = await pool.query(
    "INSERT INTO complaints (customer_id,booking_id,review_id,subject,details) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [req.auth.id, req.body.bookingId || null, req.body.reviewId || null, subject, details]
  );
  res.status(201).json({ data: result.rows[0] });
}));

router.get("/notifications", asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [req.auth.id]);
  res.json({ data: result.rows });
}));

router.patch("/notifications/:id/read", asyncRoute(async (req, res) => {
  const result = await pool.query("UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *", [req.params.id, req.auth.id]);
  assert(result.rows[0], 404, "Notification not found.");
  res.json({ data: result.rows[0] });
}));

router.get("/chat/conversations", asyncRoute(async (req, res) => {
  const column = req.auth.role === "CUSTOMER" ? "c.customer_id" : "c.provider_id";
  const result = await pool.query(
    `SELECT c.*,customer.name AS customer_name,provider.name AS provider_name
     FROM chat_conversations c JOIN users customer ON customer.id=c.customer_id
     JOIN users provider ON provider.id=c.provider_id WHERE ${column}=$1 ORDER BY c.created_at DESC`,
    [req.auth.id]
  );
  res.json({ data: result.rows });
}));

router.post("/chat/conversations", allowRoles("CUSTOMER"), asyncRoute(async (req, res) => {
  const providerId = Number(req.body.providerId);
  assert(Number.isInteger(providerId) && providerId > 0, 400, "Provider ID is required.");
  const result = await pool.query(
    `INSERT INTO chat_conversations (customer_id,provider_id)
     SELECT $1,p.user_id FROM provider_profiles p JOIN users u ON u.id=p.user_id
     WHERE p.user_id=$2 AND p.verification_status='APPROVED' AND u.status='ACTIVE'
     ON CONFLICT (customer_id,provider_id) DO UPDATE SET customer_id=EXCLUDED.customer_id
     RETURNING *`,
    [req.auth.id, providerId]
  );
  assert(result.rows[0], 404, "Approved provider not found.");
  res.status(201).json({ data: result.rows[0] });
}));

router.get("/chat/conversations/:id/messages", asyncRoute(async (req, res) => {
  const conversation = await pool.query(
    "SELECT * FROM chat_conversations WHERE id=$1 AND (customer_id=$2 OR provider_id=$2)",
    [req.params.id, req.auth.id]
  );
  assert(conversation.rows[0], 404, "Conversation not found.");
  const result = await pool.query("SELECT id,sender_id,body,read_at,created_at FROM chat_messages WHERE conversation_id=$1 ORDER BY created_at LIMIT 500", [req.params.id]);
  res.json({ data: result.rows });
}));

router.post("/chat/conversations/:id/messages", asyncRoute(async (req, res) => {
  const body = String(req.body.body || "").trim();
  assert(body.length >= 1 && body.length <= 5000, 400, "Message must be from 1 to 5000 characters.");
  const result = await pool.query(
    `INSERT INTO chat_messages (conversation_id,sender_id,body)
     SELECT c.id,$2,$3 FROM chat_conversations c WHERE c.id=$1 AND (c.customer_id=$2 OR c.provider_id=$2)
     RETURNING *`,
    [req.params.id, req.auth.id, body]
  );
  assert(result.rows[0], 404, "Conversation not found.");
  res.status(201).json({ data: result.rows[0] });
}));

router.get("/team", allowRoles("BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT id,name,email,phone,role,created_at FROM business_staff WHERE business_id=$1 ORDER BY created_at DESC", [req.auth.id]);
  res.json({ data: result.rows });
}));

router.post("/team", allowRoles("BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const role = String(req.body.role || "").trim();
  const phone = String(req.body.phone || "").trim();
  assert(name.length >= 2 && name.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && role.length >= 2 && role.length <= 120, 400, "Enter a valid team member name, email and role.");
  const result = await pool.query(
    "INSERT INTO business_staff (business_id,name,email,phone,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,phone,role",
    [req.auth.id, name, email, phone, role]
  );
  res.status(201).json({ data: result.rows[0] });
}));

router.delete("/team/:id", allowRoles("BUSINESS_PROVIDER"), asyncRoute(async (req, res) => {
  const result = await pool.query("DELETE FROM business_staff WHERE id=$1 AND business_id=$2", [req.params.id, req.auth.id]);
  assert(result.rowCount, 404, "Team member not found.");
  res.status(204).end();
}));

export async function expirePendingRequests() {
  return transaction(async (client) => {
    const expired = await client.query(
      `UPDATE service_requests SET status='EXPIRED',updated_at=now()
       WHERE status='PENDING' AND expires_at <= now()
       RETURNING id,customer_id`
    );
    for (const request of expired.rows) {
      await notify(client, request.customer_id, "REQUEST_EXPIRED", "Your service request expired because the provider did not respond in time.", { requestId: request.id });
    }
    return expired.rowCount;
  });
}

async function notify(client, userId, kind, message, data = {}) {
  await client.query(
    "INSERT INTO notifications (user_id,kind,message,data) VALUES ($1,$2,$3,$4)",
    [userId, kind, message, data]
  );
}

function isSupportedImage(file) {
  const bytes = file.buffer;
  return file.mimetype === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : file.mimetype === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : file.mimetype === "image/webp"
        ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
        : false;
}

function isSupportedDocument(file) {
  if (file.mimetype === "application/pdf") return file.buffer.subarray(0, 5).toString() === "%PDF-";
  return isSupportedImage(file);
}

export default router;
