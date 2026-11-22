import { z } from "zod";

export const ulid = z.string().length(26);

export const healthSchema = z.object({
  status: z.literal("ok"),
  mode: z.string(),
  version: z.string(),
});

export const versionSchema = z.object({
  app: z.string(),
  edge: z.string(),
  schema: z.number(),
  build: z.string(),
});

export const createTenantSchema = z.object({
  name: z.string().min(1).max(120),
});

export const tenantSchema = z.object({
  id: ulid,
  name: z.string().min(1),
  created_at: z.string(),
});

export const createVenueSchema = z.object({
  name: z.string().min(1).max(120),
});

export const venueSchema = z.object({
  id: ulid,
  tenant_id: ulid,
  name: z.string().min(1),
  created_at: z.string(),
});

export const paymentMethodSchema = z.enum([
  "cash",
  "mpesa_manual",
  "mpesa_stk",
  "pdq_card",
]);

export const paymentStatusSchema = z.enum([
  "pending",
  "confirmed",
  "failed",
  "cancelled",
  "reversed",
]);

export const pdqModeSchema = z.enum([
  "integrated",
  "semi_integrated",
  "standalone",
]);

export const mpesaDetailsSchema = z.object({
  phone: z.string().min(9).max(15).optional(),
  reference: z.string().min(6).max(32).optional(),
  checkout_request_id: z.string().max(64).optional(),
  merchant_request_id: z.string().max(64).optional(),
});

export const pdqDetailsSchema = z.object({
  mode: pdqModeSchema,
  terminal_id: z.string().min(1).max(64).optional(),
  approval_code: z.string().min(1).max(32).optional(),
  rrn: z.string().max(32).optional(),
  stan: z.string().max(16).optional(),
  card_brand: z.string().max(32).optional(),
  last4: z.string().length(4).optional(),
});

export const createPaymentSchema = z
  .object({
    order_id: ulid,
    method: paymentMethodSchema,
    amount_minor: z.number().int().positive(),
    currency: z.literal("KES").default("KES"),
    idempotency_key: z.string().min(8).max(128),
    mpesa: mpesaDetailsSchema.optional(),
    pdq: pdqDetailsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === "mpesa_manual" && !value.mpesa?.reference) {
      ctx.addIssue({
        code: "custom",
        path: ["mpesa", "reference"],
        message: "M-Pesa receipt code is required for manual M-Pesa",
      });
    }
    if (value.method === "mpesa_stk" && !value.mpesa?.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["mpesa", "phone"],
        message: "Customer phone is required for STK Push",
      });
    }
    if (value.method === "pdq_card" && !value.pdq?.mode) {
      ctx.addIssue({
        code: "custom",
        path: ["pdq", "mode"],
        message: "PDQ mode is required for card payments",
      });
    }
  });

export const paymentSchema = z.object({
  id: ulid,
  tenant_id: ulid,
  venue_id: ulid,
  order_id: ulid,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amount_minor: z.number().int().nonnegative(),
  currency: z.literal("KES"),
  idempotency_key: z.string(),
  provider_ref: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string(),
  confirmed_at: z.string().nullable().optional(),
});

export const roleSchema = z.enum([
  "owner",
  "manager",
  "cashier",
  "waiter",
  "kitchen",
]);

export const pinLoginSchema = z.object({
  tenant_id: ulid,
  user_id: ulid,
  pin: z.string().regex(/^\d{4,8}$/),
  device_id: z.string().min(1).max(128).optional(),
});

export const staffMemberSchema = z.object({
  id: ulid,
  name: z.string().min(1),
  role: roleSchema,
});

export const bootstrapSchema = z.object({
  tenant: tenantSchema,
  venues: z.array(venueSchema),
  staff: z.array(staffMemberSchema),
});

export const sessionSchema = z.object({
  session_id: ulid,
  tenant_id: ulid,
  user_id: ulid,
  name: z.string().min(1),
  role: roleSchema,
  expires_at: z.string(),
});

export type Health = z.infer<typeof healthSchema>;
export type Version = z.infer<typeof versionSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Role = z.infer<typeof roleSchema>;
export type PinLogin = z.infer<typeof pinLoginSchema>;
export type StaffMember = z.infer<typeof staffMemberSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PdqMode = z.infer<typeof pdqModeSchema>;
export type CreatePayment = z.infer<typeof createPaymentSchema>;
export type Payment = z.infer<typeof paymentSchema>;
