import { z } from "zod";
import { HttpError } from "./errors.js";

export const schemas = {
  register: z.object({
    role: z.enum(["CUSTOMER", "INDIVIDUAL_PROVIDER", "BUSINESS_PROVIDER"]),
    name: z.string().trim().min(2).max(160),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
    password: z.string().min(8).max(128),
    description: z.string().trim().max(5000).optional().default(""),
    experienceYears: z.coerce.number().int().min(0).max(80).optional().default(0),
    businessName: z.string().trim().max(160).optional(),
    address: z.string().trim().max(500).optional().default(""),
    city: z.string().trim().max(120).optional().default(""),
    locality: z.string().trim().max(120).optional().default(""),
    pinCode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal("")),
    categories: z.array(z.string().trim().min(1).max(120)).max(20).optional().default([]),
    serviceAreas: z.array(z.object({
      city: z.string().trim().min(2).max(120),
      locality: z.string().trim().min(2).max(120),
      pinCode: z.string().regex(/^\d{6}$/)
    })).max(100).optional().default([])
  }).superRefine((data, context) => {
    if (data.role === "BUSINESS_PROVIDER" && (!data.businessName || data.businessName.length < 2)) {
      context.addIssue({
        code: "custom",
        path: ["businessName"],
        message: "Business name must be at least 2 characters."
      });
    }
  }),
  login: z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128)
  }),
  service: z.object({
    name: z.string().trim().min(2).max(160),
    categoryId: z.coerce.number().int().positive(),
    description: z.string().trim().min(2).max(5000),
    pricingType: z.enum(["FIXED", "RANGE"]),
    priceMin: z.coerce.number().positive().max(99999999),
    priceMax: z.coerce.number().positive().max(99999999).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(15).max(1440).default(60),
    active: z.boolean().default(true),
    areas: z.array(z.object({
      city: z.string().trim().min(2).max(120),
      locality: z.string().trim().min(2).max(120),
      pinCode: z.string().regex(/^\d{6}$/)
    })).min(1).max(100)
  }).superRefine((value, context) => {
    if (value.pricingType === "FIXED" && value.priceMax != null) {
      context.addIssue({ code: "custom", path: ["priceMax"], message: "Fixed pricing must not include a maximum price." });
    }
    if (value.pricingType === "RANGE" && (value.priceMax == null || value.priceMax < value.priceMin)) {
      context.addIssue({ code: "custom", path: ["priceMax"], message: "A range needs a maximum at least as high as the minimum." });
    }
  }),
  request: z.object({
    providerId: z.coerce.number().int().positive(),
    serviceId: z.coerce.number().int().positive(),
    city: z.string().trim().min(2).max(120),
    locality: z.string().trim().min(2).max(120),
    pinCode: z.string().regex(/^\d{6}$/),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    type: z.enum(["URGENT", "SCHEDULED"])
  }),
  status: z.object({ status: z.string().min(1).max(30) })
};

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    return next();
  };
}

export function assert(condition, status, message, code) {
  if (!condition) throw new HttpError(status, message, code);
}
