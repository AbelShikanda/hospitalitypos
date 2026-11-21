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

export interface UsersTable {
  id: string;
  tenant_id: string;
  name: string;
  pin_hash: string;
  created_at: Timestamp;
}

export interface MembershipsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: Timestamp;
}

export interface Database {
  tenants: TenantsTable;
  venues: VenuesTable;
  users: UsersTable;
  memberships: MembershipsTable;
}
