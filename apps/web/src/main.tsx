import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  billTotals,
  formatReceiptText,
  newId,
  outstandingMinor,
  splitBill,
  toMinor,
} from "@hpos/domain";
import "@hpos/ui/styles/tokens.css";
import "./styles.css";
import {
  dismissOutboxFailure,
  enqueueOutbox,
  flushOutbox,
  getOutboxCount,
  subscribeOutbox,
  subscribeOutboxFailures,
  type OutboxFailure,
} from "./outbox.js";
import { navVisibleInMode, resolveAppMode } from "./mode.js";
import {
  applyUpdate,
  checkForUpdates,
  getUpdateState,
  setBillOpen,
  startUpdateRegistration,
  subscribeToUpdates,
  type UpdateState,
} from "./updates.js";

type Role =
  | "owner"
  | "manager"
  | "cashier"
  | "waiter"
  | "kitchen"
  | "housekeeping";

type Course = "starter" | "main" | "dessert" | "drink" | "other";

const COURSE_LABELS: Record<Course, string> = {
  starter: "Starter",
  main: "Main",
  dessert: "Dessert",
  drink: "Drink",
  other: "Other",
};

const COURSE_ORDER: Course[] = [
  "starter",
  "main",
  "dessert",
  "drink",
  "other",
];

type Staff = { id: string; name: string; role: Role };
type Venue = {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
};
type Tenant = { id: string; name: string; created_at: string };
type Bootstrap = { tenant: Tenant; venues: Venue[]; staff: Staff[] };

type Session = {
  session_id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  role: Role;
  expires_at: string;
};

type Health = {
  status: string;
  mode: string;
  version: string;
};

type Modifier = {
  id: string;
  name: string;
  price_delta_minor: number;
};

type ModifierGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  modifiers: Modifier[];
};

type MenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  tax_rate: number;
  course: Course;
  is_available: boolean;
  modifier_groups: ModifierGroup[];
};

type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

type Menu = {
  venue_id: string;
  categories: MenuCategory[];
};

type FloorTable = {
  id: string;
  area_id: string;
  name: string;
  seats: number;
  status: "free" | "occupied" | "reserved";
};

type FloorArea = {
  id: string;
  name: string;
  tables: FloorTable[];
};

type Floor = {
  venue_id: string;
  areas: FloorArea[];
};

type OrderSummary = {
  id: string;
  number: string;
  status: string;
  table_id: string | null;
  table_name: string | null;
  total_minor: number;
  created_at: string;
};

type PrintJobSummary = {
  id: string;
  order_id: string;
  status: "queued" | "sent" | "failed";
  attempts: number;
  error: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  order_id: string;
  method: string;
  status: string;
  amount_minor: number;
  tip_minor: number;
  provider_ref: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type Station = {
  id: string;
  name: string;
  type: "kitchen" | "bar";
};

type KdsTicket = {
  id: string;
  number: string;
  status: string;
  table_name: string | null;
  created_at: string;
  notes: string | null;
  items: Order["items"];
};

type Report = {
  from: string;
  to: string;
  summary: {
    orders: number;
    gross_minor: number;
    net_minor: number;
    tax_minor: number;
    discounts_minor: number;
    tips_minor: number;
    voids_minor: number;
    captured_minor: number;
  };
  payment_mix: Array<{ method: string; minor: number; tips_minor: number }>;
  items: Array<{
    item_id: string;
    name: string;
    category: string;
    quantity: number;
    gross_minor: number;
  }>;
  categories: Array<{ category: string; quantity: number; gross_minor: number }>;
  staff: Array<{
    user_id: string;
    name: string;
    orders: number;
    gross_minor: number;
    captured_minor: number;
  }>;
  vat: Array<{
    tax_rate: number;
    gross_minor: number;
    net_minor: number;
    tax_minor: number;
  }>;
};

type StockItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  par_level: number;
  cost_minor: number;
  is_low?: boolean;
};

type Recipe = {
  id: string;
  menu_item_id: string;
  stock_item_id: string;
  quantity: number;
};

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Shift = {
  id: string;
  venue_id: string;
  user_id: string;
  status: string;
  starting_cash_minor: number;
  counted_cash_minor: number | null;
  notes: string | null;
  clock_in_notes?: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
};

type ShiftReport = {
  shift: Shift;
  sales: {
    orders: number;
    gross_minor: number;
    discounts_minor: number;
    net_minor: number;
  };
  payment_mix: Array<{ method: string; minor: number }>;
  cash: {
    starting_minor: number;
    expected_minor: number;
    counted_minor: number;
    variance_minor: number;
  };
  tips?: {
    enabled: boolean;
    eligible: boolean;
    threshold_minor: number;
    percent: number;
    staff_tip_minor: number;
  };
};

type ReconciliationRow = {
  method: string;
  attempts: number;
  expected_minor: number;
  captured_minor: number;
  pending_minor: number;
  reversed_minor: number;
};

type Order = {
  id: string;
  number: string;
  status: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  table_id: string | null;
  notes: string | null;
  discount_minor: number;
  discount_reason: string | null;
  items: Array<{
    id: string;
    item_id: string;
    name: string;
    unit_price_minor: number;
    quantity: number;
    tax_rate: number;
    course: "starter" | "main" | "dessert" | "drink" | "other";
    line_total_minor: number;
    notes: string | null;
    status: string;
    modifiers: Array<{ name: string }>;
  }>;
};

type CartLine = {
  key: string;
  item: MenuItem;
  quantity: number;
  modifiers: Modifier[];
  note: string;
};

type VenueSettings = {
  venue_id: string;
  stock_enabled: boolean;
  tip_enabled: boolean;
  tip_threshold_minor: number;
  tip_percent: number;
};

type Feedback = {
  id: string;
  venue_id: string | null;
  user_id: string;
  user_name: string;
  category: "bug" | "improvement" | "question" | "other";
  subject: string;
  message: string;
  status: string;
  created_at: string;
};

type Phase = "loading" | "login" | "ready" | "offline";
type SystemState = "running" | "restarting" | "stopped";

const NAV_ITEMS = [
  "Tables",
  "Orders",
  "Bill",
  "Menu",
  "KDS",
  "Stock",
  "Reports",
  "Shifts",
  "Staff",
  "Feedback",
  "Settings",
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

const ROLE_NAV: Record<Role, NavItem[]> = {
  owner: [...NAV_ITEMS],
  manager: [
    "Tables",
    "Orders",
    "Bill",
    "Menu",
    "KDS",
    "Stock",
    "Reports",
    "Shifts",
    "Staff",
    "Feedback",
  ],
  cashier: ["Tables", "Orders", "Bill", "Menu", "KDS", "Shifts"],
  waiter: ["Tables", "Orders", "Bill", "Menu", "Shifts"],
  kitchen: ["KDS", "Shifts"],
  housekeeping: ["Shifts"],
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
  housekeeping: "Housekeeping",
};

const PIN_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "clear",
  "0",
  "del",
] as const;

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let code = `request_failed_${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      code = `request_failed_${response.status}`;
    }
    throw new Error(code.replaceAll("_", " "));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function iconUrl(): string {
  return `${import.meta.env.BASE_URL}icon.svg`;
}

function money(minor: number): string {
  return `KES ${(minor / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cartTotals(cart: CartLine[]) {
  let totalMinor = 0;
  let taxMinor = 0;

  for (const line of cart) {
    const delta = line.modifiers.reduce(
      (sum, modifier) => sum + modifier.price_delta_minor,
      0,
    );
    const lineTotal = (line.item.price_minor + delta) * line.quantity;
    const net = Math.round(lineTotal / (1 + line.item.tax_rate / 100));
    totalMinor += lineTotal;
    taxMinor += lineTotal - net;
  }

  return {
    totalMinor,
    taxMinor,
    subtotalMinor: totalMinor - taxMinor,
  };
}

function Splash({ phase, version }: { phase: Phase; version?: string }) {
  return (
    <div className="splash">
      <img className="splash-logo" src={iconUrl()} alt="Hospitality POS" />
      <h1>Hospitality POS</h1>
      <span className="splash-pill">
        <span
          className={`status-dot ${phase === "offline" ? "status-dot--danger" : "status-dot--success"}`}
        />
        {phase === "offline" ? "Offline — retrying" : "Starting…"}
      </span>
      <p className="splash-version">{version ?? __APP_VERSION__}</p>
    </div>
  );
}

function Login({
  bootstrap,
  onSignedIn,
}: {
  bootstrap: Bootstrap;
  onSignedIn: (session: Session) => void;
}) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const venue = bootstrap.venues[0];

  function press(key: (typeof PIN_KEYS)[number]) {
    setError("");
    if (key === "clear") {
      setPin("");
      return;
    }
    if (key === "del") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    setPin((current) => (current.length >= 8 ? current : current + key));
  }

  async function signIn() {
    if (!staff || pin.length < 4) {
      setError("Enter at least 4 digits.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: bootstrap.tenant.id,
          user_id: staff.id,
          pin,
        }),
      });

      if (response.status === 401) {
        setError("Wrong PIN. Try again.");
        setPin("");
        return;
      }
      if (!response.ok) {
        setError("Could not sign in. Try again.");
        return;
      }

      onSignedIn((await response.json()) as Session);
    } catch {
      setError("Network error. Check the edge server.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderStaffCard(member: Staff) {
    return (
      <button
        key={member.id}
        className="staff-card"
        type="button"
        onClick={() => {
          setStaff(member);
          setPin("");
          setError("");
        }}
      >
        <span className="avatar">{initials(member.name)}</span>
        <span className="staff-name">{member.name}</span>
        <span className="staff-role">{ROLE_LABELS[member.role]}</span>
      </button>
    );
  }

  return (
    <div className="login">
      <section className="login-panel">
        <header className="login-head">
          <img src={iconUrl()} alt="" />
          <div>
            <strong>{bootstrap.tenant.name}</strong>
            <small>{venue?.name ?? "Main Venue"} · Staff sign in</small>
          </div>
        </header>

        {!staff ? (
          <>
            <h1>Who is on shift?</h1>
            <p className="login-hint">Select your name to enter your PIN.</p>
            {bootstrap.staff.some((member) => member.role === "owner") ? (
              <>
                <span className="staff-section-label">Owner</span>
                <div className="staff-grid staff-grid--owner">
                  {bootstrap.staff
                    .filter((member) => member.role === "owner")
                    .map(renderStaffCard)}
                </div>
                <span className="staff-section-label">Team</span>
              </>
            ) : null}
            <div className="staff-grid">
              {bootstrap.staff
                .filter((member) => member.role !== "owner")
                .map(renderStaffCard)}
            </div>
          </>
        ) : (
          <>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                setStaff(null);
                setPin("");
                setError("");
              }}
            >
              ← Change staff
            </button>

            <div className="pin-head">
              <span className="avatar avatar--large">
                {initials(staff.name)}
              </span>
              <div>
                <h1>{staff.name}</h1>
                <p className="login-hint">{ROLE_LABELS[staff.role]}</p>
              </div>
            </div>

            <div
              className="pin-dots"
              aria-label={`${pin.length} digits entered`}
            >
              {Array.from({ length: 8 }, (_, index) => (
                <span
                  key={index}
                  className={`pin-dot ${index < pin.length ? "pin-dot--filled" : ""}`}
                />
              ))}
            </div>

            <div className="keypad">
              {PIN_KEYS.map((key) => (
                <button
                  key={key}
                  className={`key ${key === "clear" || key === "del" ? "key--action" : ""}`}
                  type="button"
                  onClick={() => press(key)}
                >
                  {key === "clear" ? "Clear" : key === "del" ? "Del" : key}
                </button>
              ))}
            </div>

            {error ? <p className="login-error">{error}</p> : null}

            <button
              className="btn-primary signin"
              type="button"
              disabled={submitting || pin.length < 4}
              onClick={signIn}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
      </section>

      <aside className="login-aside">
        <img src={iconUrl()} alt="" />
        <h2>Ready for service</h2>
        <p>
          Sign in on this tablet. The venue server keeps working even if the
          internet drops.
        </p>
        <span className="pill">
          <span className="status-dot status-dot--success" /> Edge online
        </span>
      </aside>
    </div>
  );
}

function ModifierDialog({
  item,
  onCancel,
  onConfirm,
}: {
  item: MenuItem;
  onCancel: () => void;
  onConfirm: (modifiers: Modifier[]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function toggle(group: ModifierGroup, modifier: Modifier) {
    setSelected((current) => {
      const ids = current[group.id] ?? [];
      if (ids.includes(modifier.id)) {
        return {
          ...current,
          [group.id]: ids.filter((id) => id !== modifier.id),
        };
      }
      if (group.max_select === 1) {
        return { ...current, [group.id]: [modifier.id] };
      }
      if (ids.length >= group.max_select) return current;
      return { ...current, [group.id]: [...ids, modifier.id] };
    });
  }

  const valid = item.modifier_groups.every((group) => {
    const count = (selected[group.id] ?? []).length;
    return count >= group.min_select && count <= group.max_select;
  });

  const chosen = item.modifier_groups.flatMap((group) =>
    group.modifiers.filter((modifier) =>
      (selected[group.id] ?? []).includes(modifier.id),
    ),
  );

  const delta = chosen.reduce(
    (sum, modifier) => sum + modifier.price_delta_minor,
    0,
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">Customise</span>
            <h2>{item.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel}>
            Close
          </button>
        </header>

        <div className="modal-body">
          {item.modifier_groups.map((group) => (
            <section className="modifier-group" key={group.id}>
              <header>
                <strong>{group.name}</strong>
                <small>
                  {group.min_select === 0
                    ? "Optional"
                    : `Choose ${group.min_select}`}
                  {group.max_select > 1 ? ` to ${group.max_select}` : ""}
                </small>
              </header>
              <div className="modifier-options">
                {group.modifiers.map((modifier) => {
                  const active = (selected[group.id] ?? []).includes(
                    modifier.id,
                  );
                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      className={`option ${active ? "option--selected" : ""}`}
                      onClick={() => toggle(group, modifier)}
                    >
                      <span>{modifier.name}</span>
                      <small>
                        {modifier.price_delta_minor
                          ? `+ ${money(modifier.price_delta_minor)}`
                          : "Included"}
                      </small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="modal-foot">
          <span className="cart-total">{money(item.price_minor + delta)}</span>
          <button
            className="btn-primary"
            type="button"
            disabled={!valid}
            onClick={() => onConfirm(chosen)}
          >
            Add to order
          </button>
        </footer>
      </div>
    </div>
  );
}

function OrderBuilder({
  table,
  venueId,
  existingOrderId,
  floor,
  orders,
  onClose,
  onDone,
}: {
  table: FloorTable;
  venueId: string;
  existingOrderId?: string;
  floor: Floor | null;
  orders: OrderSummary[];
  onClose: () => void;
  onDone: (
    order: Order,
    mode: "save" | "send" | "move" | "merge",
  ) => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [courseToSend, setCourseToSend] = useState<Course | "all">("all");
  const [pending, setPending] = useState<MenuItem | null>(null);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [targetKey, setTargetKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<
    "save" | "send" | "move" | "merge" | null
  >(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const newOrderId = useRef(newId());

  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, [cart]);

  useEffect(() => {
    const orderId = existingOrderId;
    if (!orderId) {
      setExistingOrder(null);
      return;
    }

    const orderUrl = `/api/orders/${encodeURIComponent(orderId)}`;
    let cancelled = false;
    async function loadOrder() {
      try {
        const response = await fetch(orderUrl, {
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("order failed");
        const data = (await response.json()) as Order;
        if (!cancelled) {
          setExistingOrder(data);
          setOrderNote(data.notes ?? "");
        }
      } catch {
        if (!cancelled) setError("Could not load the open tab.");
      }
    }

    void loadOrder();
    return () => {
      cancelled = true;
    };
  }, [existingOrderId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(
          `/api/menu?venue_id=${encodeURIComponent(venueId)}`,
          { credentials: "same-origin" },
        );
        if (!response.ok) throw new Error("menu failed");
        const data = (await response.json()) as Menu;
        if (cancelled) return;
        setMenu(data);
        setCategoryId(data.categories[0]?.id ?? "");
      } catch {
        if (!cancelled) setError("Could not load the menu.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const category = menu?.categories.find((entry) => entry.id === categoryId);
  const totals = useMemo(() => cartTotals(cart), [cart]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const pendingCourses = useMemo(() => {
    const courses = new Set<Course>(cart.map((line) => line.item.course));
    for (const item of existingOrder?.items ?? []) {
      if (item.status === "pending") courses.add(item.course);
    }
    return COURSE_ORDER.filter((course) => courses.has(course));
  }, [cart, existingOrder]);
  const selectedCourse: Course | "all" =
    courseToSend === "all" || pendingCourses.includes(courseToSend)
      ? courseToSend
      : "all";
  const freeTables = (floor?.areas.flatMap((area) => area.tables) ?? []).filter(
    (entry) => entry.status === "free",
  );
  const otherOrders = orders.filter(
    (order) =>
      order.id !== existingOrder?.id &&
      order.status !== "closed" &&
      order.status !== "voided",
  );

  function optimisticOrder(mode: "save" | "send"): Order {
    const newTotals = cartTotals(cart);
    const newItems = cart.map((line, index) => {
      const delta = line.modifiers.reduce(
        (sum, modifier) => sum + modifier.price_delta_minor,
        0,
      );
      const fired =
        mode === "send" &&
        (selectedCourse === "all" || line.item.course === selectedCourse);
      return {
        id: `local-${index}-${line.key}`,
        item_id: line.item.id,
        name: line.item.name,
        unit_price_minor: line.item.price_minor + delta,
        quantity: line.quantity,
        tax_rate: line.item.tax_rate,
        course: line.item.course,
        line_total_minor: (line.item.price_minor + delta) * line.quantity,
        notes: line.note.trim() || null,
        status: fired ? "sent" : "pending",
        modifiers: line.modifiers.map((modifier) => ({ name: modifier.name })),
      };
    });

    return {
      id: existingOrder?.id ?? newOrderId.current,
      number: existingOrder?.number ?? "#LOCAL",
      status:
        mode === "send"
          ? "sent"
          : (existingOrder?.status ?? "open"),
      subtotal_minor:
        (existingOrder?.subtotal_minor ?? 0) + newTotals.subtotalMinor,
      tax_minor: (existingOrder?.tax_minor ?? 0) + newTotals.taxMinor,
      total_minor: (existingOrder?.total_minor ?? 0) + newTotals.totalMinor,
      table_id: table.id,
      notes:
        (existingOrder ? orderNote : notes).trim() ||
        existingOrder?.notes ||
        null,
      discount_minor: existingOrder?.discount_minor ?? 0,
      discount_reason: existingOrder?.discount_reason ?? null,
      items: [...(existingOrder?.items ?? []), ...newItems],
    };
  }

  async function moveOrMerge() {
    if (!existingOrder || !targetKey) return;
    const [kind, id] = targetKey.split(":");
    if (!id) return;
    setError("");
    setSubmitting(kind === "table" ? "move" : "merge");
    try {
      if (kind === "table") {
        const updated = await request<Order>(
          `/api/orders/${existingOrder.id}/move`,
          {
            method: "POST",
            body: JSON.stringify({
              table_id: id,
              idempotency_key: crypto.randomUUID(),
            }),
          },
        );
        onDone(updated, "move");
      } else {
        const updated = await request<Order>(
          `/api/orders/${existingOrder.id}/merge`,
          {
            method: "POST",
            body: JSON.stringify({
              target_order_id: id,
              idempotency_key: crypto.randomUUID(),
            }),
          },
        );
        onDone(updated, "merge");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Move/merge failed: ${cause.message}`
          : "Move/merge failed. Try again.",
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function saveOrderNote() {
    if (!existingOrder) return;
    setError("");
    try {
      const updated = await request<Order>(
        `/api/orders/${existingOrder.id}/notes`,
        {
          method: "PATCH",
          body: JSON.stringify({ notes: orderNote.trim() || null }),
        },
      );
      setExistingOrder(updated);
      setOrderNote(updated.notes ?? "");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Note update failed: ${cause.message}`
          : "Note update failed. Try again.",
      );
    }
  }

  function addLine(item: MenuItem, modifiers: Modifier[], note = "") {
    const key = `${item.id}:${modifiers
      .map((modifier) => modifier.id)
      .sort()
      .join(",")}:${note}`;

    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { key, item, quantity: 1, modifiers, note }];
    });
  }

  function updateLineNote(key: string, note: string) {
    setCart((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              note,
              key: `${line.item.id}:${line.modifiers
                .map((modifier) => modifier.id)
                .sort()
                .join(",")}:${note}`,
            }
          : line,
      ),
    );
  }

  function chooseItem(item: MenuItem) {
    if (!item.is_available) return;
    if (item.modifier_groups.length) {
      setPending(item);
      return;
    }
    addLine(item, []);
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.key !== key) return [line];
        const quantity = line.quantity + delta;
        return quantity > 0 ? [{ ...line, quantity }] : [];
      }),
    );
  }

  function submit(mode: "save" | "send") {
    if (!cart.length) {
      setError("Add at least one item.");
      return;
    }

    setError("");
    try {
      const items = cart.map((line) => ({
        item_id: line.item.id,
        quantity: line.quantity,
        modifier_ids: line.modifiers.map((modifier) => modifier.id),
        ...(line.note.trim() ? { notes: line.note.trim() } : {}),
      }));
      const common = {
        idempotency_key: idempotencyKey.current,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        send: mode === "send",
        ...(mode === "send" && selectedCourse !== "all"
          ? { course: selectedCourse }
          : {}),
        items,
      };

      if (existingOrder) {
        enqueueOutbox({
          url: `/api/orders/${existingOrder.id}/items`,
          body: common,
        });
      } else {
        enqueueOutbox({
          url: "/api/orders",
          body: {
            id: newOrderId.current,
            venue_id: venueId,
            table_id: table.id,
            ...common,
          },
        });
      }

      onDone(optimisticOrder(mode), mode);
    } catch {
      setError("The order could not be queued. Try again.");
    }
  }

  return (
    <div className="order-builder">
      <header className="builder-head">
        <button className="link-button" type="button" onClick={onClose}>
          ← Back to floor
        </button>
        <div>
          <span className="eyebrow">
            {existingOrder ? "Open tab" : "New order"}
          </span>
          <h1>
            {table.name}{" "}
            <small>
              {existingOrder ? existingOrder.number : `${table.seats} seats`}
            </small>
          </h1>
        </div>
        <span className="pill">
          <span className="status-dot status-dot--success" /> Local
        </span>
      </header>

      {existingOrder ? (
        <section className="card tab-actions">
          <div className="tab-action tab-action--wide">
            <label>
              <span>Move or merge this tab</span>
              <select
                value={targetKey}
                onChange={(event) => setTargetKey(event.target.value)}
              >
                <option value="">Choose a free table or another tab</option>
                {freeTables.length ? (
                  <optgroup label="Free tables (move)">
                    {freeTables.map((entry) => (
                      <option key={entry.id} value={`table:${entry.id}`}>
                        {entry.name} · {entry.seats} seats
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {otherOrders.length ? (
                  <optgroup label="Open tabs (merge)">
                    {otherOrders.map((order) => (
                      <option key={order.id} value={`tab:${order.id}`}>
                        {order.number} · {order.table_name ?? "Takeaway"}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <button
              className="theme-button"
              type="button"
              disabled={submitting !== null || !targetKey}
              onClick={() => void moveOrMerge()}
            >
              {submitting === "move"
                ? "Moving…"
                : submitting === "merge"
                  ? "Merging…"
                  : "Move / merge"}
            </button>
          </div>
          {!freeTables.length && !otherOrders.length ? (
            <p className="muted">
              No free tables or other open tabs right now. Add more tables in
              Settings, or close another tab first.
            </p>
          ) : !freeTables.length ? (
            <p className="muted">
              No free tables right now — you can still merge into another open
              tab.
            </p>
          ) : !otherOrders.length ? (
            <p className="muted">
              No other open tabs to merge with — choose a free table to move
              this tab.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="builder-body">
        <section className="menu-panel">
          {loading ? <p className="muted">Loading menu…</p> : null}
          {menu ? (
            <>
              <div className="category-tabs">
                {menu.categories.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`category-tab ${entry.id === categoryId ? "category-tab--active" : ""}`}
                    onClick={() => setCategoryId(entry.id)}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>

              <div className="menu-grid">
                {(category?.items ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="menu-item"
                    disabled={!item.is_available}
                    onClick={() => chooseItem(item)}
                  >
                    <span className="menu-item-name">{item.name}</span>
                    <span className="menu-item-price">
                      {money(item.price_minor)}
                    </span>
                    <span className="menu-item-course">
                      {COURSE_LABELS[item.course]}
                    </span>
                    {!item.is_available ? (
                      <span className="menu-item-off">Unavailable</span>
                    ) : item.modifier_groups.length ? (
                      <span className="menu-item-options">Options</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <aside className="cart-panel">
          <header className="cart-head">
            <div>
              <span className="eyebrow">
                {existingOrder ? "New items" : "Order"}
              </span>
              <h2>
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </h2>
            </div>
            {cart.length ? (
              <button
                className="link-button"
                type="button"
                onClick={() => setCart([])}
              >
                Clear
              </button>
            ) : null}
          </header>

          {existingOrder ? (
            <div className="existing-order">
              <div className="cart-section-label">
                <span>Already ordered</span>
                <strong>{existingOrder.number}</strong>
              </div>
              <label className="note-field">
                <span>Order note</span>
                <textarea
                  value={orderNote}
                  maxLength={500}
                  rows={2}
                  placeholder="e.g. birthday, allergies, no onions"
                  onChange={(event) => setOrderNote(event.target.value)}
                />
              </label>
              <div className="builder-actions">
                <button
                  className="theme-button"
                  type="button"
                  onClick={() => void saveOrderNote()}
                >
                  Save order note
                </button>
              </div>
              <div className="cart-list cart-list--locked">
                {existingOrder.items.map((item) => (
                  <div className="cart-line cart-line--locked" key={item.id}>
                    <div className="cart-line-info">
                      <strong>
                        {item.quantity}× {item.name}
                      </strong>
                      <small>{COURSE_LABELS[item.course]}</small>
                      {item.modifiers.length ? (
                        <small>
                          {item.modifiers
                            .map((modifier) => modifier.name)
                            .join(" · ")}
                        </small>
                      ) : null}
                      {item.notes ? <small>{item.notes}</small> : null}
                    </div>
                    <span className="cart-line-total">
                      {money(item.line_total_minor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="cart-list">
            {cart.length === 0 ? (
              <p className="muted">Tap a menu item to start the order.</p>
            ) : (
              cart.map((line) => {
                const delta = line.modifiers.reduce(
                  (sum, modifier) => sum + modifier.price_delta_minor,
                  0,
                );
                return (
                  <div className="cart-line" key={line.key}>
                    <div className="cart-line-info">
                      <strong>{line.item.name}</strong>
                      {line.modifiers.length ? (
                        <small>
                          {line.modifiers
                            .map((modifier) => modifier.name)
                            .join(" · ")}
                        </small>
                      ) : null}
                      <small>
                        {money((line.item.price_minor + delta) * line.quantity)}
                      </small>
                    </div>
                    <div className="qty">
                      <button
                        type="button"
                        aria-label={`Remove one ${line.item.name}`}
                        onClick={() => changeQuantity(line.key, -1)}
                      >
                        −
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Add one ${line.item.name}`}
                        onClick={() => changeQuantity(line.key, 1)}
                      >
                        +
                      </button>
                    </div>
                    <input
                      className="line-note"
                      value={line.note}
                      maxLength={200}
                      placeholder="Item note (e.g. no onions)"
                      onChange={(event) =>
                        updateLineNote(line.key, event.target.value)
                      }
                    />
                  </div>
                );
              })
            )}
          </div>

          <label className="note-field">
            <span>{existingOrder ? "Note for this round" : "Order note"}</span>
            <textarea
              value={notes}
              maxLength={500}
              rows={2}
              placeholder="e.g. no onions, extra napkins"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {pendingCourses.length ? (
            <label className="course-field">
              <span>Fire course</span>
              <select
                value={selectedCourse}
                onChange={(event) =>
                  setCourseToSend(event.target.value as Course | "all")
                }
              >
                <option value="all">All pending</option>
                {pendingCourses.map((course) => (
                  <option key={course} value={course}>
                    {COURSE_LABELS[course]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="cart-summary">
            {existingOrder ? (
              <>
                <div>
                  <span>Existing bill</span>
                  <span>{money(existingOrder.total_minor)}</span>
                </div>
                <div>
                  <span>New items</span>
                  <span>{money(totals.totalMinor)}</span>
                </div>
                <div className="cart-total">
                  <span>Total after save</span>
                  <strong>
                    {money(existingOrder.total_minor + totals.totalMinor)}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span>Subtotal</span>
                  <span>{money(totals.subtotalMinor)}</span>
                </div>
                <div>
                  <span>VAT</span>
                  <span>{money(totals.taxMinor)}</span>
                </div>
                <div className="cart-total">
                  <span>Total</span>
                  <strong>{money(totals.totalMinor)}</strong>
                </div>
              </>
            )}
          </div>

          {error ? <p className="login-error">{error}</p> : null}

          <div className="builder-actions">
            <button
              className="theme-button"
              type="button"
              disabled={submitting !== null || !cart.length}
              onClick={() => void submit("save")}
            >
              {submitting === "save"
                ? "Saving…"
                : existingOrder
                  ? "Save items"
                  : "Save order"}
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={submitting !== null || !cart.length}
              onClick={() => void submit("send")}
            >
              {submitting === "send"
                ? "Sending…"
                : existingOrder
                  ? "Send new items"
                  : "Send to kitchen"}
            </button>
          </div>
        </aside>
      </div>

      {pending ? (
        <ModifierDialog
          item={pending}
          onCancel={() => setPending(null)}
          onConfirm={(modifiers) => {
            addLine(pending, modifiers);
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TablesView({ venueId }: { venueId: string }) {
  const [floor, setFloor] = useState<Floor | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selected, setSelected] = useState<{
    table: FloorTable;
    orderId?: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError("");
    try {
      const [floorResponse, ordersResponse] = await Promise.all([
        fetch(`/api/floor?venue_id=${encodeURIComponent(venueId)}`, {
          credentials: "same-origin",
        }),
        fetch(`/api/orders?venue_id=${encodeURIComponent(venueId)}`, {
          credentials: "same-origin",
        }),
      ]);

      if (!floorResponse.ok || !ordersResponse.ok) {
        throw new Error("load failed");
      }

      setFloor((await floorResponse.json()) as Floor);
      setOrders((await ordersResponse.json()) as OrderSummary[]);
    } catch {
      setError("Could not load the floor. Check the edge server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [venueId]);

  useEffect(
    () =>
      subscribeOutbox((count) => {
        if (count === 0) void refresh();
      }),
    [venueId],
  );

  useEffect(() => {
    const source = new EventSource(
      `/api/kds/events?venue_id=${encodeURIComponent(venueId)}`,
      { withCredentials: true },
    );
    source.addEventListener("update", () => void refresh());
    return () => source.close();
  }, [venueId]);

  if (selected) {
    return (
      <OrderBuilder
        table={selected.table}
        venueId={venueId}
        existingOrderId={selected.orderId}
        floor={floor}
        orders={orders}
        onClose={() => setSelected(null)}
        onDone={(order, mode) => {
          setSelected(null);
          const suffix =
            mode === "send"
              ? "sent to kitchen"
              : mode === "move"
                ? "moved"
                : mode === "merge"
                  ? "merged"
                  : "saved";
          setNotice(`${order.number} ${suffix} · ${money(order.total_minor)}`);
          void refresh();
        }}
      />
    );
  }

  const allTables = floor?.areas.flatMap((area) => area.tables) ?? [];
  const freeTables = allTables.filter(
    (table) => table.status === "free",
  ).length;
  const occupiedTables = allTables.filter(
    (table) => table.status === "occupied",
  ).length;
  const activeOrders = orders.filter(
    (order) => order.status !== "closed" && order.status !== "voided",
  );

  function openOrder(order: OrderSummary) {
    const table = allTables.find((entry) => entry.id === order.table_id);
    if (!table) {
      setNotice("This order has no table to reopen.");
      return;
    }
    setSelected({ table, orderId: order.id });
  }

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Floor</span>
          <h1>Tables</h1>
          <p className="muted">
            Tap a free table to start an order, or an occupied table to reopen
            its tab.
          </p>
        </div>
        <div className="workspace-stats">
          <span>
            <strong>{freeTables}</strong> free
          </span>
          <span>
            <strong>{occupiedTables}</strong> occupied
          </span>
          <button
            className="theme-button"
            type="button"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      {loading ? <p className="muted">Loading floor…</p> : null}

      {!loading && !floor?.areas.length ? (
        <section className="card empty-state">
          <h2>No tables yet</h2>
          <p className="muted">
            Add areas and tables from Settings once this venue is configured.
          </p>
        </section>
      ) : null}

      <div className="areas">
        {floor?.areas.map((area) => (
          <section className="area" key={area.id}>
            <header className="area-head">
              <h2>{area.name}</h2>
              <span>{area.tables.length} tables</span>
            </header>
            <div className="table-grid">
              {area.tables.map((table) => {
                const order = activeOrders.find(
                  (entry) => entry.table_id === table.id,
                );
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={`table-card table-card--${table.status}`}
                    onClick={() => {
                      if (table.status === "occupied") {
                        if (order) {
                          setSelected({ table, orderId: order.id });
                        } else {
                          setNotice("This table has an open order.");
                        }
                        return;
                      }
                      setSelected({ table });
                    }}
                  >
                    <span className="table-name">{table.name}</span>
                    <span className="table-seats">{table.seats} seats</span>
                    <span
                      className={`table-status table-status--${table.status}`}
                    >
                      {table.status}
                    </span>
                    {order ? (
                      <span className="table-order">
                        {order.number} · {money(order.total_minor)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="card open-orders">
        <header className="area-head">
          <h2>Open orders</h2>
          <span>{activeOrders.length} live</span>
        </header>
        {activeOrders.length === 0 ? (
          <p className="muted">No open orders on this venue.</p>
        ) : (
          <div className="order-list">
            {activeOrders.map((order) => (
              <button
                className="order-row order-row--button"
                key={order.id}
                type="button"
                onClick={() => openOrder(order)}
              >
                <span>
                  <strong>{order.number}</strong>
                  <small>
                    {order.table_name ?? "Takeaway"} · {order.status}
                  </small>
                </span>
                <strong>{money(order.total_minor)}</strong>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BillView({
  venueId,
  venueName,
  tenantName,
  role,
}: {
  venueId: string;
  venueName: string;
  tenantName: string;
  role: Role;
}) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [tipMajor, setTipMajor] = useState("0");
  const [splitCount, setSplitCount] = useState(1);
  const [voidReason, setVoidReason] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [report, setReport] = useState<ReconciliationRow[]>([]);
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState("0");
  const [mpesaRef, setMpesaRef] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [pdqMode, setPdqMode] = useState("standalone");
  const [approvalCode, setApprovalCode] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [outboxTick, setOutboxTick] = useState(0);

  useEffect(
    () => subscribeOutbox(() => setOutboxTick((tick) => tick + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const canReadReport = ["owner", "manager", "cashier"].includes(role);
        const [ordersResponse, jobsResponse, paymentsResponse, reportResponse] =
          await Promise.all([
            fetch(`/api/orders?venue_id=${encodeURIComponent(venueId)}`, {
              credentials: "same-origin",
            }),
            fetch(`/api/print/jobs?venue_id=${encodeURIComponent(venueId)}`, {
              credentials: "same-origin",
            }),
            fetch(`/api/payments?venue_id=${encodeURIComponent(venueId)}`, {
              credentials: "same-origin",
            }),
            canReadReport
              ? fetch(
                  `/api/payments/reconciliation?venue_id=${encodeURIComponent(venueId)}`,
                  { credentials: "same-origin" },
                )
              : Promise.resolve(null),
          ]);
        if (
          !ordersResponse.ok ||
          !jobsResponse.ok ||
          !paymentsResponse.ok ||
          (reportResponse && !reportResponse.ok)
        ) {
          throw new Error("billing load failed");
        }
        const data = (await ordersResponse.json()) as OrderSummary[];
        const printJobs = (await jobsResponse.json()) as PrintJobSummary[];
        const paymentRows = (await paymentsResponse.json()) as Payment[];
        const reportRows = reportResponse
          ? ((await reportResponse.json()) as ReconciliationRow[])
          : [];
        if (cancelled) return;
        setOrders(
          data.filter(
            (entry) => entry.status !== "closed" && entry.status !== "voided",
          ),
        );
        setJobs(printJobs);
        setPayments(paymentRows);
        setReport(reportRows);
      } catch {
        if (!cancelled) setError("Could not load open bills.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [venueId, notice, outboxTick]);

  useEffect(() => {
    const open = Boolean(order && order.status === "open");
    setBillOpen(open);
    return () => setBillOpen(false);
  }, [order?.id, order?.status]);

  useEffect(() => {
    if (!selectedId) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    async function loadOrder() {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(selectedId)}`,
          { credentials: "same-origin" },
        );
        if (!response.ok) throw new Error("order failed");
        const data = (await response.json()) as Order;
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled) setError("Could not load the bill.");
      }
    }
    void loadOrder();
    return () => {
      cancelled = true;
    };
  }, [selectedId, notice, outboxTick]);

  const bill = useMemo(() => {
    if (!order) return null;
    return billTotals(
      order.items.map((item) => ({
        id: item.id,
        totalMinor: item.line_total_minor,
        taxRate: item.tax_rate,
      })),
      {
        discountMinor: order.discount_minor,
        discountPercent,
        tipMinor: toMinor(Number(tipMajor) || 0),
      },
    );
  }, [order, discountPercent, tipMajor]);

  const orderPayments = useMemo(
    () => payments.filter((payment) => payment.order_id === order?.id),
    [payments, order?.id],
  );
  const billMix = useMemo(
    () =>
      ["cash", "mpesa_manual", "mpesa_stk", "pdq_card"].map((method) => {
        const rows = orderPayments.filter((payment) => payment.method === method);
        return {
          method,
          captured_minor: rows
            .filter((payment) => payment.status === "confirmed")
            .reduce((sum, payment) => sum + payment.amount_minor, 0),
          pending_minor: rows
            .filter((payment) => payment.status === "pending")
            .reduce((sum, payment) => sum + payment.amount_minor, 0),
        };
      }),
    [orderPayments],
  );
  const canSeeVenueMix = ["owner", "manager", "cashier"].includes(role);
  const canTakePayment = ["owner", "manager", "cashier"].includes(role);
  const canCancelPayment = ["owner", "manager", "cashier"].includes(role);
  const outstanding = order
    ? outstandingMinor(
        order.total_minor,
        orderPayments.map((payment) => ({
          status: payment.status as "confirmed" | "pending" | "reversed",
          amount_minor: payment.amount_minor,
        })),
      )
    : 0;

  useEffect(() => {
    if (order) setPayAmount((outstanding / 100).toFixed(2));
  }, [order?.id, outstanding]);

  const receiptText = useMemo(() => {
    if (!order || !bill) return "";
    return formatReceiptText({
      venueName: `${tenantName} · ${venueName}`,
      orderNumber: order.number,
      table: orders.find((entry) => entry.id === order.id)?.table_name ?? null,
      lines: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        totalMinor: item.line_total_minor,
        modifiers: item.modifiers.map((modifier) => modifier.name),
      })),
      bill,
    });
  }, [order, bill, orders, tenantName, venueName]);

  function printReceipt(kickDrawer: boolean) {
    if (!order) return;
    enqueueOutbox({
      url: "/api/print/receipt",
      body: {
        order_id: order.id,
        discount_percent: discountPercent,
        tip_minor: toMinor(Number(tipMajor) || 0),
        kick_drawer: kickDrawer,
        idempotency_key: crypto.randomUUID(),
      },
    });
    setNotice(kickDrawer ? "Receipt queued with drawer kick." : "Receipt queued.");
  }

  function retryPrint(jobId: string) {
    enqueueOutbox({
      url: `/api/print/jobs/${jobId}/retry`,
      body: {},
    });
    setNotice("Print retry queued.");
  }

  function voidOrder() {
    if (!order || voidReason.trim().length < 3) return;
    enqueueOutbox({
      url: `/api/orders/${order.id}/status`,
      body: {
        status: "voided",
        reason: voidReason.trim(),
        idempotency_key: crypto.randomUUID(),
      },
    });
    setNotice(`${order.number} void queued.`);
    setVoidReason("");
  }

  function applyDiscount() {
    if (!order || discountReason.trim().length < 3) return;
    const amount = Math.round((order.total_minor * discountPercent) / 100);
    if (amount <= 0) {
      setError("Enter a discount percentage.");
      return;
    }
    enqueueOutbox({
      url: `/api/orders/${order.id}/discount`,
      body: {
        discount_minor: amount,
        reason: discountReason.trim(),
        idempotency_key: crypto.randomUUID(),
      },
    });
    setNotice("Discount queued.");
    setDiscountReason("");
    setDiscountPercent(0);
    setError("");
  }

  function recordPayment() {
    if (!order) return;
    const amountMinor = toMinor(Number(payAmount) || 0);
    if (amountMinor <= 0) {
      setError("Enter a payment amount.");
      return;
    }
    if (payMethod === "mpesa_manual" && mpesaRef.trim().length < 6) {
      setError("Enter the M-Pesa receipt code.");
      return;
    }
    if (payMethod === "mpesa_stk" && mpesaPhone.trim().length < 9) {
      setError("Enter the customer's M-Pesa phone.");
      return;
    }
    if (payMethod === "pdq_card" && approvalCode.trim().length < 3) {
      setError("Enter the PDQ approval code or RRN.");
      return;
    }

    const body: Record<string, unknown> = {
      order_id: order.id,
      method: payMethod,
      amount_minor: amountMinor,
      tip_minor:
        orderPayments.length === 0 ? toMinor(Number(tipMajor) || 0) : 0,
      idempotency_key: crypto.randomUUID(),
    };
    if (payMethod === "mpesa_manual") {
      body.mpesa = { reference: mpesaRef.trim() };
    }
    if (payMethod === "mpesa_stk") {
      body.mpesa = { phone: mpesaPhone.trim() };
    }
    if (payMethod === "pdq_card") {
      body.pdq = {
        mode: pdqMode,
        approval_code: approvalCode.trim(),
      };
    }

    enqueueOutbox({ url: "/api/payments", body });
    setNotice("Payment sent. The list refreshes when the server confirms it.");
    void flushOutbox();
    setMpesaRef("");
    setMpesaPhone("");
    setApprovalCode("");
    setError("");
  }

  function updatePayment(
    payment: Payment,
    action: "confirmed" | "cancelled" | "reversed",
  ) {
    if (action === "reversed" && reverseReason.trim().length < 3) {
      setError("Enter a reversal reason of at least 3 characters.");
      return;
    }
    const endpoint =
      action === "confirmed"
        ? "confirm"
        : action === "cancelled"
          ? "cancel"
          : "reverse";
    const body =
      action === "reversed" ? { reason: reverseReason.trim() } : {};
    setError("");
    enqueueOutbox({ url: `/api/payments/${payment.id}/${endpoint}`, body });
    setNotice(`${action} queued.`);
    if (action === "reversed") setReverseReason("");
    void flushOutbox();
  }

  const splits = bill ? splitBill(bill.payableMinor, Math.max(1, splitCount)) : [];
  const canVoid = role === "owner" || role === "manager";

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Billing</span>
          <h1>Bill</h1>
          <p className="muted">
            Apply discounts and tips, split the bill and queue a receipt.
          </p>
        </div>
        <select
          className="bill-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Choose an open bill</option>
          {orders.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.number} · {entry.table_name ?? "Takeaway"} ·{" "}
              {money(entry.total_minor)}
            </option>
          ))}
        </select>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      {!order || !bill ? (
        <section className="card empty-state">
          <h2>No bill selected</h2>
          <p className="muted">Choose an open bill to see totals and splits.</p>
        </section>
      ) : (
        <div className="bill-grid">
          <section className="card bill-card">
            <header className="area-head">
              <h2>{order.number}</h2>
              <span>{order.table_id ? "Table" : "Takeaway"}</span>
            </header>
            <div className="bill-controls">
              <label>
                <span>Discount %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent}
                  onChange={(event) =>
                    setDiscountPercent(Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label>
                <span>Tip (KES, first payment)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={tipMajor}
                  onChange={(event) => setTipMajor(event.target.value)}
                />
              </label>
              <label>
                <span>Splits</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={splitCount}
                  onChange={(event) =>
                    setSplitCount(Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </label>
            </div>
            {canVoid ? (
              <div className="void-controls">
                <input
                  value={discountReason}
                  placeholder="Discount reason"
                  onChange={(event) => setDiscountReason(event.target.value)}
                />
                <button
                  className="theme-button"
                  type="button"
                  disabled={discountReason.trim().length < 3}
                  onClick={applyDiscount}
                >
                  Apply discount
                </button>
              </div>
            ) : null}
            <div className="cart-summary bill-summary">
              <div>
                <span>Gross</span>
                <span>{money(bill.grossMinor)}</span>
              </div>
              <div>
                <span>Discount</span>
                <span>-{money(bill.discountMinor)}</span>
              </div>
              <div>
                <span>VAT</span>
                <span>{money(bill.taxMinor)}</span>
              </div>
              <div>
                <span>Tip</span>
                <span>{money(bill.tipMinor)}</span>
              </div>
              <div className="cart-total">
                <span>Payable</span>
                <strong>{money(bill.payableMinor)}</strong>
              </div>
            </div>
            <div className="split-list">
              {splits.map((amount, index) => (
                <div key={index}>
                  <span>Split {index + 1}</span>
                  <strong>{money(amount)}</strong>
                </div>
              ))}
            </div>
            <div className="payment-section">
              <div className="cart-section-label">
                <span>Payment</span>
                <strong>{money(outstanding)} outstanding</strong>
              </div>
              {canTakePayment ? (
              <div className="payment-form">
                <label>
                  <span>Method</span>
                  <select
                    value={payMethod}
                    onChange={(event) => setPayMethod(event.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="mpesa_manual">M-Pesa manual</option>
                    <option value="mpesa_stk">M-Pesa STK</option>
                    <option value="pdq_card">PDQ card</option>
                  </select>
                </label>
                <label>
                  <span>Amount (KES)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={payAmount}
                    onChange={(event) => setPayAmount(event.target.value)}
                  />
                </label>
                {payMethod === "mpesa_manual" ? (
                  <label>
                    <span>Receipt code</span>
                    <input
                      value={mpesaRef}
                      onChange={(event) => setMpesaRef(event.target.value)}
                    />
                  </label>
                ) : null}
                {payMethod === "mpesa_stk" ? (
                  <label>
                    <span>Phone</span>
                    <input
                      value={mpesaPhone}
                      onChange={(event) => setMpesaPhone(event.target.value)}
                    />
                  </label>
                ) : null}
                {payMethod === "pdq_card" ? (
                  <>
                    <label>
                      <span>Mode</span>
                      <select
                        value={pdqMode}
                        onChange={(event) => setPdqMode(event.target.value)}
                      >
                        <option value="standalone">Standalone</option>
                        <option value="semi_integrated">Semi-integrated</option>
                        <option value="integrated">Integrated</option>
                      </select>
                    </label>
                    <label>
                      <span>Approval / RRN</span>
                      <input
                        value={approvalCode}
                        onChange={(event) => setApprovalCode(event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
                <button
                  className="btn-primary"
                  type="button"
                  onClick={recordPayment}
                >
                  Record payment
                </button>
              </div>
              ) : (
                <p className="muted">
                  Ask a cashier, manager or owner to record payments.
                </p>
              )}

              <div className="payment-list">
                {orderPayments.length === 0 ? (
                  <p className="muted">No payments recorded yet.</p>
                ) : (
                  orderPayments.map((payment) => (
                    <div className="payment-row" key={payment.id}>
                      <span>
                        <strong>{payment.method}</strong>
                        <small>
                          {payment.status}
                          {payment.provider_ref ? ` · ${payment.provider_ref}` : ""}
                        </small>
                      </span>
                      <strong>{money(payment.amount_minor)}</strong>
                      {payment.status === "pending" ? (
                        <>
                          {canVoid ? (
                            <button
                              className="theme-button"
                              type="button"
                              onClick={() => updatePayment(payment, "confirmed")}
                            >
                              Confirm
                            </button>
                          ) : null}
                          {canCancelPayment ? (
                            <button
                              className="theme-button"
                              type="button"
                              onClick={() => updatePayment(payment, "cancelled")}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {payment.status === "confirmed" && canVoid ? (
                        <button
                          className="theme-button"
                          type="button"
                          onClick={() => updatePayment(payment, "reversed")}
                        >
                          Reverse
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              {canVoid ? (
                <div className="void-controls">
                  <input
                    value={reverseReason}
                    placeholder="Reason for reversal"
                    onChange={(event) => setReverseReason(event.target.value)}
                  />
                </div>
              ) : null}

              <div className="reconciliation">
                <span className="eyebrow">This bill</span>
                {billMix.map((row) => (
                  <div key={row.method}>
                    <span>{row.method.replaceAll("_", " ")}</span>
                    <span>
                      {money(row.captured_minor)} captured ·{" "}
                      {money(row.pending_minor)} pending
                    </span>
                  </div>
                ))}
              </div>

              {canSeeVenueMix ? (
                <div className="reconciliation">
                  <span className="eyebrow">Venue payment mix (all tables)</span>
                  {report.map((row) => (
                    <div key={row.method}>
                      <span>{row.method.replaceAll("_", " ")}</span>
                      <span>
                        {money(row.captured_minor)} captured ·{" "}
                        {money(row.pending_minor)} pending
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="builder-actions">
              <button
                className="theme-button"
                type="button"
                onClick={() => printReceipt(false)}
              >
                Print receipt
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => printReceipt(true)}
              >
                Print + drawer
              </button>
            </div>
            {canVoid ? (
              <div className="void-controls">
                <input
                  value={voidReason}
                  placeholder="Void reason"
                  onChange={(event) => setVoidReason(event.target.value)}
                />
                <button
                  className="theme-button"
                  type="button"
                  disabled={voidReason.trim().length < 3}
                  onClick={voidOrder}
                >
                  Void order
                </button>
              </div>
            ) : null}

            {jobs.some((job) => job.status === "failed") ? (
              <div className="print-failures">
                <span className="eyebrow">Print failures</span>
                {jobs
                  .filter((job) => job.status === "failed")
                  .map((job) => (
                    <div key={job.id}>
                      <span>
                        {job.error ?? "print_failed"} · {job.attempts} attempts
                      </span>
                      <button
                        className="theme-button"
                        type="button"
                        onClick={() => retryPrint(job.id)}
                      >
                        Retry
                      </button>
                    </div>
                  ))}
              </div>
            ) : null}
          </section>

          <section className="card receipt-preview">
            <header className="area-head">
              <h2>Receipt</h2>
              <span>80mm</span>
            </header>
            <pre>{receiptText}</pre>
          </section>
        </div>
      )}
    </div>
  );
}

function KdsView({ venueId }: { venueId: string }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState("");
  const [tickets, setTickets] = useState<KdsTicket[]>([]);
  const [notice, setNotice] = useState("");

  async function refresh() {
    try {
      const response = await fetch(
        `/api/kds/tickets?venue_id=${encodeURIComponent(venueId)}${stationId ? `&station_id=${encodeURIComponent(stationId)}` : ""}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(`tickets failed (${response.status})`);
      setTickets((await response.json()) as KdsTicket[]);
      setNotice("");
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? `Could not load tickets: ${cause.message}`
          : "Could not load tickets.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStations() {
      try {
        const response = await fetch(
          `/api/stations?venue_id=${encodeURIComponent(venueId)}`,
          { credentials: "same-origin" },
        );
        if (!response.ok) throw new Error("stations failed");
        const data = (await response.json()) as Station[];
        if (cancelled) return;
        setStations(data);
      } catch {
        if (!cancelled) setNotice("Could not load stations.");
      }
    }
    void loadStations();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  useEffect(() => {
    void refresh();
    const source = new EventSource(
      `/api/kds/events?venue_id=${encodeURIComponent(venueId)}${stationId ? `&station_id=${encodeURIComponent(stationId)}` : ""}`,
      { withCredentials: true },
    );
    source.addEventListener("update", () => void refresh());
    return () => source.close();
  }, [venueId, stationId]);

  function nextStatus(status: string): string | null {
    if (status === "open" || status === "sent") return "preparing";
    if (status === "preparing") return "ready";
    if (status === "ready") return "served";
    return null;
  }

  function bump(ticket: KdsTicket) {
    const next = nextStatus(ticket.status);
    if (!next) return;
    enqueueOutbox({
      url: `/api/orders/${ticket.id}/status`,
      body: { status: next, idempotency_key: crypto.randomUUID() },
    });
    setNotice(`${ticket.number} moved to ${next}.`);
  }

  function reprint(ticket: KdsTicket) {
    if (!stationId) return;
    enqueueOutbox({
      url: "/api/print/kitchen",
      body: {
        order_id: ticket.id,
        station_id: stationId,
        idempotency_key: crypto.randomUUID(),
      },
    });
    setNotice(`${ticket.number} reprint queued.`);
  }

  const selected = stations.find((station) => station.id === stationId);

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Kitchen display</span>
          <h1>{selected?.name ?? "All stations"}</h1>
          <p className="muted">
            Live tickets. Pick a station to filter, or keep all stations visible.
          </p>
        </div>
        <select
          className="bill-select"
          value={stationId}
          onChange={(event) => setStationId(event.target.value)}
        >
          <option value="">All stations</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name} · {station.type}
            </option>
          ))}
        </select>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}

      {tickets.length === 0 ? (
        <section className="card empty-state">
          <h2>No tickets</h2>
          <p className="muted">
            Sent kitchen or bar orders appear here. Choose “All stations” if you
            are not sure which station received the order.
          </p>
        </section>
      ) : (
        <div className="kds-grid">
          {tickets.map((ticket) => {
            const ageMinutes = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(ticket.created_at).getTime()) / 60000,
              ),
            );
            const next = nextStatus(ticket.status);
            return (
              <section
                className={`card kds-ticket ${ageMinutes > 20 ? "kds-ticket--late" : ""}`}
                key={ticket.id}
              >
                <header className="area-head">
                  <h2>
                    {ticket.table_name ?? "Takeaway"} · {ticket.number}
                  </h2>
                  <span>
                    {ticket.status} · {ageMinutes}m
                  </span>
                </header>
                <div className="kds-items">
                  {ticket.items.map((item) => (
                    <div key={item.id}>
                      <strong>
                        {item.quantity}x {item.name}
                      </strong>
                      <span>
                        {item.course} · {item.status}
                      </span>
                      {item.modifiers.length ? (
                        <small>
                          {item.modifiers
                            .map((modifier) => modifier.name)
                            .join(" · ")}
                        </small>
                      ) : null}
                    </div>
                  ))}
                </div>
                {ticket.notes ? (
                  <p className="order-note">{ticket.notes}</p>
                ) : null}
                <div className="builder-actions">
                  <button
                    className="theme-button"
                    type="button"
                    onClick={() => reprint(ticket)}
                  >
                    Reprint
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={!next}
                    onClick={() => bump(ticket)}
                  >
                    {next ? `Mark ${next}` : ticket.status}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShiftsView({
  venueId,
  role,
}: {
  venueId: string;
  role: Role;
}) {
  const [active, setActive] = useState<Shift | null>(null);
  const [history, setHistory] = useState<Shift[]>([]);
  const [startingCash, setStartingCash] = useState("0");
  const [countedCash, setCountedCash] = useState("0");
  const [openNotes, setOpenNotes] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const cashRole = ["owner", "manager", "cashier"].includes(role);
  const isOwner = role === "owner";

  async function refresh() {
    const [activeResult, historyResult] = await Promise.allSettled([
      request<Shift | null>(
        `/api/shifts/active?venue_id=${encodeURIComponent(venueId)}`,
      ),
      request<Shift[]>(`/api/shifts?venue_id=${encodeURIComponent(venueId)}`),
    ]);
    if (activeResult.status === "fulfilled") {
      setActive(activeResult.value);
    }
    if (historyResult.status === "fulfilled") {
      setHistory(historyResult.value);
    }
    const issues: string[] = [];
    if (activeResult.status === "rejected") {
      issues.push(
        `active shift: ${activeResult.reason instanceof Error ? activeResult.reason.message : "failed"}`,
      );
    }
    if (historyResult.status === "rejected") {
      issues.push(
        `history: ${historyResult.reason instanceof Error ? historyResult.reason.message : "failed"}`,
      );
    }
    setError(issues.length ? `Could not load shifts (${issues.join("; ")}).` : "");
  }

  useEffect(() => {
    void refresh();
  }, [venueId]);

  useEffect(
    () =>
      subscribeOutbox((count) => {
        if (count === 0) void refresh();
      }),
    [venueId],
  );

  async function loadReport(shiftId: string) {
    setError("");
    try {
      const response = await fetch(`/api/shifts/${shiftId}/report`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("report failed");
      setReport((await response.json()) as ShiftReport);
    } catch {
      setError("Could not load the shift report.");
    }
  }

  async function clockIn() {
    setError("");
    try {
      await request("/api/shifts/clock-in", {
        method: "POST",
        body: JSON.stringify({
          venue_id: venueId,
          starting_cash_minor: cashRole
            ? toMinor(Number(startingCash) || 0)
            : 0,
          ...(openNotes.trim() ? { notes: openNotes.trim() } : {}),
        }),
      });
      setOpenNotes("");
      setNotice("Clocked in. Your start time was recorded automatically.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Clock-in failed: ${cause.message}`
          : "Clock-in failed.",
      );
    }
  }

  async function clockOut() {
    if (!active) return;
    setError("");
    try {
      await request(`/api/shifts/${active.id}/clock-out`, {
        method: "POST",
        body: JSON.stringify({
          counted_cash_minor: cashRole
            ? toMinor(Number(countedCash) || 0)
            : 0,
          ...(closeNotes.trim() ? { notes: closeNotes.trim() } : {}),
        }),
      });
      setCloseNotes("");
      setNotice("Clocked out. Your end time was recorded automatically.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Clock-out failed: ${cause.message}`
          : "Clock-out failed.",
      );
    }
  }

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Staff</span>
          <h1>Shifts</h1>
          <p className="muted">
            {isOwner
              ? "Owners review shift history and Z-reports; they do not clock in or out."
              : "Clock in and out; times are recorded when you click. Cash roles also count the drawer."}
          </p>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      <section className="card shift-help">
        <header className="area-head">
          <h2>How shifts work</h2>
          <span>{cashRole ? "cash & Z-report" : "time tracking"}</span>
        </header>
        <p className="muted">
          {isOwner
            ? "Every closed shift is listed below. Open a shift to see its Z-report, sales, payment mix and any notes attached to clock-in or clock-out."
            : cashRole
              ? "A shift starts when you clock in with the cash float, and sales are attributed to you while you are signed in. Clock out by counting the physical cash; the Z-report compares counted cash with expected cash. A manager can review any variance."
              : "Clock in when you start and clock out when you finish. Your start and end times are recorded automatically. A note is optional if you need to explain the shift."}
        </p>
      </section>

      <div className="bill-grid">
        {!isOwner ? (
        <section className="card bill-card">
          <header className="area-head">
            <h2>{active ? "Active shift" : "Start a shift"}</h2>
            <span>{active ? "open" : "no open shift"}</span>
          </header>
          {active ? (
            <>
              <p className="muted">
                Clocked in {new Date(active.clock_in_at).toLocaleString("en-KE")}
                {active.clock_in_notes ? ` · ${active.clock_in_notes}` : ""}
              </p>
              <div className="bill-controls">
                {cashRole ? (
                  <label>
                    <span>Counted cash (KES)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={countedCash}
                      onChange={(event) => setCountedCash(event.target.value)}
                    />
                  </label>
                ) : null}
                <label>
                  <span>Clock-out note (optional)</span>
                  <input
                    value={closeNotes}
                    onChange={(event) => setCloseNotes(event.target.value)}
                    placeholder="Anything to explain?"
                  />
                </label>
              </div>
              <div className="builder-actions">
                <button
                  className="theme-button"
                  type="button"
                  onClick={() => void loadReport(active.id)}
                >
                  View report
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void clockOut()}
                >
                  Clock out
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bill-controls">
                {cashRole ? (
                  <label>
                    <span>Starting cash (KES)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={startingCash}
                      onChange={(event) => setStartingCash(event.target.value)}
                    />
                  </label>
                ) : null}
                <label>
                  <span>Clock-in note (optional)</span>
                  <input
                    value={openNotes}
                    onChange={(event) => setOpenNotes(event.target.value)}
                    placeholder="Anything to explain?"
                  />
                </label>
              </div>
              <div className="builder-actions">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void clockIn()}
                >
                  Clock in
                </button>
              </div>
            </>
          )}
        </section>
        ) : null}

        <section className="card receipt-preview">
          <header className="area-head">
            <h2>Shift history</h2>
            <span>{history.length} shifts</span>
          </header>
          <div className="split-list">
            {history.length === 0 ? (
              <p className="muted">No shifts yet.</p>
            ) : (
              history.map((shift) => (
                <button
                  className="shift-row"
                  key={shift.id}
                  type="button"
                  onClick={() => void loadReport(shift.id)}
                >
                  <span>
                    {new Date(shift.clock_in_at).toLocaleString("en-KE")}
                    <small>
                      {shift.status}
                      {shift.clock_out_at
                        ? ` · ${new Date(shift.clock_out_at).toLocaleTimeString("en-KE")}`
                        : ""}
                    </small>
                    {shift.clock_in_notes ? (
                      <small>In note: {shift.clock_in_notes}</small>
                    ) : null}
                    {shift.notes ? <small>Out note: {shift.notes}</small> : null}
                  </span>
                  <strong>
                    {cashRole
                      ? money(shift.counted_cash_minor ?? shift.starting_cash_minor)
                      : shift.clock_out_at
                        ? "closed"
                        : "open"}
                  </strong>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {report ? (
        <section className="card bill-card shift-report">
          <header className="area-head">
            <h2>Z-report</h2>
            <a
              className="theme-button"
              href={`/api/shifts/${report.shift.id}/export`}
            >
              Export CSV
            </a>
          </header>
          {report.shift.clock_in_notes ? (
            <p className="muted">Clock-in note: {report.shift.clock_in_notes}</p>
          ) : null}
          {report.shift.notes ? (
            <p className="muted">Clock-out note: {report.shift.notes}</p>
          ) : null}
          <div className="cart-summary bill-summary">
            <div>
              <span>Orders</span>
              <span>{report.sales.orders}</span>
            </div>
            <div>
              <span>Gross</span>
              <span>{money(report.sales.gross_minor)}</span>
            </div>
            <div>
              <span>Discounts</span>
              <span>-{money(report.sales.discounts_minor)}</span>
            </div>
            <div>
              <span>Net</span>
              <span>{money(report.sales.net_minor)}</span>
            </div>
            {report.tips?.eligible ? (
              <div className="cart-total">
                <span>Waiter tip ({report.tips.percent}%)</span>
                <strong>{money(report.tips.staff_tip_minor)}</strong>
              </div>
            ) : null}
            {cashRole ? (
              <>
                <div>
                  <span>Expected cash</span>
                  <span>{money(report.cash.expected_minor)}</span>
                </div>
                <div>
                  <span>Counted cash</span>
                  <span>{money(report.cash.counted_minor)}</span>
                </div>
                <div className="cart-total">
                  <span>Variance</span>
                  <strong>{money(report.cash.variance_minor)}</strong>
                </div>
              </>
            ) : null}
          </div>
          <div className="split-list">
            {report.payment_mix.map((row) => (
              <div key={row.method}>
                <span>{row.method}</span>
                <strong>{money(row.minor)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StockView({
  venueId,
  role,
}: {
  venueId: string;
  role: Role;
}) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [alerts, setAlerts] = useState<StockItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [quantity, setQuantity] = useState("0");
  const [parLevel, setParLevel] = useState("0");
  const [recipeMenuId, setRecipeMenuId] = useState("");
  const [recipeStockId, setRecipeStockId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("1");
  const [adjustQuantity, setAdjustQuantity] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [countQuantity, setCountQuantity] = useState("0");
  const [supplierName, setSupplierName] = useState("");
  const [notice, setNotice] = useState("");
  const canEdit = role === "owner" || role === "manager";

  async function refresh() {
    try {
      const [stockResponse, alertsResponse, recipesResponse, suppliersResponse, menuResponse] =
        await Promise.all([
          fetch(`/api/stock?venue_id=${encodeURIComponent(venueId)}`, {
            credentials: "same-origin",
          }),
          fetch(`/api/stock/alerts?venue_id=${encodeURIComponent(venueId)}`, {
            credentials: "same-origin",
          }),
          fetch("/api/recipes", { credentials: "same-origin" }),
          fetch(`/api/suppliers?venue_id=${encodeURIComponent(venueId)}`, {
            credentials: "same-origin",
          }),
          fetch(`/api/menu?venue_id=${encodeURIComponent(venueId)}`, {
            credentials: "same-origin",
          }),
        ]);
      if (
        !stockResponse.ok ||
        !alertsResponse.ok ||
        !recipesResponse.ok ||
        !suppliersResponse.ok ||
        !menuResponse.ok
      ) {
        throw new Error("stock load failed");
      }
      setItems((await stockResponse.json()) as StockItem[]);
      setAlerts((await alertsResponse.json()) as StockItem[]);
      setRecipes((await recipesResponse.json()) as Recipe[]);
      setSuppliers((await suppliersResponse.json()) as Supplier[]);
      setMenu((await menuResponse.json()) as Menu);
    } catch {
      setNotice("Could not load stock.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [venueId]);

  useEffect(
    () =>
      subscribeOutbox((count) => {
        if (count === 0) void refresh();
      }),
    [venueId],
  );

  function createItem() {
    if (!name.trim()) return;
    enqueueOutbox({
      url: "/api/stock",
      body: {
        venue_id: venueId,
        name: name.trim(),
        unit,
        quantity: Math.max(0, Math.round(Number(quantity) || 0)),
        par_level: Math.max(0, Math.round(Number(parLevel) || 0)),
      },
    });
    setNotice("Stock item queued.");
    setName("");
    void flushOutbox();
  }

  function createRecipe() {
    if (!recipeMenuId || !recipeStockId) return;
    enqueueOutbox({
      url: "/api/recipes",
      body: {
        menu_item_id: recipeMenuId,
        stock_item_id: recipeStockId,
        quantity: Math.max(1, Math.round(Number(recipeQuantity) || 1)),
      },
    });
    setNotice("Recipe queued.");
    void flushOutbox();
  }

  function adjust(item: StockItem, mode: "adjust" | "count") {
    if (adjustReason.trim().length < 3) {
      setNotice("Enter a reason of at least 3 characters before adjusting.");
      return;
    }
    enqueueOutbox({
      url: `/api/stock/${item.id}/${mode}`,
      body:
        mode === "adjust"
          ? {
              quantity_delta: Math.round(Number(adjustQuantity) || 0),
              reason: adjustReason.trim(),
            }
          : {
              counted_quantity: Math.max(0, Math.round(Number(countQuantity) || 0)),
              reason: adjustReason.trim(),
            },
    });
    setNotice(`${mode} queued.`);
    setAdjustReason("");
    void flushOutbox();
  }

  function createSupplier() {
    if (!supplierName.trim()) return;
    enqueueOutbox({
      url: "/api/suppliers",
      body: { venue_id: venueId, name: supplierName.trim() },
    });
    setNotice("Supplier queued.");
    setSupplierName("");
    void flushOutbox();
  }

  const menuItems = menu?.categories.flatMap((category) => category.items) ?? [];

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Inventory</span>
          <h1>Stock</h1>
          <p className="muted">
            Depletion follows sales; counts and adjustments keep levels honest.
          </p>
        </div>
        <span className="pill">
          <span
            className={`status-dot ${alerts.length ? "status-dot--danger" : "status-dot--success"}`}
          />
          {alerts.length} low
        </span>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}

      {canEdit ? (
        <section className="card bill-card">
          <div className="bill-controls">
            <label>
              <span>New item</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>Unit</span>
              <input value={unit} onChange={(event) => setUnit(event.target.value)} />
            </label>
            <label>
              <span>Quantity</span>
              <input
                type="number"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              <span>Par level</span>
              <input
                type="number"
                value={parLevel}
                onChange={(event) => setParLevel(event.target.value)}
              />
            </label>
            <button className="btn-primary" type="button" onClick={createItem}>
              Add stock item
            </button>
          </div>
        </section>
      ) : null}

      <div className="bill-grid">
        <section className="card bill-card">
          <header className="area-head">
            <h2>Stock items</h2>
            <span>{items.length} items</span>
          </header>
          <div className="split-list">
            {items.map((item) => (
              <div key={item.id} className={item.is_low ? "stock-low" : ""}>
                <span>
                  {item.name}
                  <small>
                    {item.quantity} {item.unit} · par {item.par_level}
                  </small>
                </span>
                <strong>{money(item.cost_minor)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card receipt-preview">
          <header className="area-head">
            <h2>Low stock</h2>
            <span>{alerts.length} alerts</span>
          </header>
          <div className="split-list">
            {alerts.length === 0 ? (
              <p className="muted">Everything is above par.</p>
            ) : (
              alerts.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.name}
                    <small>short by {item.par_level - item.quantity}</small>
                  </span>
                  <strong>{item.quantity}</strong>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {canEdit ? (
        <section className="card bill-card stock-tools">
          <header className="area-head">
            <h2>Recipes and counts</h2>
            <span>manager</span>
          </header>
          <div className="bill-controls">
            <label>
              <span>Menu item</span>
              <select
                value={recipeMenuId}
                onChange={(event) => setRecipeMenuId(event.target.value)}
              >
                <option value="">Choose item</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Stock item</span>
              <select
                value={recipeStockId}
                onChange={(event) => setRecipeStockId(event.target.value)}
              >
                <option value="">Choose stock</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Qty per sale</span>
              <input
                type="number"
                value={recipeQuantity}
                onChange={(event) => setRecipeQuantity(event.target.value)}
              />
            </label>
            <button className="theme-button" type="button" onClick={createRecipe}>
              Link recipe
            </button>
          </div>
          <div className="bill-controls">
            <label>
              <span>Adjust / count</span>
              <select
                value={recipeStockId}
                onChange={(event) => setRecipeStockId(event.target.value)}
              >
                <option value="">Choose stock</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Delta</span>
              <input
                type="number"
                value={adjustQuantity}
                onChange={(event) => setAdjustQuantity(event.target.value)}
              />
            </label>
            <label>
              <span>Counted</span>
              <input
                type="number"
                value={countQuantity}
                onChange={(event) => setCountQuantity(event.target.value)}
              />
            </label>
            <label>
              <span>Reason</span>
              <input
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
              />
            </label>
            <button
              className="theme-button"
              type="button"
              onClick={() =>
                items
                  .filter((item) => item.id === recipeStockId)
                  .forEach((item) => adjust(item, "adjust"))
              }
            >
              Adjust
            </button>
            <button
              className="theme-button"
              type="button"
              onClick={() =>
                items
                  .filter((item) => item.id === recipeStockId)
                  .forEach((item) => adjust(item, "count"))
              }
            >
              Count
            </button>
          </div>
          <p className="muted">{recipes.length} recipe links configured.</p>
        </section>
      ) : null}

      <section className="card bill-card stock-tools">
        <header className="area-head">
          <h2>Suppliers</h2>
          <span>{suppliers.length}</span>
        </header>
        <div className="bill-controls">
          <label>
            <span>Name</span>
            <input
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
            />
          </label>
          {canEdit ? (
            <button className="theme-button" type="button" onClick={createSupplier}>
              Add supplier
            </button>
          ) : null}
        </div>
        <div className="split-list">
          {suppliers.map((supplier) => (
            <div key={supplier.id}>
              <span>{supplier.name}</span>
              <small>{supplier.phone ?? supplier.email ?? ""}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsView({ venueId }: { venueId: string }) {
  const [from, setFrom] = useState(() =>
    dateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  );
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const params = new URLSearchParams({
        venue_id: venueId,
        from,
        to,
      });
      const response = await fetch(`/api/reports?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("report failed");
      setReport((await response.json()) as Report);
    } catch {
      setNotice("Could not load reports.");
    }
  }

  useEffect(() => {
    void load();
  }, [venueId, from, to]);

  const exportUrl = (section: string) => {
    const params = new URLSearchParams({
      venue_id: venueId,
      from,
      to,
      section,
    });
    return `/api/reports/export?${params.toString()}`;
  };

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Analytics</span>
          <h1>Reports</h1>
          <p className="muted">Sales, payments, items and tax for this venue.</p>
        </div>
        <div className="bill-controls">
          <label>
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}

      {!report ? (
        <section className="card empty-state">
          <h2>No report data</h2>
          <p className="muted">Choose a date range to load the report.</p>
        </section>
      ) : (
        <>
          <div className="report-cards">
            <section className="card report-card">
              <span className="eyebrow">Gross sales</span>
              <strong>{money(report.summary.gross_minor)}</strong>
              <small>{report.summary.orders} orders</small>
            </section>
            <section className="card report-card">
              <span className="eyebrow">Net</span>
              <strong>{money(report.summary.net_minor)}</strong>
              <small>after VAT and discounts</small>
            </section>
            <section className="card report-card">
              <span className="eyebrow">VAT</span>
              <strong>{money(report.summary.tax_minor)}</strong>
              <small>collected</small>
            </section>
            <section className="card report-card">
              <span className="eyebrow">Captured</span>
              <strong>{money(report.summary.captured_minor)}</strong>
              <small>{money(report.summary.tips_minor)} tips</small>
            </section>
            <section className="card report-card">
              <span className="eyebrow">Discounts</span>
              <strong>{money(report.summary.discounts_minor)}</strong>
              <small>{money(report.summary.voids_minor)} voided</small>
            </section>
          </div>

          <div className="bill-grid">
            <section className="card bill-card">
              <header className="area-head">
                <h2>Top items</h2>
                <a className="theme-button" href={exportUrl("items")}>
                  Export CSV
                </a>
              </header>
              <div className="split-list">
                {report.items.length === 0 ? (
                  <p className="muted">No sales in this range.</p>
                ) : (
                  report.items.slice(0, 15).map((item) => (
                    <div key={item.item_id}>
                      <span>
                        {item.name}
                        <small>
                          {item.category} · {item.quantity} sold
                        </small>
                      </span>
                      <strong>{money(item.gross_minor)}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="card bill-card">
              <header className="area-head">
                <h2>Payment mix</h2>
                <span>confirmed</span>
              </header>
              <div className="split-list">
                {report.payment_mix.map((row) => (
                  <div key={row.method}>
                    <span>
                      {row.method}
                      <small>{money(row.tips_minor)} tips</small>
                    </span>
                    <strong>{money(row.minor)}</strong>
                  </div>
                ))}
              </div>
              <div className="cart-summary bill-summary">
                <div>
                  <span>Categories</span>
                  <span>{report.categories.length}</span>
                </div>
              </div>
            </section>

            <section className="card bill-card">
              <header className="area-head">
                <h2>Staff performance</h2>
                <a className="theme-button" href={exportUrl("staff")}>
                  Export CSV
                </a>
              </header>
              <div className="split-list">
                {report.staff.map((row) => (
                  <div key={row.user_id || row.name}>
                    <span>
                      {row.name}
                      <small>{row.orders} orders</small>
                    </span>
                    <strong>{money(row.gross_minor)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="card bill-card">
              <header className="area-head">
                <h2>VAT summary</h2>
                <a className="theme-button" href={exportUrl("vat")}>
                  Export CSV
                </a>
              </header>
              <div className="split-list">
                {report.vat.map((row) => (
                  <div key={row.tax_rate}>
                    <span>
                      {row.tax_rate}%
                      <small>net {money(row.net_minor)}</small>
                    </span>
                    <strong>{money(row.tax_minor)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}


function OrdersView({
  venueId,
  venueName,
  tenantName,
  role,
}: {
  venueId: string;
  venueName: string;
  tenantName: string;
  role: Role;
}) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [filter, setFilter] = useState<"active" | "all" | "closed">("active");
  const [selectedId, setSelectedId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const data = await request<OrderSummary[]>(
        `/api/orders?venue_id=${encodeURIComponent(venueId)}`,
      );
      setOrders(data);
      if (selectedId) {
        const full = await request<Order>(
          `/api/orders/${encodeURIComponent(selectedId)}`,
        );
        setOrder(full);
        setNoteDraft(full.notes ?? "");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not load orders: ${cause.message}`
          : "Could not load orders.",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, [venueId]);

  useEffect(
    () =>
      subscribeOutbox((count) => {
        if (count === 0) void refresh();
      }),
    [venueId],
  );

  async function selectOrder(id: string) {
    setSelectedId(id);
    setError("");
    try {
      const full = await request<Order>(`/api/orders/${encodeURIComponent(id)}`);
      setOrder(full);
      setNoteDraft(full.notes ?? "");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not load order: ${cause.message}`
          : "Could not load order.",
      );
    }
  }

  async function action(path: string, body: unknown, label: string) {
    if (!order) return;
    setError("");
    try {
      await request(`/api/orders/${order.id}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(`${order.number} ${label}.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${label} failed: ${cause.message}`
          : `${label} failed.`,
      );
    }
  }

  async function saveNote() {
    if (!order) return;
    setError("");
    try {
      const updated = await request<Order>(`/api/orders/${order.id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes: noteDraft.trim() || null }),
      });
      setOrder(updated);
      setNoteDraft(updated.notes ?? "");
      setNotice(`${updated.number} note saved.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Note save failed: ${cause.message}`
          : "Note save failed.",
      );
    }
  }

  const visible = orders.filter((entry) => {
    if (filter === "all") return true;
    const closed = entry.status === "closed" || entry.status === "voided";
    return filter === "closed" ? closed : !closed;
  });
  const canClose = ["owner", "manager", "cashier"].includes(role);
  const canVoid = role === "owner" || role === "manager";
  const nextStatus =
    order?.status === "sent"
      ? "preparing"
      : order?.status === "preparing"
        ? "ready"
        : order?.status === "ready"
          ? "served"
          : null;

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Service</span>
          <h1>Orders</h1>
          <p className="muted">
            All open tabs, notes, kitchen status and closing actions in one
            place.
          </p>
        </div>
        <div className="workspace-stats">
          <select
            className="bill-select"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as "active" | "all" | "closed")
            }
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="closed">Closed / voided</option>
          </select>
          <button className="theme-button" type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      <div className="bill-grid">
        <section className="card bill-card">
          <header className="area-head">
            <h2>Orders</h2>
            <span>{visible.length}</span>
          </header>
          {visible.length === 0 ? (
            <p className="muted">No orders match this filter.</p>
          ) : (
            <div className="order-list">
              {visible.map((entry) => (
                <button
                  className={`order-row order-row--button ${entry.id === selectedId ? "order-row--active" : ""}`}
                  key={entry.id}
                  type="button"
                  onClick={() => void selectOrder(entry.id)}
                >
                  <span>
                    <strong>{entry.number}</strong>
                    <small>
                      {entry.table_name ?? "Takeaway"} · {entry.status}
                    </small>
                  </span>
                  <strong>{money(entry.total_minor)}</strong>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card bill-card">
          {!order ? (
            <div className="empty-state">
              <h2>Choose an order</h2>
              <p className="muted">
                Select an order to see items, notes and service actions.
              </p>
            </div>
          ) : (
            <>
              <header className="area-head">
                <h2>{order.number}</h2>
                <span>{order.status}</span>
              </header>
              <div className="cart-list cart-list--locked">
                {order.items.map((item) => (
                  <div className="cart-line cart-line--locked" key={item.id}>
                    <div className="cart-line-info">
                      <strong>
                        {item.quantity}× {item.name}
                      </strong>
                      <small>
                        {COURSE_LABELS[item.course]} · {item.status}
                      </small>
                      {item.notes ? <small>{item.notes}</small> : null}
                    </div>
                    <span className="cart-line-total">
                      {money(item.line_total_minor)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="cart-summary bill-summary">
                <div>
                  <span>Subtotal</span>
                  <span>{money(order.subtotal_minor)}</span>
                </div>
                <div>
                  <span>VAT</span>
                  <span>{money(order.tax_minor)}</span>
                </div>
                <div className="cart-total">
                  <span>Total</span>
                  <strong>{money(order.total_minor)}</strong>
                </div>
              </div>
              <label className="note-field">
                <span>Order note</span>
                <textarea
                  value={noteDraft}
                  maxLength={500}
                  rows={2}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
              </label>
              <div className="builder-actions">
                <button
                  className="theme-button"
                  type="button"
                  onClick={() => void saveNote()}
                >
                  Save note
                </button>
                {order.items.some((item) => item.status === "pending") ? (
                  <button
                    className="theme-button"
                    type="button"
                    onClick={() => void action("/send", {}, "sent to kitchen")}
                  >
                    Send pending
                  </button>
                ) : null}
                {nextStatus ? (
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() =>
                      void action(
                        "/status",
                        { status: nextStatus, idempotency_key: crypto.randomUUID() },
                        `moved to ${nextStatus}`,
                      )
                    }
                  >
                    Mark {nextStatus}
                  </button>
                ) : null}
              </div>
              {canClose || canVoid ? (
                <div className="void-controls">
                  {canClose ? (
                    <button
                      className="theme-button"
                      type="button"
                      onClick={() =>
                        void action(
                          "/status",
                          { status: "closed", idempotency_key: crypto.randomUUID() },
                          "closed",
                        )
                      }
                    >
                      Close order
                    </button>
                  ) : null}
                  {canVoid ? (
                    <>
                      <input
                        value={voidReason}
                        placeholder="Void reason"
                        onChange={(event) => setVoidReason(event.target.value)}
                      />
                      <button
                        className="theme-button"
                        type="button"
                        disabled={voidReason.trim().length < 3}
                        onClick={() =>
                          void action(
                            "/status",
                            {
                              status: "voided",
                              reason: voidReason.trim(),
                              idempotency_key: crypto.randomUUID(),
                            },
                            "voided",
                          )
                        }
                      >
                        Void order
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              <p className="muted">
                {tenantName} · {venueName}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MenuView({ venueId, role }: { venueId: string; role: Role }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [course, setCourse] = useState<Course>("main");
  const [stationId, setStationId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [itemPrice, setItemPrice] = useState("0");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canEdit = role === "owner";

  async function refresh() {
    try {
      const [menuData, stationData] = await Promise.all([
        request<Menu>(`/api/menu?venue_id=${encodeURIComponent(venueId)}`),
        request<Station[]>(`/api/stations?venue_id=${encodeURIComponent(venueId)}`),
      ]);
      setMenu(menuData);
      setStations(stationData);
      setCategoryId((current) => current || menuData.categories[0]?.id || "");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not load menu: ${cause.message}`
          : "Could not load menu.",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, [venueId]);

  async function createCategory() {
    if (!categoryName.trim()) return;
    setError("");
    try {
      await request("/api/menu/categories", {
        method: "POST",
        body: JSON.stringify({ name: categoryName.trim() }),
      });
      setCategoryName("");
      setNotice("Category added.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Category failed: ${cause.message}`
          : "Category failed.",
      );
    }
  }

  async function createItem() {
    if (!categoryId || !name.trim() || Number(price) <= 0) return;
    setError("");
    try {
      await request("/api/menu/items", {
        method: "POST",
        body: JSON.stringify({
          category_id: categoryId,
          name: name.trim(),
          price_minor: toMinor(Number(price)),
          tax_rate: 16,
          course,
          ...(stationId ? { station_id: stationId } : {}),
          is_available: true,
        }),
      });
      setName("");
      setPrice("0");
      setNotice("Menu item added.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Menu item failed: ${cause.message}`
          : "Menu item failed.",
      );
    }
  }

  async function savePrice(item: MenuItem) {
    const minor = toMinor(Number(itemPrice));
    if (minor <= 0) return;
    setError("");
    try {
      await request(`/api/menu/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price_minor: minor }),
      });
      setEditingItemId("");
      setNotice(`${item.name} price updated.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Update failed: ${cause.message}`
          : "Update failed.",
      );
    }
  }

  async function toggleAvailability(item: MenuItem) {
    setError("");
    try {
      await request(`/api/menu/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Update failed: ${cause.message}`
          : "Update failed.",
      );
    }
  }

  const category = menu?.categories.find((entry) => entry.id === categoryId);

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Catalog</span>
          <h1>Menu</h1>
          <p className="muted">
            Browse the menu; managers can add categories, items and mark items
            unavailable.
          </p>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      {canEdit ? (
        <div className="bill-grid">
          <section className="card bill-card">
            <header className="area-head">
              <h2>Add category</h2>
              <span>manager</span>
            </header>
            <div className="bill-controls">
              <label>
                <span>Name</span>
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                />
              </label>
              <button
                className="theme-button"
                type="button"
                disabled={!categoryName.trim()}
                onClick={() => void createCategory()}
              >
                Add category
              </button>
            </div>
          </section>
          <section className="card bill-card">
            <header className="area-head">
              <h2>Add menu item</h2>
              <span>manager</span>
            </header>
            <div className="bill-controls">
              <label>
                <span>Category</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  {(menu?.categories ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                <span>Price (KES)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>
              <label>
                <span>Course</span>
                <select
                  value={course}
                  onChange={(event) => setCourse(event.target.value as Course)}
                >
                  {COURSE_ORDER.map((entry) => (
                    <option key={entry} value={entry}>
                      {COURSE_LABELS[entry]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Station</span>
                <select
                  value={stationId}
                  onChange={(event) => setStationId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn-primary"
                type="button"
                disabled={!categoryId || !name.trim() || Number(price) <= 0}
                onClick={() => void createItem()}
              >
                Add item
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {menu ? (
        <>
          <div className="category-tabs">
            {menu.categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`category-tab ${entry.id === categoryId ? "category-tab--active" : ""}`}
                onClick={() => setCategoryId(entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          <section className="card bill-card">
            <header className="area-head">
              <h2>{category?.name ?? "Menu"}</h2>
              <span>{category?.items.length ?? 0} items</span>
            </header>
            <div className="menu-grid">
              {(category?.items ?? []).map((item) => (
                <div className="menu-item menu-item--static" key={item.id}>
                  <span className="menu-item-name">{item.name}</span>
                  <span className="menu-item-price">{money(item.price_minor)}</span>
                  <span className="menu-item-course">
                    {COURSE_LABELS[item.course]}
                    {item.modifier_groups.length
                      ? ` · ${item.modifier_groups.length} option groups`
                      : ""}
                  </span>
                  {item.is_available ? null : (
                    <span className="menu-item-off">Unavailable</span>
                  )}
                  {canEdit ? (
                    <>
                      {editingItemId === item.id ? (
                        <>
                          <input
                            className="seat-input"
                            type="number"
                            min={0}
                            step={0.01}
                            value={itemPrice}
                            onChange={(event) => setItemPrice(event.target.value)}
                          />
                          <button
                            className="theme-button"
                            type="button"
                            onClick={() => void savePrice(item)}
                          >
                            Save price
                          </button>
                          <button
                            className="theme-button"
                            type="button"
                            onClick={() => setEditingItemId("")}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="theme-button"
                          type="button"
                          onClick={() => {
                            setEditingItemId(item.id);
                            setItemPrice((item.price_minor / 100).toFixed(2));
                          }}
                        >
                          Edit price
                        </button>
                      )}
                      <button
                        className="theme-button"
                        type="button"
                        onClick={() => void toggleAvailability(item)}
                      >
                        {item.is_available ? "Mark unavailable" : "Mark available"}
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="muted">Loading menu…</p>
      )}
    </div>
  );
}

function FeedbackView({ venueId }: { venueId: string }) {
  const [rows, setRows] = useState<Feedback[]>([]);
  const [category, setCategory] = useState<Feedback["category"]>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setRows(await request<Feedback[]>("/api/feedback"));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not load feedback: ${cause.message}`
          : "Could not load feedback.",
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function submitFeedback() {
    if (subject.trim().length < 3 || message.trim().length < 5) return;
    setError("");
    try {
      await request("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          venue_id: venueId || undefined,
          category,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSubject("");
      setMessage("");
      setNotice("Feedback submitted. Thank you.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Feedback failed: ${cause.message}`
          : "Feedback failed.",
      );
    }
  }

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Owner & management</span>
          <h1>Feedback</h1>
          <p className="muted">
            Send bugs, improvement ideas and questions to the product team.
          </p>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      <div className="bill-grid">
        <section className="card bill-card">
          <header className="area-head">
            <h2>New feedback</h2>
            <span>owner / manager</span>
          </header>
          <div className="bill-controls">
            <label>
              <span>Type</span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as Feedback["category"])
                }
              >
                <option value="bug">Bug</option>
                <option value="improvement">Improvement</option>
                <option value="question">Question</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span>Subject</span>
              <input
                value={subject}
                maxLength={160}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
          </div>
          <label className="note-field">
            <span>Details</span>
            <textarea
              value={message}
              maxLength={4000}
              rows={5}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <div className="builder-actions">
            <button
              className="btn-primary"
              type="button"
              disabled={subject.trim().length < 3 || message.trim().length < 5}
              onClick={() => void submitFeedback()}
            >
              Submit feedback
            </button>
          </div>
        </section>

        <section className="card receipt-preview">
          <header className="area-head">
            <h2>Submitted</h2>
            <span>{rows.length}</span>
          </header>
          {rows.length === 0 ? (
            <p className="muted">No feedback submitted yet.</p>
          ) : (
            <div className="split-list">
              {rows.map((row) => (
                <div key={row.id}>
                  <span>
                    <strong>{row.subject}</strong>
                    <small>
                      {row.category} · {row.status} ·{" "}
                      {new Date(row.created_at).toLocaleString("en-KE")}
                    </small>
                    <small>{row.message}</small>
                  </span>
                  <small>{row.user_name}</small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SettingsView({
  venueId,
  role,
  onStockChange,
  staffOnly = false,
  onLifecycle,
}: {
  venueId: string;
  role: Role;
  onStockChange: (enabled: boolean) => void;
  staffOnly?: boolean;
  onLifecycle?: (action: "restart" | "shutdown") => void;
}) {
  const [floor, setFloor] = useState<Floor | null>(null);
  const [settings, setSettings] = useState<VenueSettings | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [areaId, setAreaId] = useState("");
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState("2");
  const [areaName, setAreaName] = useState("");
  const [editingTableId, setEditingTableId] = useState("");
  const [editName, setEditName] = useState("");
  const [editSeats, setEditSeats] = useState("2");
  const [tipEnabled, setTipEnabled] = useState(false);
  const [tipThreshold, setTipThreshold] = useState("0");
  const [tipPercent, setTipPercent] = useState("0");
  const [staffName, setStaffName] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [staffRole, setStaffRole] = useState<Role>("waiter");
  const [editingStaffId, setEditingStaffId] = useState("");
  const [editStaffName, setEditStaffName] = useState("");
  const [editStaffPin, setEditStaffPin] = useState("");
  const [editStaffRole, setEditStaffRole] = useState<Role>("waiter");
  const [version, setVersion] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lifecyclePin, setLifecyclePin] = useState("");
  const [lifecycleConfirm, setLifecycleConfirm] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState<
    "restart" | "shutdown" | null
  >(null);
  const [lifecycleError, setLifecycleError] = useState("");
  const isOwner = role === "owner";
  async function checkUpdates() {
    const result = await checkForUpdates();
    if (result === "unsupported") {
      setNotice("Update checks are available in the installed app.");
      return;
    }
    if (result === "error") {
      setError("Could not check for updates.");
      return;
    }
    setError("");
    setNotice("Checked for updates.");
  }
  async function runLifecycle(action: "restart" | "shutdown") {
    setLifecycleBusy(action);
    setLifecycleError("");
    try {
      const response = await fetch(`/api/system/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pin: lifecyclePin,
          confirmation: lifecycleConfirm,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        open_orders?: number;
        open_shifts?: number;
      };
      if (!response.ok) {
        if (result.error === "invalid_pin") {
          setLifecycleError("Owner PIN is incorrect.");
        } else if (result.error === "confirmation_mismatch") {
          setLifecycleError(
            `Type ${action === "restart" ? "RESTART" : "SHUT DOWN"} to confirm.`,
          );
        } else if (result.error === "system_busy") {
          setLifecycleError(
            `Close ${result.open_orders ?? 0} open bill(s) and ${result.open_shifts ?? 0} open shift(s) first.`,
          );
        } else if (result.error === "invalid_input") {
          setLifecycleError("Enter a 4-8 digit owner PIN and confirmation.");
        } else if (result.error === "too_many_attempts") {
          setLifecycleError("Too many attempts. Wait a minute and try again.");
        } else {
          setLifecycleError("The server rejected the request.");
        }
        return;
      }
      setLifecyclePin("");
      setLifecycleConfirm("");
      onLifecycle?.(action);
    } catch {
      setLifecycleError("Could not reach the server.");
    } finally {
      setLifecycleBusy(null);
    }
  }
  const assignableRoles: Role[] = isOwner
    ? ["owner", "manager", "cashier", "waiter", "kitchen", "housekeeping"]
    : ["cashier", "waiter", "kitchen", "housekeeping"];

  async function refresh() {
    const [floorResult, settingsResult, versionResult, staffResult, shiftResult] =
      await Promise.allSettled([
        request<Floor>(`/api/floor?venue_id=${encodeURIComponent(venueId)}`),
        request<VenueSettings>(
          `/api/settings?venue_id=${encodeURIComponent(venueId)}`,
        ),
        request<{ app: string; edge: string; schema: number; build: string }>(
          "/api/version",
        ),
        request<Staff[]>("/api/staff"),
        request<Shift[]>(`/api/shifts?venue_id=${encodeURIComponent(venueId)}`),
      ]);

    const issues: string[] = [];
    if (floorResult.status === "fulfilled") {
      setFloor(floorResult.value);
      setAreaId(
        (current) => current || floorResult.value.areas[0]?.id || "",
      );
    } else {
      issues.push(`floor: ${floorResult.reason instanceof Error ? floorResult.reason.message : "failed"}`);
    }
    if (settingsResult.status === "fulfilled") {
      setSettings(settingsResult.value);
      setTipEnabled(settingsResult.value.tip_enabled);
      setTipThreshold(String(settingsResult.value.tip_threshold_minor / 100));
      setTipPercent(String(settingsResult.value.tip_percent));
    } else {
      issues.push(`settings: ${settingsResult.reason instanceof Error ? settingsResult.reason.message : "failed"}`);
    }
    if (versionResult.status === "fulfilled") {
      setVersion(
        `app ${versionResult.value.app} · edge ${versionResult.value.edge} · schema ${versionResult.value.schema}`,
      );
    } else {
      issues.push(`version: ${versionResult.reason instanceof Error ? versionResult.reason.message : "failed"}`);
    }
    if (staffResult.status === "fulfilled") {
      setStaff(staffResult.value);
    } else {
      issues.push(`staff: ${staffResult.reason instanceof Error ? staffResult.reason.message : "failed"}`);
    }
    if (shiftResult.status === "fulfilled") {
      setShifts(shiftResult.value);
    } else {
      issues.push(`shifts: ${shiftResult.reason instanceof Error ? shiftResult.reason.message : "failed"}`);
    }
    setError(
      issues.length
        ? `Could not load some settings data (${issues.join("; ")}).`
        : "",
    );
  }

  useEffect(() => {
    void refresh();
  }, [venueId]);

  async function addArea() {
    if (!areaName.trim()) return;
    setError("");
    try {
      await request("/api/floor/areas", {
        method: "POST",
        body: JSON.stringify({ venue_id: venueId, name: areaName.trim() }),
      });
      setAreaName("");
      setNotice("Area added.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? `Area failed: ${cause.message}` : "Area failed.",
      );
    }
  }

  async function addTable() {
    if (!areaId || !tableName.trim()) return;
    setError("");
    try {
      await request("/api/floor/tables", {
        method: "POST",
        body: JSON.stringify({
          area_id: areaId,
          name: tableName.trim(),
          seats: Math.max(1, Number(seats) || 1),
        }),
      });
      setTableName("");
      setNotice("Table added.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Table failed: ${cause.message}`
          : "Table failed.",
      );
    }
  }

  async function saveTable(table: FloorTable) {
    if (!editName.trim()) return;
    setError("");
    try {
      await request(`/api/floor/tables/${table.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          seats: Math.max(1, Number(editSeats) || 1),
        }),
      });
      setEditingTableId("");
      setNotice(`${table.name} updated.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Update failed: ${cause.message}`
          : "Update failed.",
      );
    }
  }

  async function removeTable(table: FloorTable) {
    setError("");
    try {
      await request(`/api/floor/tables/${table.id}`, { method: "DELETE" });
      setNotice(`${table.name} removed.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Remove failed: ${cause.message}`
          : "Remove failed.",
      );
    }
  }

  async function toggleStock() {
    if (!settings) return;
    setError("");
    try {
      const updated = await request<VenueSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          venue_id: venueId,
          stock_enabled: !settings.stock_enabled,
        }),
      });
      setSettings(updated);
      onStockChange(updated.stock_enabled);
      setNotice(
        updated.stock_enabled
          ? "Stock management enabled."
          : "Stock management disabled. Sales will no longer deplete stock.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Stock setting failed: ${cause.message}`
          : "Stock setting failed.",
      );
    }
  }

  async function saveTips() {
    setError("");
    try {
      const updated = await request<VenueSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          venue_id: venueId,
          tip_enabled: tipEnabled,
          tip_threshold_minor: toMinor(Number(tipThreshold) || 0),
          tip_percent: Math.round(
            Math.max(0, Math.min(100, Number(tipPercent) || 0)),
          ),
        }),
      });
      setSettings(updated);
      setTipEnabled(updated.tip_enabled);
      setTipThreshold(String(updated.tip_threshold_minor / 100));
      setTipPercent(String(updated.tip_percent));
      setNotice("Waiter tip rule saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Tip setting failed: ${cause.message}`
          : "Tip setting failed.",
      );
    }
  }

  async function addStaff() {
    if (!staffName.trim() || staffPin.length < 4) return;
    setError("");
    try {
      await request("/api/staff", {
        method: "POST",
        body: JSON.stringify({
          name: staffName.trim(),
          pin: staffPin,
          role: staffRole,
        }),
      });
      setStaffName("");
      setStaffPin("");
      setNotice("Staff member added.");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Staff add failed: ${cause.message}`
          : "Staff add failed.",
      );
    }
  }

  async function saveStaff(member: Staff) {
    setError("");
    try {
      await request(`/api/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(editStaffName.trim() ? { name: editStaffName.trim() } : {}),
          ...(editStaffPin ? { pin: editStaffPin } : {}),
          ...(editStaffRole !== member.role ? { role: editStaffRole } : {}),
        }),
      });
      setEditingStaffId("");
      setEditStaffPin("");
      setNotice(`${member.name} updated.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Staff update failed: ${cause.message}`
          : "Staff update failed.",
      );
    }
  }

  async function removeStaff(member: Staff) {
    setError("");
    try {
      await request(`/api/staff/${member.id}`, { method: "DELETE" });
      setNotice(`${member.name} removed from the team.`);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Staff remove failed: ${cause.message}`
          : "Staff remove failed.",
      );
    }
  }

  const onDuty = new Set(
    shifts.filter((shift) => shift.status === "open").map((shift) => shift.user_id),
  );
  const canEditStaff = (member: Staff) =>
    isOwner || (member.role !== "owner" && member.role !== "manager");

  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">
            {staffOnly ? "Team" : "Configuration"}
          </span>
          <h1>{staffOnly ? "Staff" : "Settings"}</h1>
          <p className="muted">
            {staffOnly
              ? "Add employees, change roles and see who is on duty."
              : isOwner
                ? "Manage staff, tables, tips, stock and system information."
                : "Manage the team and who is on duty."}
          </p>
        </div>
        {!staffOnly ? (
          <div className="bill-controls">
            <span className="pill">{version || "Version unavailable"}</span>
            {isOwner ? (
              <button
                className="theme-button"
                type="button"
                onClick={() => void checkUpdates()}
              >
                Check for updates
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="login-error">{error}</p> : null}

      <section className="card bill-card">
        <header className="area-head">
          <h2>Staff</h2>
          <span>{staff.length} active</span>
        </header>
        <div className="bill-controls">
          <label>
            <span>Name</span>
            <input
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
              placeholder="e.g. Amina"
            />
          </label>
          <label>
            <span>PIN</span>
            <input
              value={staffPin}
              inputMode="numeric"
              maxLength={8}
              onChange={(event) =>
                setStaffPin(event.target.value.replace(/\D/g, ""))
              }
              placeholder="4–8 digits"
            />
          </label>
          <label>
            <span>Role</span>
            <select
              value={staffRole}
              onChange={(event) => setStaffRole(event.target.value as Role)}
            >
              {assignableRoles.map((entry) => (
                <option key={entry} value={entry}>
                  {ROLE_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-primary"
            type="button"
            disabled={!staffName.trim() || staffPin.length < 4}
            onClick={() => void addStaff()}
          >
            Add staff
          </button>
        </div>
        <div className="split-list staff-admin">
          {staff.map((member) =>
            editingStaffId === member.id ? (
              <div key={member.id}>
                <span className="staff-edit-fields">
                  <input
                    value={editStaffName}
                    onChange={(event) => setEditStaffName(event.target.value)}
                  />
                  <input
                    value={editStaffPin}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="New PIN (optional)"
                    onChange={(event) =>
                      setEditStaffPin(event.target.value.replace(/\D/g, ""))
                    }
                  />
                  <select
                    value={editStaffRole}
                    onChange={(event) =>
                      setEditStaffRole(event.target.value as Role)
                    }
                  >
                    {assignableRoles.map((entry) => (
                      <option key={entry} value={entry}>
                        {ROLE_LABELS[entry]}
                      </option>
                    ))}
                  </select>
                </span>
                <button
                  className="theme-button"
                  type="button"
                  onClick={() => void saveStaff(member)}
                >
                  Save
                </button>
                <button
                  className="theme-button"
                  type="button"
                  onClick={() => setEditingStaffId("")}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div key={member.id}>
                <span>
                  <strong>{member.name}</strong>
                  <small>
                    {ROLE_LABELS[member.role]} ·{" "}
                    {onDuty.has(member.id) ? "on shift" : "off shift"}
                  </small>
                </span>
                {canEditStaff(member) ? (
                  <button
                    className="theme-button"
                    type="button"
                    onClick={() => {
                      setEditingStaffId(member.id);
                      setEditStaffName(member.name);
                      setEditStaffPin("");
                      setEditStaffRole(member.role);
                    }}
                  >
                    Edit
                  </button>
                ) : null}
                {isOwner ? (
                  <button
                    className="theme-button"
                    type="button"
                    onClick={() => void removeStaff(member)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ),
          )}
        </div>
      </section>

      {isOwner && !staffOnly ? (
        <>
          <div className="bill-grid">
            <section className="card bill-card">
              <header className="area-head">
                <h2>Stock management</h2>
                <span>
                  {settings?.stock_enabled ? "enabled" : "disabled"}
                </span>
              </header>
              <p className="muted">
                When enabled, recipes deplete stock automatically on sale. Turn it
                off for venues that do not want inventory tracking; the Stock page
                is hidden too.
              </p>
              <div className="builder-actions">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void toggleStock()}
                >
                  {settings?.stock_enabled
                    ? "Turn stock management off"
                    : "Turn stock management on"}
                </button>
              </div>
            </section>

            <section className="card bill-card">
              <header className="area-head">
                <h2>Waiter tips</h2>
                <span>{tipEnabled ? "enabled" : "disabled"}</span>
              </header>
              <div className="bill-controls">
                <label>
                  <span>Enable tips</span>
                  <select
                    value={tipEnabled ? "on" : "off"}
                    onChange={(event) => setTipEnabled(event.target.value === "on")}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </label>
                <label>
                  <span>Sales above (KES)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tipThreshold}
                    onChange={(event) => setTipThreshold(event.target.value)}
                  />
                </label>
                <label>
                  <span>Percent (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={tipPercent}
                    onChange={(event) => setTipPercent(event.target.value)}
                  />
                </label>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void saveTips()}
                >
                  Save tip rule
                </button>
              </div>
              <p className="muted">
                Each waiter earns the configured percent of their own net sales
                above the threshold during a shift. This appears on their
                Z-report.
              </p>
            </section>
          </div>

          <div className="bill-grid">
            <section className="card bill-card">
              <header className="area-head">
                <h2>Add area</h2>
                <span>{floor?.areas.length ?? 0} areas</span>
              </header>
              <div className="bill-controls">
                <label>
                  <span>Area name</span>
                  <input
                    value={areaName}
                    onChange={(event) => setAreaName(event.target.value)}
                    placeholder="e.g. Terrace"
                  />
                </label>
                <button
                  className="theme-button"
                  type="button"
                  disabled={!areaName.trim()}
                  onClick={() => void addArea()}
                >
                  Add area
                </button>
              </div>
            </section>
          </div>

          <section className="card bill-card">
            <header className="area-head">
              <h2>Tables</h2>
              <span>
                {floor?.areas.flatMap((area) => area.tables).length ?? 0} tables
              </span>
            </header>
            <div className="bill-controls">
              <label>
                <span>Area</span>
                <select
                  value={areaId}
                  onChange={(event) => setAreaId(event.target.value)}
                >
                  {(floor?.areas ?? []).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Table name</span>
                <input
                  value={tableName}
                  onChange={(event) => setTableName(event.target.value)}
                  placeholder="e.g. T7"
                />
              </label>
              <label>
                <span>Seats</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={seats}
                  onChange={(event) => setSeats(event.target.value)}
                />
              </label>
              <button
                className="btn-primary"
                type="button"
                disabled={!areaId || !tableName.trim()}
                onClick={() => void addTable()}
              >
                Add table
              </button>
            </div>
            <div className="areas">
              {(floor?.areas ?? []).map((area) => (
                <section className="area" key={area.id}>
                  <header className="area-head">
                    <h3>{area.name}</h3>
                    <span>{area.tables.length} tables</span>
                  </header>
                  <div className="split-list">
                    {area.tables.map((table) =>
                      editingTableId === table.id ? (
                        <div key={table.id}>
                          <span>
                            <input
                              value={editName}
                              onChange={(event) => setEditName(event.target.value)}
                            />
                            <small>Name and seats</small>
                          </span>
                          <input
                            className="seat-input"
                            type="number"
                            min={1}
                            max={50}
                            value={editSeats}
                            onChange={(event) => setEditSeats(event.target.value)}
                          />
                          <button
                            className="theme-button"
                            type="button"
                            disabled={!editName.trim()}
                            onClick={() => void saveTable(table)}
                          >
                            Save
                          </button>
                          <button
                            className="theme-button"
                            type="button"
                            onClick={() => setEditingTableId("")}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div key={table.id}>
                          <span>
                            <strong>{table.name}</strong>
                            <small>
                              {table.seats} seats · {table.status}
                            </small>
                          </span>
                          <button
                            className="theme-button"
                            type="button"
                            onClick={() => {
                              setEditingTableId(table.id);
                              setEditName(table.name);
                              setEditSeats(String(table.seats));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="theme-button"
                            type="button"
                            onClick={() => void removeTable(table)}
                          >
                            Remove
                          </button>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {isOwner && !staffOnly && onLifecycle ? (
        <section className="card bill-card danger-zone">
          <header className="area-head">
            <h2>Danger zone</h2>
            <span>owner only</span>
          </header>
          <p className="muted">
            Restart after updates or stop the server before moving the data
            folder. Both actions are blocked while bills or shifts are open and
            are written to the audit trail.
          </p>
          <div className="bill-controls">
            <label>
              <span>Owner PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={lifecyclePin}
                onChange={(event) => setLifecyclePin(event.target.value)}
                placeholder="4-8 digits"
              />
            </label>
            <label>
              <span>Type RESTART or SHUT DOWN</span>
              <input
                value={lifecycleConfirm}
                onChange={(event) => setLifecycleConfirm(event.target.value)}
                placeholder="Confirmation"
              />
            </label>
          </div>
          <div className="builder-actions">
            <button
              className="btn-primary"
              type="button"
              disabled={
                lifecycleBusy !== null ||
                !/^\d{4,8}$/.test(lifecyclePin) ||
                lifecycleConfirm.trim().toUpperCase() !== "RESTART"
              }
              onClick={() => void runLifecycle("restart")}
            >
              {lifecycleBusy === "restart" ? "Restarting..." : "Restart server"}
            </button>
            <button
              className="theme-button"
              type="button"
              disabled={
                lifecycleBusy !== null ||
                !/^\d{4,8}$/.test(lifecyclePin) ||
                lifecycleConfirm.trim().toUpperCase() !== "SHUT DOWN"
              }
              onClick={() => void runLifecycle("shutdown")}
            >
              {lifecycleBusy === "shutdown" ? "Stopping..." : "Shut down server"}
            </button>
          </div>
          {lifecycleError ? (
            <p className="danger-error" role="alert">
              {lifecycleError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Placeholder({ view }: { view: NavItem }) {
  return (
    <div className="workspace">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">Coming next</span>
          <h1>{view}</h1>
          <p className="muted">
            Phase 1 focuses on tables, menu and sending orders. This area is
            queued for the next milestone.
          </p>
        </div>
      </header>
      <section className="card empty-state">
        <h2>{view} is not wired yet</h2>
        <p className="muted">
          The edge API and database are ready for the next slice. Use Tables to
          open and send an order.
        </p>
      </section>
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [view, setView] = useState<NavItem>("Tables");
  const [queued, setQueued] = useState(getOutboxCount());
  const [stockEnabled, setStockEnabled] = useState(true);
  const [syncFailure, setSyncFailure] = useState<OutboxFailure | null>(null);
  const [updateState, setUpdateState] =
    useState<UpdateState>(getUpdateState);
  const [systemState, setSystemState] = useState<SystemState>("running");
  const [systemError, setSystemError] = useState("");

  useEffect(() => subscribeOutboxFailures(setSyncFailure), []);

  useEffect(() => {
    const unsubscribe = subscribeToUpdates(setUpdateState);
    const stop = startUpdateRegistration();
    return () => {
      stop();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (systemState !== "restarting") return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(() => {
      void (async () => {
        attempts += 1;
        try {
          const response = await fetch("/api/health", {
            credentials: "same-origin",
            cache: "no-store",
          });
          if (response.ok) {
            if (!cancelled) {
              window.clearInterval(timer);
              location.reload();
            }
            return;
          }
        } catch {
          // Server is still restarting.
        }
        if (!cancelled && attempts >= 30) {
          window.clearInterval(timer);
          setSystemState("stopped");
          setSystemError(
            "The server did not come back. Start it again from the launcher.",
          );
        }
      })();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [systemState]);

  useEffect(() => {
    const saved = localStorage.getItem("hpos-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hpos-theme", theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = subscribeOutbox(setQueued);
    const flush = () => void flushOutbox();
    const timer = window.setInterval(flush, 10000);
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    flush();
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("online", flush);
      window.removeEventListener("focus", flush);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const startedAt = Date.now();
      try {
        const [bootstrapResponse, healthResponse, sessionResponse] =
          await Promise.all([
            fetch("/api/bootstrap", { credentials: "same-origin" }),
            fetch("/api/health", { credentials: "same-origin" }),
            fetch("/api/auth/session", { credentials: "same-origin" }),
          ]);

        if (!bootstrapResponse.ok) throw new Error("bootstrap failed");
        if (cancelled) return;

        const bootstrapData = (await bootstrapResponse.json()) as Bootstrap;
        const healthData = healthResponse.ok
          ? ((await healthResponse.json()) as Health)
          : null;

        setBootstrap(bootstrapData);
        setHealth(healthData);

        const remaining = Math.max(0, 600 - (Date.now() - startedAt));
        if (remaining) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        if (cancelled) return;

        if (sessionResponse.ok) {
          setSession((await sessionResponse.json()) as Session);
          setPhase("ready");
        } else {
          setPhase("login");
        }
      } catch {
        if (!cancelled) setPhase("offline");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const response = await fetch("/api/bootstrap", {
        credentials: "same-origin",
      });
      if (response.ok) setBootstrap((await response.json()) as Bootstrap);
    } finally {
      setSession(null);
      setPhase("login");
    }
  }

  const venueName = useMemo(
    () => bootstrap?.venues[0]?.name ?? "Main Venue",
    [bootstrap],
  );
  const venueId = bootstrap?.venues[0]?.id ?? "";
  const role = session?.role ?? "waiter";
  const appMode = resolveAppMode(import.meta.env.VITE_APP_MODE, health?.mode);
  const visibleNav = useMemo(() => {
    const allowed = ROLE_NAV[role];
    return allowed
      .filter(
        (item) => item !== "Feedback" || role === "owner" || role === "manager",
      )
      .filter((item) => item !== "Stock" || stockEnabled)
      .filter((item) => navVisibleInMode(item, appMode));
  }, [role, stockEnabled, appMode]);

  useEffect(() => {
    if (
      !session ||
      !venueId ||
      !["owner", "manager"].includes(session.role)
    ) {
      return;
    }
    let cancelled = false;
    request<VenueSettings>(
      `/api/settings?venue_id=${encodeURIComponent(venueId)}`,
    )
      .then((settings) => {
        if (!cancelled) setStockEnabled(settings.stock_enabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.user_id, venueId]);

  useEffect(() => {
    if (!visibleNav.includes(view)) setView(visibleNav[0] ?? "Tables");
  }, [visibleNav, view]);

  if (phase === "loading") return <Splash phase={phase} version={__APP_VERSION__} />;

  if (phase === "offline") {
    return (
      <div className="center-state">
        <Splash phase={phase} version={health?.version ?? __APP_VERSION__} />
        <button className="btn-primary" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (systemState !== "running") {
    return (
      <div className="center-state">
        <section className="card system-state-card">
          <span className="eyebrow">
            {systemState === "restarting" ? "Restarting" : "Stopped"}
          </span>
          <h1>
            {systemState === "restarting"
              ? "Restarting the server…"
              : "Server stopped"}
          </h1>
          <p className="muted">
            {systemState === "restarting"
              ? "Waiting for the POS to come back. This page will reload automatically."
              : "The POS is safely stopped. Start it again from the launcher, then reload this page."}
          </p>
          {systemError ? (
            <p className="danger-error" role="alert">
              {systemError}
            </p>
          ) : null}
          {systemState === "stopped" ? (
            <button
              className="btn-primary"
              type="button"
              onClick={() => location.reload()}
            >
              Check again
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  if (phase === "login" && bootstrap) {
    return (
      <Login
        bootstrap={bootstrap}
        onSignedIn={(nextSession) => {
          setSession(nextSession);
          setPhase("ready");
        }}
      />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src={iconUrl()} alt="" />
          <div>
            <strong>{bootstrap?.tenant.name ?? "Hospitality POS"}</strong>
            <small>
              {venueName} · {session ? ROLE_LABELS[session.role] : "Signed out"}
            </small>
          </div>
        </div>
        <div className="top-actions">
          <span className="pill">
            <span
              className={`status-dot ${queued ? "status-dot--danger" : "status-dot--success"}`}
            />
            {queued ? `Queued ${queued}` : "Online"}
          </span>
          {session ? (
            <span className="user-pill">
              <span className="avatar avatar--small">
                {initials(session.name)}
              </span>
              {session.name}
            </span>
          ) : null}
          <button
            className="theme-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="theme-button" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      {syncFailure ? (
        <div className="sync-error" role="alert">
          <span>
            One action was not saved: <strong>{syncFailure.error}</strong>
            {syncFailure.status ? ` (${syncFailure.status})` : ""}
          </span>
          <button
            className="theme-button"
            type="button"
            onClick={() => dismissOutboxFailure()}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {updateState.needRefresh ? (
        <div className="sync-error update-banner" role="status">
          <div>
            {updateState.billOpen
              ? "A new version is ready. Finish the open bill, then reload."
              : "A new version is ready."}
            {updateState.releaseNotes ? (
              <details className="update-notes">
                <summary>
                  What&apos;s new in {updateState.releaseNotes.version}
                </summary>
                <ul>
                  {updateState.releaseNotes.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <button
            className="theme-button"
            type="button"
            disabled={updateState.billOpen || updateState.checking}
            onClick={() => void applyUpdate()}
          >
            {updateState.checking ? "Reloading..." : "Reload"}
          </button>
        </div>
      ) : null}

      <nav className="nav" aria-label="Main">
        {visibleNav.map((item) => (
          <button
            key={item}
            className={`nav-item ${view === item ? "nav-item--active" : ""}`}
            type="button"
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <main className="content">
        {view === "Tables" ? (
          <TablesView venueId={venueId} />
        ) : view === "Orders" ? (
          <OrdersView
            venueId={venueId}
            venueName={venueName}
            tenantName={bootstrap?.tenant.name ?? "Hospitality POS"}
            role={role}
          />
        ) : view === "Menu" ? (
          <MenuView venueId={venueId} role={role} />
        ) : view === "Feedback" ? (
          <FeedbackView venueId={venueId} />
        ) : view === "Staff" ? (
          <SettingsView
            venueId={venueId}
            role={role}
            onStockChange={setStockEnabled}
            staffOnly
          />
        ) : view === "Settings" ? (
          <SettingsView
            venueId={venueId}
            role={role}
            onStockChange={setStockEnabled}
            onLifecycle={
              appMode === "edge"
                ? (action) => {
                    setSystemError("");
                    setSystemState(
                      action === "restart" ? "restarting" : "stopped",
                    );
                  }
                : undefined
            }
          />
        ) : view === "Bill" ? (
          <BillView
            venueId={venueId}
            venueName={venueName}
            tenantName={bootstrap?.tenant.name ?? "Hospitality POS"}
            role={role}
          />
        ) : view === "KDS" ? (
          <KdsView venueId={venueId} />
        ) : view === "Shifts" ? (
          <ShiftsView venueId={venueId} role={role} />
        ) : view === "Stock" ? (
          <StockView venueId={venueId} role={role} />
        ) : view === "Reports" ? (
          <ReportsView venueId={venueId} />
        ) : (
          <Placeholder view={view} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
