import { z } from "zod";

export const ulid = z.string().length(26);

export const courseSchema = z.enum([
  "starter",
  "main",
  "dessert",
  "drink",
  "other",
]);

export const printReceiptSchema = z.object({
  order_id: ulid,
  discount_percent: z.number().min(0).max(100).default(0),
  tip_minor: z.number().int().nonnegative().default(0),
  kick_drawer: z.boolean().default(false),
  idempotency_key: z.string().min(8).max(128).optional(),
});

export const printJobSchema = z.object({
  id: ulid,
  order_id: ulid,
  type: z.string(),
  status: z.enum(["queued", "sent", "failed"]),
  attempts: z.number().int(),
  error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const outboxEventSchema = z.object({
  id: ulid,
  tenant_id: ulid,
  venue_id: ulid,
  entity: z.string().min(1).max(40),
  entity_id: ulid,
  op: z.string().min(1).max(20),
  payload: z.string(),
  idempotency_key: z.string().min(8).max(128),
  created_at: z.string(),
});

export const syncPushSchema = z.object({
  events: z.array(outboxEventSchema).max(200),
});

export const heartbeatSchema = z.object({
  venue_id: ulid,
  version: z.string().min(1).max(40),
  schema_version: z.number().int().positive(),
  status: z.enum(["online", "degraded", "offline"]).default("online"),
});

export const publishCatalogSchema = z.object({
  venue_id: ulid,
  categories: z.array(
    z.object({
      id: ulid,
      name: z.string().min(1),
      sort_order: z.number().int().default(0),
    }),
  ),
  items: z.array(
    z.object({
      id: ulid,
      category_id: ulid,
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      price_minor: z.number().int().nonnegative(),
      tax_rate: z.number().int().nonnegative().default(16),
      course: courseSchema.default("main"),
      is_available: z.boolean().default(true),
    }),
  ),
});

export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(120),
});

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

export const updateVenueSettingsSchema = z.object({
  venue_id: ulid,
  stock_enabled: z.boolean().optional(),
  tip_enabled: z.boolean().optional(),
  tip_threshold_minor: z.number().int().nonnegative().optional(),
  tip_percent: z.number().min(0).max(100).optional(),
});

export const venueSettingsSchema = z.object({
  venue_id: ulid,
  stock_enabled: z.boolean(),
  tip_enabled: z.boolean(),
  tip_threshold_minor: z.number().int().nonnegative(),
  tip_percent: z.number().int().min(0).max(100),
});

export const feedbackCategorySchema = z.enum([
  "bug",
  "improvement",
  "question",
  "other",
]);

export const createFeedbackSchema = z.object({
  venue_id: ulid.optional(),
  category: feedbackCategorySchema.default("other"),
  subject: z.string().min(3).max(160),
  message: z.string().min(5).max(4000),
});

export const feedbackSchema = z.object({
  id: ulid,
  venue_id: ulid.nullable(),
  user_id: ulid,
  user_name: z.string(),
  category: feedbackCategorySchema,
  subject: z.string(),
  message: z.string(),
  status: z.string(),
  created_at: z.string(),
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
    tip_minor: z.number().int().nonnegative().default(0),
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

export const createStockItemSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(20).default("pcs"),
  quantity: z.number().int().nonnegative().default(0),
  par_level: z.number().int().nonnegative().default(0),
  cost_minor: z.number().int().nonnegative().default(0),
});

export const createRecipeSchema = z.object({
  menu_item_id: ulid,
  stock_item_id: ulid,
  quantity: z.number().int().positive(),
});

export const adjustStockSchema = z.object({
  quantity_delta: z.number().int(),
  reason: z.string().min(3).max(500),
});

export const stockCountSchema = z.object({
  counted_quantity: z.number().int().nonnegative(),
  reason: z.string().min(3).max(500),
});

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),
});

export const lifecycleSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  confirmation: z.string().min(1).max(40),
});

export const clockInSchema = z.object({
  venue_id: ulid,
  starting_cash_minor: z.number().int().nonnegative().default(0),
  notes: z.string().max(500).optional(),
});

export const clockOutSchema = z.object({
  counted_cash_minor: z.number().int().nonnegative().default(0),
  notes: z.string().max(500).optional(),
});

export const applyDiscountSchema = z.object({
  discount_minor: z.number().int().positive(),
  reason: z.string().min(3).max(500),
  idempotency_key: z.string().min(8).max(128).optional(),
});

export const shiftSchema = z.object({
  id: ulid,
  venue_id: ulid,
  user_id: ulid,
  status: z.string(),
  starting_cash_minor: z.number().int().nonnegative(),
  counted_cash_minor: z.number().int().nonnegative().nullable(),
  notes: z.string().nullable(),
  clock_in_notes: z.string().nullable().optional(),
  clock_in_at: z.string(),
  clock_out_at: z.string().nullable(),
});

export const darajaCredentialsSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  consumer_key: z.string().min(4).max(256),
  consumer_secret: z.string().min(4).max(256),
  shortcode: z.string().min(4).max(32),
  passkey: z.string().min(4).max(256),
  callback_url: z.string().url().optional(),
});

export const credentialSummarySchema = z.object({
  id: ulid,
  provider: z.string(),
  environment: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(["confirmed", "cancelled"]),
  reason: z.string().max(500).optional(),
});

export const reversePaymentSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const paymentSchema = z.object({
  id: ulid,
  tenant_id: ulid,
  venue_id: ulid,
  order_id: ulid,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  amount_minor: z.number().int().nonnegative(),
  tip_minor: z.number().int().nonnegative(),
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
  "housekeeping",
]);

export const createStaffSchema = z.object({
  name: z.string().min(1).max(120),
  pin: z.string().regex(/^\d{4,8}$/),
  role: roleSchema,
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  role: roleSchema.optional(),
});

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
  is_active: z.boolean().optional(),
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

export const stationSchema = z.object({
  id: ulid,
  name: z.string().min(1),
  type: z.enum(["kitchen", "bar"]),
});

export const createStationSchema = z.object({
  venue_id: ulid,
  name: z.string().min(1).max(120),
  type: z.enum(["kitchen", "bar"]).default("kitchen"),
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
  course: courseSchema,
  station_id: ulid.nullable().optional(),
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
  course: courseSchema.default("main"),
  station_id: ulid.nullable().optional(),
  is_available: z.boolean().default(true),
});

export const updateMenuItemSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  price_minor: z.number().int().positive().optional(),
  tax_rate: z.number().int().min(0).max(100).optional(),
  course: courseSchema.optional(),
  station_id: ulid.nullable().optional(),
  is_available: z.boolean().optional(),
});

export const createMenuCategorySchema = z.object({
  name: z.string().min(1).max(120),
  sort_order: z.number().int().nonnegative().default(0),
});

export const updateTableSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  seats: z.number().int().min(1).max(50).optional(),
  area_id: ulid.optional(),
});

export const createAreaSchema = z.object({
  venue_id: ulid,
  name: z.string().min(1).max(120),
  sort_order: z.number().int().nonnegative().default(0),
});

export const updateOrderNotesSchema = z.object({
  notes: z.string().max(500).nullable(),
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
  id: ulid.optional(),
  venue_id: ulid,
  table_id: ulid.optional(),
  notes: z.string().max(500).optional(),
  idempotency_key: z.string().min(8).max(128).optional(),
  send: z.boolean().default(false),
  course: courseSchema.optional(),
  items: z.array(createOrderItemSchema).min(1).max(100),
});

export const addOrderItemsSchema = z.object({
  idempotency_key: z.string().min(8).max(128).optional(),
  notes: z.string().max(500).optional(),
  send: z.boolean().default(false),
  course: courseSchema.optional(),
  items: z.array(createOrderItemSchema).min(1).max(100),
});

export const sendOrderSchema = z.object({
  course: courseSchema.optional(),
});

export const moveOrderSchema = z.object({
  table_id: ulid.nullable(),
  idempotency_key: z.string().min(8).max(128).optional(),
});

export const mergeOrderSchema = z.object({
  target_order_id: ulid,
  idempotency_key: z.string().min(8).max(128).optional(),
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

export const updateOrderStatusSchema = z
  .object({
    status: orderStatusSchema,
    reason: z.string().min(3).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "voided" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required when voiding an order",
      });
    }
  });

export const orderItemSchema = z.object({
  id: ulid,
  item_id: ulid,
  name: z.string().min(1),
  unit_price_minor: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  tax_rate: z.number().int().nonnegative(),
  course: courseSchema,
  station_id: ulid.nullable().optional(),
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
  discount_minor: z.number().int().nonnegative().default(0),
  discount_reason: z.string().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(orderItemSchema),
});

export type PrintReceipt = z.infer<typeof printReceiptSchema>;
export type PrintJob = z.infer<typeof printJobSchema>;
export type Station = z.infer<typeof stationSchema>;
export type CreateStation = z.infer<typeof createStationSchema>;
export type OutboxEvent = z.infer<typeof outboxEventSchema>;
export type SyncPush = z.infer<typeof syncPushSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type PublishCatalog = z.infer<typeof publishCatalogSchema>;
export type CreateApiToken = z.infer<typeof createApiTokenSchema>;
export type Health = z.infer<typeof healthSchema>;
export type Version = z.infer<typeof versionSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type Role = z.infer<typeof roleSchema>;
export type PinLogin = z.infer<typeof pinLoginSchema>;
export type StaffMember = z.infer<typeof staffMemberSchema>;
export type CreateStaff = z.infer<typeof createStaffSchema>;
export type UpdateStaff = z.infer<typeof updateStaffSchema>;
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
export type UpdateMenuItem = z.infer<typeof updateMenuItemSchema>;
export type CreateMenuCategory = z.infer<typeof createMenuCategorySchema>;
export type UpdateTable = z.infer<typeof updateTableSchema>;
export type CreateArea = z.infer<typeof createAreaSchema>;
export type UpdateOrderNotes = z.infer<typeof updateOrderNotesSchema>;
export type UpdateVenueSettings = z.infer<typeof updateVenueSettingsSchema>;
export type VenueSettings = z.infer<typeof venueSettingsSchema>;
export type CreateFeedback = z.infer<typeof createFeedbackSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type CreateTable = z.infer<typeof createTableSchema>;
export type CreateOrderItem = z.infer<typeof createOrderItemSchema>;
export type CreateOrder = z.infer<typeof createOrderSchema>;
export type AddOrderItems = z.infer<typeof addOrderItemsSchema>;
export type SendOrder = z.infer<typeof sendOrderSchema>;
export type MoveOrder = z.infer<typeof moveOrderSchema>;
export type MergeOrder = z.infer<typeof mergeOrderSchema>;
export type Course = z.infer<typeof courseSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type UpdateOrderStatus = z.infer<typeof updateOrderStatusSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PdqMode = z.infer<typeof pdqModeSchema>;
export type CreatePayment = z.infer<typeof createPaymentSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type CreateStockItem = z.infer<typeof createStockItemSchema>;
export type CreateRecipe = z.infer<typeof createRecipeSchema>;
export type AdjustStock = z.infer<typeof adjustStockSchema>;
export type StockCount = z.infer<typeof stockCountSchema>;
export type CreateSupplier = z.infer<typeof createSupplierSchema>;
export type ClockIn = z.infer<typeof clockInSchema>;
export type ClockOut = z.infer<typeof clockOutSchema>;
export type ApplyDiscount = z.infer<typeof applyDiscountSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type DarajaCredentials = z.infer<typeof darajaCredentialsSchema>;
export type CredentialSummary = z.infer<typeof credentialSummarySchema>;
export type UpdatePaymentStatus = z.infer<typeof updatePaymentStatusSchema>;
export type ReversePayment = z.infer<typeof reversePaymentSchema>;
