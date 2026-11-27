import type { ColumnType } from "kysely";

type Timestamp = ColumnType<string, string, string>;

export interface TenantsTable {
  id: string;
  name: string;
  created_at: Timestamp;
}

export interface VenuesTable {
  id: string;
  tenant_id: string;
  name: string;
  created_at: Timestamp;
}

export interface VenueSettingsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  stock_enabled: number;
  tip_enabled: number;
  tip_threshold_minor: number;
  tip_percent: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface FeedbackTable {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  user_id: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UsersTable {
  id: string;
  tenant_id: string;
  name: string;
  pin_hash: string;
  is_active: number;
  created_at: Timestamp;
}

export interface MembershipsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: Timestamp;
}

export interface SessionsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  device_id: string | null;
  created_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface StationsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  type: string;
  created_at: Timestamp;
}

export interface MenuCategoriesTable {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  created_at: Timestamp;
}

export interface MenuItemsTable {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  tax_rate: number;
  course: string;
  station_id: string | null;
  is_available: number;
  sort_order: number;
  created_at: Timestamp;
}

export interface ModifierGroupsTable {
  id: string;
  tenant_id: string;
  name: string;
  min_select: number;
  max_select: number;
  created_at: Timestamp;
}

export interface ModifiersTable {
  id: string;
  tenant_id: string;
  group_id: string;
  name: string;
  price_delta_minor: number;
  sort_order: number;
  created_at: Timestamp;
}

export interface MenuItemModifierGroupsTable {
  id: string;
  tenant_id: string;
  item_id: string;
  group_id: string;
  created_at: Timestamp;
}

export interface VenuePricesTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  item_id: string;
  price_minor: number;
  created_at: Timestamp;
}

export interface AreasTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  sort_order: number;
  created_at: Timestamp;
}

export interface DiningTablesTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  area_id: string;
  name: string;
  seats: number;
  status: string;
  created_at: Timestamp;
}

export interface OrdersTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  table_id: string | null;
  number: string;
  status: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  notes: string | null;
  discount_minor: number;
  discount_reason: string | null;
  idempotency_key: string | null;
  opened_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  closed_at: Timestamp | null;
}

export interface OrderItemsTable {
  id: string;
  tenant_id: string;
  order_id: string;
  item_id: string;
  name_snapshot: string;
  unit_price_minor: number;
  quantity: number;
  tax_rate: number;
  course: string;
  station_id: string | null;
  line_total_minor: number;
  notes: string | null;
  status: string;
  created_at: Timestamp;
}

export interface OrderItemModifiersTable {
  id: string;
  tenant_id: string;
  order_item_id: string;
  modifier_id: string;
  name_snapshot: string;
  price_delta_minor: number;
}

export interface OrderEventsTable {
  id: string;
  tenant_id: string;
  order_id: string;
  type: string;
  data: string;
  idempotency_key: string | null;
  actor_user_id: string | null;
  created_at: Timestamp;
}

export interface OutboxEventsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  entity: string;
  entity_id: string;
  op: string;
  payload: string;
  idempotency_key: string;
  created_at: Timestamp;
  synced_at: Timestamp | null;
  attempts: number;
}

export interface InboxMessagesTable {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  entity: string;
  entity_id: string;
  op: string;
  payload: string;
  idempotency_key: string;
  created_at: Timestamp;
  applied_at: Timestamp | null;
}

export interface SyncCursorsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  last_outbox_at: Timestamp | null;
  last_inbox_at: Timestamp | null;
  updated_at: Timestamp;
}

export interface HeartbeatsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  version: string;
  schema_version: number;
  status: string;
  last_seen_at: Timestamp;
}

export interface CloudJobsTable {
  id: string;
  tenant_id: string;
  type: string;
  payload: string;
  status: string;
  attempts: number;
  run_at: Timestamp;
  error: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ApiTokensTable {
  id: string;
  tenant_id: string;
  name: string;
  token_hash: string;
  created_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface SubscriptionsTable {
  id: string;
  tenant_id: string;
  plan: string;
  status: string;
  trial_ends_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CloudBackupsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  location: string;
  checksum: string;
  size_bytes: number;
  created_at: Timestamp;
}

export interface StockItemsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  unit: string;
  quantity: number;
  par_level: number;
  cost_minor: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RecipesTable {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  stock_item_id: string;
  quantity: number;
  created_at: Timestamp;
}

export interface StockMovementsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  stock_item_id: string;
  type: string;
  quantity_delta: number;
  reason: string | null;
  reference_id: string | null;
  order_id: string | null;
  actor_user_id: string | null;
  created_at: Timestamp;
}

export interface SuppliersTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: Timestamp;
}

export interface ShiftsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  user_id: string;
  status: string;
  starting_cash_minor: number;
  counted_cash_minor: number | null;
  notes: string | null;
  clock_in_notes: string | null;
  opened_by: string;
  closed_by: string | null;
  clock_in_at: Timestamp;
  clock_out_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PaymentsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  order_id: string;
  method: string;
  status: string;
  amount_minor: number;
  tip_minor: number;
  currency: string;
  idempotency_key: string;
  provider_ref: string | null;
  details: string;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  confirmed_at: Timestamp | null;
}

export interface PaymentCredentialsTable {
  id: string;
  tenant_id: string;
  provider: string;
  environment: string;
  encrypted_config: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PaymentEventsTable {
  id: string;
  tenant_id: string;
  payment_id: string;
  type: string;
  data: string;
  actor_user_id: string | null;
  idempotency_key: string | null;
  created_at: Timestamp;
}

export interface PrintJobsTable {
  id: string;
  tenant_id: string;
  venue_id: string;
  order_id: string;
  type: string;
  payload: string;
  status: string;
  attempts: number;
  error: string | null;
  idempotency_key: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SystemEventsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string;
  details: string | null;
  created_at: Timestamp;
}

export interface Database {
  tenants: TenantsTable;
  stations: StationsTable;
  venues: VenuesTable;
  venue_settings: VenueSettingsTable;
  feedback: FeedbackTable;
  users: UsersTable;
  memberships: MembershipsTable;
  sessions: SessionsTable;
  menu_categories: MenuCategoriesTable;
  menu_items: MenuItemsTable;
  modifier_groups: ModifierGroupsTable;
  modifiers: ModifiersTable;
  menu_item_modifier_groups: MenuItemModifierGroupsTable;
  venue_prices: VenuePricesTable;
  areas: AreasTable;
  dining_tables: DiningTablesTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  order_item_modifiers: OrderItemModifiersTable;
  order_events: OrderEventsTable;
  print_jobs: PrintJobsTable;
  payments: PaymentsTable;
  payment_events: PaymentEventsTable;
  payment_credentials: PaymentCredentialsTable;
  shifts: ShiftsTable;
  stock_items: StockItemsTable;
  recipes: RecipesTable;
  stock_movements: StockMovementsTable;
  suppliers: SuppliersTable;
  outbox_events: OutboxEventsTable;
  inbox_messages: InboxMessagesTable;
  sync_cursors: SyncCursorsTable;
  heartbeats: HeartbeatsTable;
  cloud_jobs: CloudJobsTable;
  api_tokens: ApiTokensTable;
  subscriptions: SubscriptionsTable;
  cloud_backups: CloudBackupsTable;
  system_events: SystemEventsTable;
}
