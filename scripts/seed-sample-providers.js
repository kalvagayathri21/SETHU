import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { pool, transaction } from "../backend/db.js";
import { sampleProviders } from "../src/sampleProviders.js";

const sampleCustomer = {
  email: "sample-customer@demo.sethu.invalid",
  phone: "+919100000000",
  name: "SETHU Sample Customer"
};
const reviewDate = "2026-10-01T10:00:00+05:30";

async function ensureSampleUser(client, { email, phone, name, role }) {
  const found = await client.query(
    "SELECT id,email,phone,role,is_sample FROM users WHERE email=$1 OR phone=$2 FOR UPDATE",
    [email, phone]
  );
  if (found.rows.length) {
    const user = found.rows[0];
    if (found.rows.length !== 1 || user.email !== email || user.phone !== phone ||
        user.role !== role || !user.is_sample) {
      throw new Error(`Refusing to use ${email}: its email or phone belongs to a non-matching account.`);
    }
    return Number(user.id);
  }

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
  await client.query(
    `INSERT INTO users (role,name,email,phone,password_hash,is_sample,email_verified)
     VALUES ($1,$2,$3,$4,$5,true,true)
     ON CONFLICT DO NOTHING`,
    [role, name, email, phone, passwordHash]
  );

  const inserted = await client.query(
    "SELECT id,email,phone,role,is_sample FROM users WHERE email=$1 OR phone=$2",
    [email, phone]
  );
  const user = inserted.rows[0];
  if (inserted.rows.length !== 1 || !user || user.email !== email ||
      user.phone !== phone || user.role !== role || !user.is_sample) {
    throw new Error(`Could not safely create sample account ${email}; an email or phone conflict was found.`);
  }
  return Number(user.id);
}

async function seedProvider(client, provider, index, customerId) {
  const providerName = provider.name;
  const businessName = provider.businessName || null;
  const email = `sample-${provider.key}@demo.sethu.invalid`;
  const phone = `+91910000${String(index + 1).padStart(4, "0")}`;
  const role = provider.providerType === "BUSINESS" ? "BUSINESS_PROVIDER" : "INDIVIDUAL_PROVIDER";
  const providerId = await ensureSampleUser(client, { email, phone, name: providerName, role });

  await client.query(
    `INSERT INTO provider_profiles
       (user_id,provider_type,description,experience_years,verification_status)
     VALUES ($1,$2,$3,$4,'APPROVED')
     ON CONFLICT (user_id) DO NOTHING`,
    [providerId, provider.providerType, provider.description, provider.experienceYears]
  );
  const profile = await client.query(
    "SELECT provider_type FROM provider_profiles WHERE user_id=$1",
    [providerId]
  );
  if (profile.rows[0]?.provider_type !== provider.providerType) {
    throw new Error(`Sample account ${email} has an incompatible provider profile.`);
  }

  if (businessName) {
    await client.query(
      `INSERT INTO business_profiles (user_id,business_name,address,city,locality,pin_code)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO NOTHING`,
      [providerId, businessName, `${provider.locality}, Hyderabad`, provider.city, provider.locality, provider.pinCode]
    );
    const business = await client.query(
      "SELECT business_name FROM business_profiles WHERE user_id=$1",
      [providerId]
    );
    if (!business.rows[0]) throw new Error(`Business profile missing for sample account ${email}.`);
  }

  const categoryResult = await client.query(
    "SELECT id FROM service_categories WHERE slug=$1 AND active=true",
    [provider.categorySlug]
  );
  if (!categoryResult.rows[0]) {
    throw new Error(`Active service category "${provider.categorySlug}" is missing; run npm run db:setup first.`);
  }
  const categoryId = Number(categoryResult.rows[0].id);
  await client.query(
    "INSERT INTO provider_categories (provider_id,category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [providerId, categoryId]
  );
  await client.query(
    `INSERT INTO provider_service_areas (provider_id,city,locality,pin_code)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [providerId, provider.city, provider.locality, provider.pinCode]
  );

  const existingService = await client.query(
    "SELECT id FROM services WHERE provider_id=$1 AND name=$2",
    [providerId, provider.serviceName]
  );
  let serviceId;
  if (existingService.rows[0]) {
    serviceId = Number(existingService.rows[0].id);
    await client.query(
      `UPDATE services SET category_id=$2,description=$3,pricing_type=$4,price_min=$5,
       price_max=$6,duration_minutes=60,active=true,updated_at=now() WHERE id=$1`,
      [serviceId, categoryId, provider.serviceDescription, provider.priceType, provider.priceMin, provider.priceMax]
    );
  } else {
    const service = await client.query(
      `INSERT INTO services
         (provider_id,category_id,name,description,pricing_type,price_min,price_max,duration_minutes,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,60,true) RETURNING id`,
      [providerId, categoryId, provider.serviceName, provider.serviceDescription, provider.priceType, provider.priceMin, provider.priceMax]
    );
    serviceId = Number(service.rows[0].id);
  }
  await client.query(
    `INSERT INTO service_areas (service_id,city,locality,pin_code)
     VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [serviceId, provider.city, provider.locality, provider.pinCode]
  );
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await client.query(
      `INSERT INTO provider_availability (provider_id,weekday,start_time,end_time,appointment_minutes)
       VALUES ($1,$2,'09:00','18:00',60) ON CONFLICT (provider_id,weekday) DO NOTHING`,
      [providerId, weekday]
    );
  }

  const sampleKey = `sample-provider-review:${provider.key}`;
  await client.query(
    `INSERT INTO service_requests
       (customer_id,provider_id,service_id,city,locality,pin_code,starts_at,ends_at,
        request_type,status,expires_at,sample_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz + interval '1 hour',
        'SCHEDULED','COMPLETED',$7::timestamptz,$8)
     ON CONFLICT (sample_key) DO NOTHING`,
    [customerId, providerId, serviceId, provider.city, provider.locality, provider.pinCode, reviewDate, sampleKey]
  );
  const request = await client.query(
    "SELECT id,customer_id,provider_id,service_id FROM service_requests WHERE sample_key=$1",
    [sampleKey]
  );
  const seededRequest = request.rows[0];
  if (!seededRequest || Number(seededRequest.customer_id) !== customerId ||
      Number(seededRequest.provider_id) !== providerId || Number(seededRequest.service_id) !== serviceId) {
    throw new Error(`Sample review request key ${sampleKey} is already used by different records.`);
  }

  const booking = await client.query(
    `INSERT INTO bookings
       (request_id,customer_id,provider_id,service_id,starts_at,ends_at,status)
     VALUES ($1,$2,$3,$4,$5::timestamptz,$5::timestamptz + interval '1 hour','COMPLETED')
     ON CONFLICT (request_id) DO UPDATE SET status='COMPLETED'
     RETURNING id`,
    [seededRequest.id, customerId, providerId, serviceId, reviewDate]
  );
  await client.query(
    `INSERT INTO reviews (booking_id,customer_id,provider_id,rating,body)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (booking_id) DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body`,
    [booking.rows[0].id, customerId, providerId, provider.rating, provider.review]
  );
}

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const seeded = await transaction(async (client) => {
    const customerId = await ensureSampleUser(client, {
      ...sampleCustomer,
      role: "CUSTOMER"
    });
    await client.query(
      `INSERT INTO customer_profiles (user_id,address,city,locality,pin_code)
       VALUES ($1,'SETHU sample account','Hyderabad','Madhapur','500081')
       ON CONFLICT (user_id) DO NOTHING`,
      [customerId]
    );
    for (const [index, provider] of sampleProviders.entries()) {
      await seedProvider(client, provider, index, customerId);
    }
    return sampleProviders.length;
  });
  console.log(`Seeded ${seeded} sample service providers. Re-running this command is safe.`);
} catch (error) {
  console.error("Sample-provider seed failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
