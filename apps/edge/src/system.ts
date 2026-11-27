import { lifecycleSchema } from '@hpos/contracts';
import type { Db } from '@hpos/db';
import { newId } from '@hpos/domain';
import { verifyPin } from '@hpos/auth';
import type { Context, Hono } from 'hono';
import { requireAuth, requireRole, type AppEnv } from './auth.js';

export interface LifecycleHooks {
  restart: () => void | Promise<void>;
  shutdown: () => void | Promise<void>;
}

const lifecycleAttempts = new Map<string, number[]>();

const CONFIRMATIONS = {
  restart: 'RESTART',
  shutdown: 'SHUT DOWN',
} as const;

export function registerSystemRoutes(
  app: Hono<AppEnv>,
  db: Db,
  hooks: LifecycleHooks,
) {
  async function handle(
    action: 'restart' | 'shutdown',
    context: Context<AppEnv>,
  ) {
    const body = await context.req.json().catch(() => null);
    const parsed = lifecycleSchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'invalid_input' }, 400);
    }
    if (
      parsed.data.confirmation.trim().toUpperCase() !== CONFIRMATIONS[action]
    ) {
      return context.json({ error: 'confirmation_mismatch' }, 400);
    }

    const auth = context.get('auth');
    const rateKey = `${auth.tenantId}:${auth.userId}`;
    const nowMs = Date.now();
    const recent = (lifecycleAttempts.get(rateKey) ?? []).filter(
      (attempt) => nowMs - attempt < 60_000,
    );
    if (recent.length >= 5) {
      return context.json({ error: 'too_many_attempts' }, 429);
    }
    recent.push(nowMs);
    lifecycleAttempts.set(rateKey, recent);

    const user = await db
      .selectFrom('users')
      .select('pin_hash')
      .where('id', '=', auth.userId)
      .where('tenant_id', '=', auth.tenantId)
      .where('is_active', '=', 1)
      .executeTakeFirst();
    if (!user || !verifyPin(parsed.data.pin, user.pin_hash)) {
      return context.json({ error: 'invalid_pin' }, 401);
    }

    const [openOrders, openShifts] = await Promise.all([
      db
        .selectFrom('orders')
        .select('id')
        .where('tenant_id', '=', auth.tenantId)
        .where('status', 'not in', ['closed', 'voided'])
        .execute(),
      db
        .selectFrom('shifts')
        .select('id')
        .where('tenant_id', '=', auth.tenantId)
        .where('status', '=', 'open')
        .execute(),
    ]);
    if (openOrders.length > 0 || openShifts.length > 0) {
      return context.json(
        {
          error: 'system_busy',
          open_orders: openOrders.length,
          open_shifts: openShifts.length,
        },
        409,
      );
    }

    await db
      .insertInto('system_events')
      .values({
        id: newId(),
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        action,
        details: JSON.stringify({ source: 'settings' }),
        created_at: new Date().toISOString(),
      })
      .execute();

    setTimeout(() => {
      void Promise.resolve(hooks[action]()).catch(() => undefined);
    }, 100);

    return context.json(
      { status: action === 'restart' ? 'restarting' : 'stopping' },
      202,
    );
  }

  app.post(
    '/api/system/restart',
    requireAuth(db),
    requireRole('owner'),
    (context) => handle('restart', context),
  );
  app.post(
    '/api/system/shutdown',
    requireAuth(db),
    requireRole('owner'),
    (context) => handle('shutdown', context),
  );
}
