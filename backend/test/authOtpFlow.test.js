import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import { createAuthRouter } from "../routes/auth.js";
import { errorHandler } from "../middleware/errors.js";

class MemoryDatabase {
  constructor() {
    this.state = {
      users: [],
      pending: [],
      customers: [],
      providers: [],
      businesses: [],
      categories: [],
      areas: []
    };
    this.nextId = 1;
  }

  async transaction(callback) {
    const state = structuredClone(this.state);
    const client = { query: (sql, values = []) => this.queryState(state, sql, values) };
    const result = await callback(client);
    this.state = state;
    return result;
  }

  async queryState(state, sql, values) {
    const statement = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (statement.startsWith("select pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
    if (statement.startsWith("delete from pending_registrations where registration_expires_at <= now()")) {
      state.pending = state.pending.filter((row) => row.registration_expires_at > new Date());
      return { rows: [], rowCount: 0 };
    }
    if (statement.startsWith("select id from users where email = $1 or phone = $2")) {
      const rows = state.users.filter((row) => row.email === values[0] || row.phone === values[1]);
      return { rows: rows.slice(0, 1), rowCount: Math.min(rows.length, 1) };
    }
    if (statement.startsWith("select id from pending_registrations where email = $1 or phone = $2")) {
      const rows = state.pending.filter((row) => row.email === values[0] || row.phone === values[1]);
      return { rows: rows.slice(0, 1), rowCount: Math.min(rows.length, 1) };
    }
    if (statement.startsWith("insert into pending_registrations")) {
      const [id, role, email, phone, registrationData, passwordHash, otpHash, otpExpiresAt, registrationExpiresAt, sentAt] = values;
      state.pending.push({
        id,
        role,
        email,
        phone,
        registration_data: JSON.parse(registrationData),
        password_hash: passwordHash,
        otp_hash: otpHash,
        otp_expires_at: otpExpiresAt,
        registration_expires_at: registrationExpiresAt,
        attempt_count: 0,
        resend_count: 0,
        resend_window_started_at: sentAt,
        last_sent_at: sentAt
      });
      return { rows: [], rowCount: 1 };
    }
    if (statement.startsWith("select id, role, email, phone, registration_data, password_hash, otp_hash")) {
      const row = state.pending.find((item) => item.email === values[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (statement.startsWith("select id, email, resend_count, resend_window_started_at, last_sent_at from pending_registrations")) {
      const row = state.pending.find((item) => item.email === values[0] &&
        item.registration_expires_at > new Date());
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (statement.startsWith("update pending_registrations set otp_hash")) {
      const row = state.pending.find((item) => item.id === values[0]);
      Object.assign(row, {
        otp_hash: values[1],
        otp_expires_at: values[2],
        attempt_count: 0,
        resend_count: values[3],
        resend_window_started_at: values[4],
        last_sent_at: values[5]
      });
      return { rows: [], rowCount: 1 };
    }
    if (statement.startsWith("update pending_registrations set attempt_count = attempt_count + 1")) {
      const row = state.pending.find((item) => item.id === values[0]);
      row.attempt_count += 1;
      return { rows: [{ attempt_count: row.attempt_count }], rowCount: 1 };
    }
    if (statement.startsWith("delete from pending_registrations where id = $1")) {
      const before = state.pending.length;
      state.pending = state.pending.filter((row) => row.id !== values[0]);
      return { rows: [], rowCount: before - state.pending.length };
    }
    if (statement.startsWith("insert into users")) {
      const [role, name, email, phone, passwordHash] = values;
      if (state.users.some((row) => row.email === email || row.phone === phone)) {
        const error = new Error("duplicate user");
        error.code = "23505";
        throw error;
      }
      const row = {
        id: this.nextId++,
        role,
        name,
        email,
        phone,
        password_hash: passwordHash,
        status: "ACTIVE",
        email_verified: true
      };
      state.users.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (statement.startsWith("insert into customer_profiles")) {
      state.customers.push({ user_id: values[0] });
      return { rows: [], rowCount: 1 };
    }
    if (statement.startsWith("insert into provider_profiles")) {
      const row = {
        user_id: values[0],
        provider_type: values[1],
        verification_status: "PENDING"
      };
      state.providers.push(row);
      return { rows: [row], rowCount: 1 };
    }
    if (statement.startsWith("insert into business_profiles")) {
      state.businesses.push({ user_id: values[0], business_name: values[1] });
      return { rows: [], rowCount: 1 };
    }
    if (statement.startsWith("select id from service_categories")) {
      return { rows: [{ id: 1 }], rowCount: 1 };
    }
    if (statement.startsWith("insert into provider_categories")) {
      state.categories.push({ provider_id: values[0], category_id: values[1] });
      return { rows: [], rowCount: 1 };
    }
    if (statement.startsWith("insert into provider_service_areas")) {
      state.areas.push({ provider_id: values[0], city: values[1], locality: values[2] });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in test database: ${statement}`);
  }

  async query(sql, values) {
    const email = values[0];
    const user = this.state.users.find((row) => row.email === email);
    return { rows: user ? [{ ...user, provider_type: null, verification_status: null, business_name: null }] : [], rowCount: user ? 1 : 0 };
  }
}

function registrationPayload(role, suffix) {
  return {
    role,
    name: role === "BUSINESS_PROVIDER" ? "Business Contact" : "Test Account",
    email: `${role.toLowerCase()}-${suffix}@example.com`,
    phone: `+91987654${String(suffix).padStart(4, "0")}`,
    password: "A strong password 123",
    businessName: role === "BUSINESS_PROVIDER" ? "Test Business" : "",
    categories: role === "CUSTOMER" ? [] : ["Plumbing"],
    serviceAreas: role === "CUSTOMER"
      ? []
      : [{ city: "Hyderabad", locality: "Madhapur", pinCode: "500081" }]
  };
}

async function createTestApi() {
  const database = new MemoryDatabase();
  const delivered = [];
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter({
    database,
    runTransaction: (callback) => database.transaction(callback),
    deliverEmail: async (to, otp) => delivered.push({ to, otp })
  }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  return {
    database,
    delivered,
    request: (path, body) => fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

for (const [index, role] of ["CUSTOMER", "INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"].entries()) {
  test(`${role} registration stays pending through a wrong OTP and creates one verified account on success`, async () => {
    const priorJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
    const api = await createTestApi();
    const payload = registrationPayload(role, index + 10);
    try {
      const registrationResponse = await api.request("/register", payload);
      const registrationBody = await registrationResponse.json();
      assert.equal(registrationResponse.status, 201);
      assert.equal(registrationBody.data.email, payload.email);
      assert.equal(JSON.stringify(registrationBody).includes(api.delivered[0].otp), false);
      assert.equal(api.database.state.users.length, 0);
      assert.equal(api.database.state.pending.length, 1);
      assert.notEqual(api.database.state.pending[0].password_hash, payload.password);
      assert.equal(await bcrypt.compare(payload.password, api.database.state.pending[0].password_hash), true);
      assert.equal(api.database.state.pending[0].registration_data.password, undefined);
      assert.notEqual(api.database.state.pending[0].otp_hash, api.delivered[0].otp);

      const wrongOtp = api.delivered[0].otp === "000000" ? "000001" : "000000";
      const wrongResponse = await api.request("/verify-otp", { email: payload.email, otp: wrongOtp });
      assert.equal(wrongResponse.status, 400);
      assert.equal(api.database.state.users.length, 0);
      assert.equal(api.database.state.pending[0].attempt_count, 1);

      const verifyResponse = await api.request("/verify-otp", {
        email: payload.email,
        otp: api.delivered[0].otp
      });
      assert.equal(verifyResponse.status, 200);
      assert.equal(api.database.state.users.length, 1);
      assert.equal(api.database.state.users[0].role, role);
      assert.equal(api.database.state.users[0].phone, payload.phone);
      assert.equal(api.database.state.users[0].email_verified, true);
      assert.equal(api.database.state.pending.length, 0);
      assert.equal(api.database.state.customers.length, role === "CUSTOMER" ? 1 : 0);
      assert.equal(api.database.state.providers.length, role === "CUSTOMER" ? 0 : 1);
      assert.equal(api.database.state.businesses.length, role === "BUSINESS_PROVIDER" ? 1 : 0);
    } finally {
      await api.close();
      if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = priorJwtSecret;
    }
  });
}

test("OTP verification recovers a missing pending phone column from validated registration data", async () => {
  const priorJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
  const api = await createTestApi();
  const payload = registrationPayload("CUSTOMER", 39);
  try {
    await api.request("/register", payload);
    api.database.state.pending[0].phone = null;
    const response = await api.request("/verify-otp", {
      email: payload.email,
      otp: api.delivered[0].otp
    });
    assert.equal(response.status, 200);
    assert.equal(api.database.state.users[0].phone, payload.phone);
  } finally {
    await api.close();
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
  }
});

for (const [index, role] of ["CUSTOMER", "INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"].entries()) {
  test(`${role} expired OTP cannot create a user`, async () => {
    const priorJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
    const api = await createTestApi();
    const payload = registrationPayload(role, index + 20);
    try {
      await api.request("/register", payload);
      api.database.state.pending[0].otp_expires_at = new Date(Date.now() - 1000);
      const response = await api.request("/verify-otp", {
        email: payload.email,
        otp: api.delivered[0].otp
      });
      assert.equal(response.status, 400);
      assert.equal(api.database.state.users.length, 0);
      assert.equal(api.database.state.pending.length, 1);
    } finally {
      await api.close();
      if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = priorJwtSecret;
    }
  });
}

test("duplicate email and phone registrations are rejected before creating another pending record", async () => {
  const priorJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
  const api = await createTestApi();
  const original = registrationPayload("CUSTOMER", 40);
  try {
    assert.equal((await api.request("/register", original)).status, 201);
    assert.equal((await api.request("/register", { ...original, phone: "+919876540041" })).status, 409);
    assert.equal((await api.request("/register", {
      ...original,
      email: "another@example.com",
      phone: original.phone
    })).status, 409);
    assert.equal(api.database.state.pending.length, 1);
    assert.equal(api.database.state.users.length, 0);
  } finally {
    await api.close();
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
  }
});

test("email or phone already present in users blocks a pending registration", async () => {
  const api = await createTestApi();
  const payload = registrationPayload("CUSTOMER", 42);
  api.database.state.users.push({
    id: 1,
    role: "CUSTOMER",
    email: payload.email,
    phone: "+919876540043"
  });
  try {
    assert.equal((await api.request("/register", payload)).status, 409);
    assert.equal(api.database.state.pending.length, 0);
    assert.equal(api.delivered.length, 0);

    const phoneConflict = registrationPayload("CUSTOMER", 43);
    phoneConflict.phone = api.database.state.users[0].phone;
    assert.equal((await api.request("/register", phoneConflict)).status, 409);
    assert.equal(api.database.state.pending.length, 0);
    assert.equal(api.delivered.length, 0);
  } finally {
    await api.close();
  }
});

test("fifth incorrect OTP attempt locks verification and no account is created", async () => {
  const priorJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
  const api = await createTestApi();
  const payload = registrationPayload("CUSTOMER", 44);
  try {
    await api.request("/register", payload);
    const wrongOtp = api.delivered[0].otp === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api.request("/verify-otp", {
        email: payload.email,
        otp: wrongOtp
      });
      assert.equal(response.status, attempt === 4 ? 429 : 400);
    }
    assert.equal(api.database.state.pending[0].attempt_count, 5);
    assert.equal(api.database.state.users.length, 0);
  } finally {
    await api.close();
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
  }
});

test("pending registration resends replace the code, enforce cooldown, and verify only the newest code", async () => {
  const priorJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
  const api = await createTestApi();
  const payload = registrationPayload("CUSTOMER", 41);
  try {
    await api.request("/register", payload);
    const cooldownResponse = await api.request("/resend-otp", { email: payload.email });
    assert.equal(cooldownResponse.status, 429);

    api.database.state.pending[0].last_sent_at = new Date(Date.now() - 31_000);
    const resendResponse = await api.request("/resend-otp", { email: payload.email });
    assert.equal(resendResponse.status, 202);
    assert.equal(api.delivered.length, 2);

    const oldOtpResponse = await api.request("/verify-otp", {
      email: payload.email,
      otp: api.delivered[0].otp
    });
    assert.equal(oldOtpResponse.status, 400);
    assert.equal(api.database.state.users.length, 0);

    const currentOtpResponse = await api.request("/verify-otp", {
      email: payload.email,
      otp: api.delivered[1].otp
    });
    assert.equal(currentOtpResponse.status, 200);
    assert.equal(api.database.state.users.length, 1);
    assert.equal(api.database.state.pending.length, 0);
  } finally {
    await api.close();
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
  }
});

test("verified users can log in and admin login remains exempt from email OTP", async () => {
  const priorJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-with-at-least-thirty-two-characters";
  const api = await createTestApi();
  const password = "A strong password 123";
  const hash = await bcrypt.hash(password, 4);
  api.database.state.users.push({
    id: 1,
    role: "CUSTOMER",
    name: "Verified Customer",
    email: "verified@example.com",
    phone: "+919876540051",
    password_hash: hash,
    status: "ACTIVE",
    email_verified: true
  }, {
    id: 2,
    role: "ADMIN",
    name: "Admin",
    email: "admin@example.com",
    phone: "+919876540052",
    password_hash: hash,
    status: "ACTIVE",
    email_verified: false
  });
  try {
    const customerResponse = await api.request("/login", { email: "verified@example.com", password });
    const adminResponse = await api.request("/login", { email: "admin@example.com", password });
    assert.equal(customerResponse.status, 200);
    assert.equal(adminResponse.status, 200);
    assert.equal((await customerResponse.json()).data.user.role, "CUSTOMER");
    assert.equal((await adminResponse.json()).data.user.role, "ADMIN");
  } finally {
    await api.close();
    if (priorJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = priorJwtSecret;
  }
});
