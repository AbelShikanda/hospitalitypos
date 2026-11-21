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

export type Health = z.infer<typeof healthSchema>;
export type Version = z.infer<typeof versionSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type Venue = z.infer<typeof venueSchema>;
