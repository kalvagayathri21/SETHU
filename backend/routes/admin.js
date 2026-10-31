import { Router } from "express";
import path from "node:path";
import { pool, transaction } from "../db.js";
import { allowRoles } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../middleware/errors.js";
import { assert } from "../middleware/validation.js";

const router = Router();
router.use(allowRoles("ADMIN"));

router.get("/overview", asyncRoute(async (req, res) => {
  const counts = await pool.query(
    `SELECT
      (SELECT count(*)::int FROM users WHERE role='CUSTOMER') AS customers,
      (SELECT count(*)::int FROM provider_profiles WHERE provider_type='INDIVIDUAL') AS individual_providers,
      (SELECT count(*)::int FROM provider_profiles WHERE provider_type='BUSINESS') AS business_providers,
      (SELECT count(*)::int FROM provider_profiles WHERE verification_status='APPROVED') AS approved_providers,
      (SELECT count(*)::int FROM provider_profiles WHERE verification_status='PENDING') AS pending_verifications,
      (SELECT count(*)::int FROM service_requests) AS service_requests,
      (SELECT count(*)::int FROM bookings) AS bookings,
      (SELECT count(*)::int FROM bookings WHERE status='COMPLETED') AS completed_bookings,
      (SELECT count(*)::int FROM service_requests WHERE status IN ('CANCELLED','EXPIRED')) AS cancelled_or_expired`
  );
  const activity = await pool.query(
    `SELECT 'request' AS kind, id, status, created_at FROM service_requests
     UNION ALL SELECT 'booking', id, status, created_at FROM bookings
     UNION ALL SELECT 'complaint', id, status, created_at FROM complaints
     ORDER BY created_at DESC LIMIT 20`
  );
  res.json({ data: { counts: counts.rows[0], activity: activity.rows } });
}));

router.get("/users", asyncRoute(async (req, res) => {
  const role = String(req.query.role || "");
  const search = String(req.query.search || "").slice(0, 120);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const result = await pool.query(
    `SELECT u.id,u.role,u.name,u.email,u.phone,u.status,u.created_at,
            p.provider_type,p.verification_status,b.business_name
     FROM users u LEFT JOIN provider_profiles p ON p.user_id=u.id
     LEFT JOIN business_profiles b ON b.user_id=u.id
     WHERE ($1='' OR u.role=$1) AND
       ($2='' OR u.name ILIKE '%'||$2||'%' OR u.email ILIKE '%'||$2||'%' OR u.phone ILIKE '%'||$2||'%')
     ORDER BY u.created_at DESC LIMIT 30 OFFSET $3`,
    [role, search, (page - 1) * 30]
  );
  res.json({ data: result.rows, pagination: { page, limit: 30, hasMore: result.rows.length === 30 } });
}));

router.patch("/users/:id/status", asyncRoute(async (req, res) => {
  const status = String(req.body.status || "");
  assert(["ACTIVE", "INACTIVE", "SUSPENDED"].includes(status), 400, "Invalid account status.");
  assert(Number(req.params.id) !== req.auth.id, 400, "You cannot change your own account status.");
  const result = await pool.query("UPDATE users SET status=$2,updated_at=now() WHERE id=$1 AND role<>'ADMIN' RETURNING id,role,status", [req.params.id, status]);
  assert(result.rows[0], 404, "User not found or protected.");
  res.json({ data: result.rows[0] });
}));

router.get("/verifications", asyncRoute(async (req, res) => {
  const status = String(req.query.status || "PENDING");
  assert(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(status), 400, "Invalid verification status.");
  const result = await pool.query(
    `SELECT p.user_id,p.provider_type,p.description,p.experience_years,p.verification_status,p.verification_reason,p.created_at,
            u.name,u.email,u.phone,b.business_name,b.address,b.city,b.locality,b.pin_code,
            COALESCE(json_agg(jsonb_build_object('id',d.id,'name',d.original_name,'type',d.mime_type,'uploadedAt',d.created_at))
              FILTER (WHERE d.id IS NOT NULL),'[]') AS documents
     FROM provider_profiles p JOIN users u ON u.id=p.user_id
     LEFT JOIN business_profiles b ON b.user_id=p.user_id
     LEFT JOIN provider_documents d ON d.provider_id=p.user_id
     WHERE p.verification_status=$1
     GROUP BY p.user_id,u.id,b.user_id ORDER BY p.created_at`,
    [status]
  );
  res.json({ data: result.rows });
}));

router.patch("/verifications/:providerId", asyncRoute(async (req, res) => {
  const status = String(req.body.status || "");
  const reason = String(req.body.reason || "").trim();
  assert(["APPROVED", "REJECTED"].includes(status), 400, "Choose approve or reject.");
  assert(status !== "REJECTED" || (reason.length >= 5 && reason.length <= 1000), 400, "Add a reason when rejecting a provider.");
  const result = await transaction(async (client) => {
    const updated = await client.query(
      "UPDATE provider_profiles SET verification_status=$2,verification_reason=$3 WHERE user_id=$1 RETURNING user_id",
      [req.params.providerId, status, status === "REJECTED" ? reason : null]
    );
    assert(updated.rowCount, 404, "Provider profile not found.");
    await client.query(
      "INSERT INTO notifications (user_id,kind,message,data) VALUES ($1,$2,$3,$4)",
      [req.params.providerId, `PROVIDER_${status}`, status === "APPROVED" ? "Your provider account has been approved." : "Your provider application was not approved.", { reason: status === "REJECTED" ? reason : null }]
    );
    return updated.rows[0];
  });
  res.json({ data: { ...result, verificationStatus: status } });
}));

router.get("/categories", asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT * FROM service_categories ORDER BY name");
  res.json({ data: result.rows });
}));

router.post("/categories", asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const slug = String(req.body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  assert(name.length >= 2 && name.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 400, "Enter a valid category name and slug.");
  const result = await pool.query("INSERT INTO service_categories(name,slug) VALUES($1,$2) RETURNING *", [name, slug]);
  res.status(201).json({ data: result.rows[0] });
}));

router.patch("/categories/:id", asyncRoute(async (req, res) => {
  const name = req.body.name == null ? null : String(req.body.name).trim();
  const active = req.body.active == null ? null : Boolean(req.body.active);
  const result = await pool.query(
    "UPDATE service_categories SET name=COALESCE($2,name),active=COALESCE($3,active) WHERE id=$1 RETURNING *",
    [req.params.id, name, active]
  );
  assert(result.rows[0], 404, "Category not found.");
  res.json({ data: result.rows[0] });
}));

router.get("/requests", asyncRoute(async (req, res) => {
  const status = String(req.query.status || "");
  const result = await pool.query(
    `SELECT r.*,s.name AS service_name,customer.name AS customer_name,provider.name AS provider_name,
            p.verification_status,b.business_name
     FROM service_requests r JOIN services s ON s.id=r.service_id
     JOIN users customer ON customer.id=r.customer_id JOIN users provider ON provider.id=r.provider_id
     JOIN provider_profiles p ON p.user_id=r.provider_id LEFT JOIN business_profiles b ON b.user_id=p.user_id
     WHERE ($1='' OR r.status=$1) ORDER BY r.created_at DESC LIMIT 200`,
    [status]
  );
  res.json({ data: result.rows });
}));

router.get("/bookings", asyncRoute(async (req, res) => {
  const status = String(req.query.status || "");
  const result = await pool.query(
    `SELECT b.*,s.name AS service_name,customer.name AS customer_name,provider.name AS provider_name
     FROM bookings b JOIN services s ON s.id=b.service_id JOIN users customer ON customer.id=b.customer_id
     JOIN users provider ON provider.id=b.provider_id WHERE ($1='' OR b.status=$1)
     ORDER BY b.starts_at DESC LIMIT 200`,
    [status]
  );
  res.json({ data: result.rows });
}));

router.get("/complaints", asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT c.*,u.name AS customer_name,b.provider_id,provider.name AS provider_name
     FROM complaints c JOIN users u ON u.id=c.customer_id
     LEFT JOIN bookings b ON b.id=c.booking_id LEFT JOIN users provider ON provider.id=b.provider_id
     ORDER BY c.created_at DESC LIMIT 200`
  );
  const reports = await pool.query(
    `SELECT rr.*,r.body AS review_body,r.rating,u.name AS reporter_name
     FROM review_reports rr JOIN reviews r ON r.id=rr.review_id
     JOIN users u ON u.id=rr.reporter_id ORDER BY rr.created_at DESC LIMIT 200`
  );
  res.json({ data: { complaints: result.rows, reviewReports: reports.rows } });
}));

router.patch("/complaints/:id", asyncRoute(async (req, res) => {
  const status = String(req.body.status || "");
  const resolution = String(req.body.resolution || "").trim();
  assert(["IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status), 400, "Invalid complaint status.");
  assert(status !== "RESOLVED" || resolution.length >= 3, 400, "Add a resolution before resolving a complaint.");
  const result = await pool.query(
    `UPDATE complaints SET status=$2,resolution=$3,resolved_by=$4,updated_at=now()
     WHERE id=$1 RETURNING *`,
    [req.params.id, status, resolution || null, req.auth.id]
  );
  assert(result.rows[0], 404, "Complaint not found.");
  res.json({ data: result.rows[0] });
}));

router.get("/documents/:id", asyncRoute(async (req, res) => {
  const result = await pool.query("SELECT storage_name,mime_type,original_name FROM provider_documents WHERE id=$1", [req.params.id]);
  assert(result.rows[0], 404, "Document not found.");
  const filePath = path.resolve(process.env.PRIVATE_UPLOAD_DIR || "private-uploads", result.rows[0].storage_name);
  return res.type(result.rows[0].mime_type).download(filePath, result.rows[0].original_name);
}));

router.use((req, res, next) => {
  if (req.path.startsWith("/documents/")) return next();
  return next();
});

export default router;
