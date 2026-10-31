import test from "node:test";
import assert from "node:assert/strict";
import { schemas } from "../middleware/validation.js";
import { getBookingRequestBlockReason } from "../../src/providerBooking.js";

test("registration allows blank business names except for business providers", () => {
  const customer = schemas.register.safeParse({
    role: "CUSTOMER",
    name: "Sample Customer",
    email: "CUSTOMER@example.com",
    phone: "+919876543210",
    password: "A strong password 123",
    businessName: ""
  });
  assert.equal(customer.success, true);
  assert.equal(customer.data.email, "customer@example.com");
  const individualProvider = schemas.register.safeParse({
    role: "INDIVIDUAL_PROVIDER",
    name: "Sample Provider",
    email: "provider@example.com",
    phone: "+919876543211",
    password: "A strong password 123",
    businessName: ""
  });
  assert.equal(individualProvider.success, true);

  const businessProvider = {
    role: "BUSINESS_PROVIDER",
    name: "Sample Contact",
    email: "business@example.com",
    phone: "+919876543212",
    password: "A strong password 123"
  };
  assert.equal(schemas.register.safeParse({ ...businessProvider, businessName: "SE" }).success, true);
  assert.equal(schemas.register.safeParse({ ...businessProvider, businessName: " " }).success, false);
  assert.equal(schemas.register.safeParse(businessProvider).success, false);

  assert.equal(schemas.register.safeParse({
    role: "ADMIN",
    name: "Public Admin",
    email: "admin@example.com",
    phone: "+919876543211",
    password: "A strong password 123"
  }).success, false);
});

test("service pricing validates fixed and estimated-range rules", () => {
  const fixed = {
    name: "Tap repairs",
    categoryId: 1,
    description: "Repair and replace household taps",
    pricingType: "FIXED",
    priceMin: 500,
    areas: [{ city: "Hyderabad", locality: "Madhapur", pinCode: "500081" }]
  };
  assert.equal(schemas.service.safeParse(fixed).success, true);
  assert.equal(schemas.service.safeParse({ ...fixed, priceMax: 700 }).success, false);
  assert.equal(schemas.service.safeParse({
    ...fixed,
    pricingType: "RANGE",
    priceMax: 400
  }).success, false);
  assert.equal(schemas.service.safeParse({
    ...fixed,
    pricingType: "RANGE",
    priceMax: 900
  }).success, true);
});

test("new booking requests require offset-aware ISO timestamps", () => {
  const request = {
    providerId: 2,
    serviceId: 8,
    city: "Hyderabad",
    locality: "Madhapur",
    pinCode: "500081",
    startsAt: "2026-11-02T09:00:00+05:30",
    endsAt: "2026-11-02T10:00:00+05:30",
    type: "SCHEDULED"
  };
  assert.equal(schemas.request.safeParse(request).success, true);
  assert.equal(schemas.request.safeParse({ ...request, startsAt: "tomorrow" }).success, false);
  assert.equal(schemas.request.safeParse({ ...request, serviceId: undefined }).success, false);
  assert.equal(schemas.request.safeParse({ ...request, providerId: undefined }).success, false);
});

test("booking requests reject sample providers and require a customer account", () => {
  const service = { serviceId: 8 };
  assert.match(
    getBookingRequestBlockReason({ is_sample: true, provider_id: 2 }, service, "CUSTOMER"),
    /Sample providers/
  );
  assert.match(
    getBookingRequestBlockReason({ is_sample: false, provider_id: 2 }, service, null),
    /Sign in with a customer account/
  );
  assert.match(
    getBookingRequestBlockReason({ is_sample: false, provider_id: 2 }, service, "BUSINESS_PROVIDER"),
    /Use a customer account/
  );
  assert.equal(
    getBookingRequestBlockReason({ is_sample: false, provider_id: 2 }, service, "CUSTOMER"),
    ""
  );
  assert.match(
    getBookingRequestBlockReason({ is_sample: false, provider_id: 2 }, { serviceId: null }, "CUSTOMER"),
    /not available for booking/
  );
});
