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

export const menuModifierSchema = z.object({
  id: ulid,
  name: z.string().min(1),
  price_delta_minor: z.number().int(),
});

export const menuModifierGroupSchema = z.object({
  id: ulid,
  name: z.string().min(1),
  min_select: z.number().int().nonnegative(),
  max_select: z.number().int().positive(),
  modifiers: z.array(menuModifierSchema),
});

export const menuItemSchema = z.object({
  id: ulid,
  category_id: ulid,
  name: z.string().min(1),
  description: z.string().nullable(),
  price_minor: z.number().int().nonnegative(),
  tax_rate: z.number().int().nonnegative(),
  is_available: z.boolean(),
  modifier_groups: z.array(menuModifierGroupSchema),
});

export const menuCategorySchema = z.object({
  id: ulid,
  name: z.string().min(1),
  items: z.array(menuItemSchema),
});

export const menuSchema = z.object({
  venue_id: ulid,
  categories: z.array(menuCategorySchema),
});

export const floorTableSchema = z.object({
  id: ulid,
  area_id: ulid,
  name: z.string().min(1),
  seats: z.number().int().positive(),
  status: z.enum(["free", "occupied", "reserved"]),
});

export const floorAreaSchema = z.object({
  id: ulid,
  name: z.string().min(1),
  tables: z.array(floorTableSchema),
});

export const floorSchema = z.object({
  venue_id: ulid,
  areas: z.array(floorAreaSchema),
});

export const createMenuItemSchema = z.object({
  category_id: ulid,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  price_minor: z.number().int().positive(),
  tax_rate: z.number().int().min(0).max(100).default(16),
  is_available: z.boolean().default(true),
});

export const createTableSchema = z.object({
  area_id: ulid,
  name: z.string().min(1).max(40),
  seats: z.number().int().min(1).max(50).default(2),
});

export const createOrderItemSchema = z.object({
  item_id: ulid,
  quantity: z.number().int().min(1).max(99).default(1),
  notes: z.string().max(500).optional(),
  modifier_ids: z.array(ulid).max(20).optional(),
});

export const createOrderSchema = z.object({
  venue_id: ulid,
  table_id: ulid.optional(),
  notes: z.string().max(500).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  items: z.array(createOrderItemSchema).min(1).max(100),
});

export const addOrderItemsSchema = z.object({
  idempotency_key: z.string().min(8).max(128).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(createOrderItemSchema).min(1).max(100),
});

export const orderStatusSchema = z.enum([
  "open",
  "sent",
  "preparing",
  "ready",
  "served",
  "closed",
  "voided",
]);

export const orderItemSchema = z.object({
  id: ulid,
  item_id: ulid,
  name: z.string().min(1),
  unit_price_minor: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  tax_rate: z.number().int().nonnegative(),
  line_total_minor: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  status: z.string(),
  modifiers: z.array(
    z.object({
      id: ulid,
      modifier_id: ulid,
      name: z.string().min(1),
      price_delta_minor: z.number().int(),
    }),
  ),
});

export const orderSchema = z.object({
  id: ulid,
  tenant_id: ulid,
  venue_id: ulid,
  table_id: ulid.nullable(),
  number: z.string().min(1),
  status: orderStatusSchema,
  subtotal_minor: z.number().int().nonnegative(),
  tax_minor: z.number().int().nonnegative(),
  total_minor: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  idempotency_key: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(orderItemSchema),
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
export type MenuModifier = z.infer<typeof menuModifierSchema>;
export type MenuModifierGroup = z.infer<typeof menuModifierGroupSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type Menu = z.infer<typeof menuSchema>;
export type FloorTable = z.infer<typeof floorTableSchema>;
export type FloorArea = z.infer<typeof floorAreaSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type CreateMenuItem = z.infer<typeof createMenuItemSchema>;
export type CreateTable = z.infer<typeof createTableSchema>;
export type CreateOrderItem = z.infer<typeof createOrderItemSchema>;
export type CreateOrder = z.infer<typeof createOrderSchema>;
export type AddOrderItems = z.infer<typeof addOrderItemsSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PdqMode = z.infer<typeof pdqModeSchema>;
export type CreatePayment = z.infer<typeof createPaymentSchema>;
export type Payment = z.infer<typeof paymentSchema>;
