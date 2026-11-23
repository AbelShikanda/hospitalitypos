import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@hpos/ui/styles/tokens.css";
import "./styles.css";

type Role = "owner" | "manager" | "cashier" | "waiter" | "kitchen";

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

type Order = {
  id: string;
  number: string;
  status: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  table_id: string | null;
  notes: string | null;
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
};

type Phase = "loading" | "login" | "ready" | "offline";

const NAV_ITEMS = [
  "Tables",
  "Orders",
  "Menu",
  "KDS",
  "Stock",
  "Reports",
  "Settings",
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  waiter: "Waiter",
  kitchen: "Kitchen",
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

function money(minor: number): string {
  return `KES ${(minor / 100).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function errorText(code: unknown): string {
  switch (code) {
    case "table_occupied":
      return "That table already has an open order.";
    case "modifier_required":
      return "Choose the required options for this item.";
    case "too_many_modifiers":
      return "Too many options selected.";
    case "item_unavailable":
      return "That item is unavailable.";
    case "unknown_item":
      return "The menu changed. Refresh and try again.";
    case "idempotency_conflict":
      return "This order was already saved elsewhere. Refresh the floor.";
    case "order_closed":
      return "That tab is already closed.";
    case "table_unavailable":
      return "That table is not available.";
    case "target_not_found":
      return "The target tab no longer exists. Refresh and try again.";
    case "target_closed":
      return "That tab is already closed.";
    default:
      return "Could not save the order. Try again.";
  }
}

function Splash({ phase, version }: { phase: Phase; version?: string }) {
  return (
    <div className="splash">
      <img className="splash-logo" src="/icon.svg" alt="Hospitality POS" />
      <h1>Hospitality POS</h1>
      <span className="splash-pill">
        <span
          className={`status-dot ${phase === "offline" ? "status-dot--danger" : "status-dot--success"}`}
        />
        {phase === "offline" ? "Offline — retrying" : "Starting…"}
      </span>
      <p className="splash-version">{version ?? "0.0.0-dev"}</p>
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

  return (
    <div className="login">
      <section className="login-panel">
        <header className="login-head">
          <img src="/icon.svg" alt="" />
          <div>
            <strong>{bootstrap.tenant.name}</strong>
            <small>{venue?.name ?? "Main Venue"} · Staff sign in</small>
          </div>
        </header>

        {!staff ? (
          <>
            <h1>Who is on shift?</h1>
            <p className="login-hint">Select your name to enter your PIN.</p>
            <div className="staff-grid">
              {bootstrap.staff.map((member) => (
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
              ))}
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
        <img src="/icon.svg" alt="" />
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
  const [courseToSend, setCourseToSend] = useState<Course | "all">("all");
  const [pending, setPending] = useState<MenuItem | null>(null);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [moveTableId, setMoveTableId] = useState("");
  const [mergeOrderId, setMergeOrderId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<
    "save" | "send" | "move" | "merge" | null
  >(null);
  const idempotencyKey = useRef(crypto.randomUUID());

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
        if (!cancelled) setExistingOrder(data);
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

  async function moveTable() {
    if (!existingOrder || !moveTableId) return;
    setSubmitting("move");
    setError("");
    try {
      const response = await fetch(`/api/orders/${existingOrder.id}/move`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table_id: moveTableId,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(errorText(body?.error));
        return;
      }
      onDone((await response.json()) as Order, "move");
    } catch {
      setError("Network error. The table was not moved.");
    } finally {
      setSubmitting(null);
    }
  }

  async function mergeTable() {
    if (!existingOrder || !mergeOrderId) return;
    setSubmitting("merge");
    setError("");
    try {
      const response = await fetch(`/api/orders/${existingOrder.id}/merge`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_order_id: mergeOrderId,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(errorText(body?.error));
        return;
      }
      onDone((await response.json()) as Order, "merge");
    } catch {
      setError("Network error. The tables were not merged.");
    } finally {
      setSubmitting(null);
    }
  }

  function addLine(item: MenuItem, modifiers: Modifier[]) {
    const key = `${item.id}:${modifiers
      .map((modifier) => modifier.id)
      .sort()
      .join(",")}`;

    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { key, item, quantity: 1, modifiers }];
    });
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

  async function submit(mode: "save" | "send") {
    if (!cart.length) {
      setError("Add at least one item.");
      return;
    }

    setSubmitting(mode);
    setError("");
    try {
      const items = cart.map((line) => ({
        item_id: line.item.id,
        quantity: line.quantity,
        modifier_ids: line.modifiers.map((modifier) => modifier.id),
      }));

      const response = existingOrder
        ? await fetch(`/api/orders/${existingOrder.id}/items`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              idempotency_key: idempotencyKey.current,
              ...(notes.trim() ? { notes: notes.trim() } : {}),
              items,
            }),
          })
        : await fetch("/api/orders", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              venue_id: venueId,
              table_id: table.id,
              idempotency_key: idempotencyKey.current,
              ...(notes.trim() ? { notes: notes.trim() } : {}),
              items,
            }),
          });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(errorText(body?.error));
        return;
      }

      let order = (await response.json()) as Order;

      if (existingOrder) setExistingOrder(order);

      if (mode === "send") {
        const sent = await fetch(`/api/orders/${order.id}/send`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            selectedCourse === "all" ? {} : { course: selectedCourse },
          ),
        });
        if (!sent.ok) {
          setError("Order saved but could not be sent to the kitchen.");
          return;
        }
        order = (await sent.json()) as Order;
      }

      onDone(order, mode);
    } catch {
      setError("Network error. The order was not saved.");
    } finally {
      setSubmitting(null);
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
          <div className="tab-action">
            <label>
              <span>Move to table</span>
              <select
                value={moveTableId}
                onChange={(event) => setMoveTableId(event.target.value)}
              >
                <option value="">Choose table</option>
                {freeTables.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.seats} seats
                  </option>
                ))}
              </select>
            </label>
            <button
              className="theme-button"
              type="button"
              disabled={submitting !== null || !moveTableId}
              onClick={() => void moveTable()}
            >
              {submitting === "move" ? "Moving…" : "Move"}
            </button>
          </div>
          <div className="tab-action">
            <label>
              <span>Merge into tab</span>
              <select
                value={mergeOrderId}
                onChange={(event) => setMergeOrderId(event.target.value)}
              >
                <option value="">Choose tab</option>
                {otherOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.number} · {order.table_name ?? "Takeaway"}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="theme-button"
              type="button"
              disabled={submitting !== null || !mergeOrderId}
              onClick={() => void mergeTable()}
            >
              {submitting === "merge" ? "Merging…" : "Merge"}
            </button>
          </div>
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
              {existingOrder.notes ? (
                <p className="order-note">{existingOrder.notes}</p>
              ) : null}
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

  useEffect(() => {
    const saved = localStorage.getItem("hpos-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hpos-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
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

  if (phase === "loading") return <Splash phase={phase} />;

  if (phase === "offline") {
    return (
      <div className="center-state">
        <Splash phase={phase} version={health?.version} />
        <button className="btn-primary" onClick={() => location.reload()}>
          Retry
        </button>
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
          <img src="/icon.svg" alt="" />
          <div>
            <strong>{bootstrap?.tenant.name ?? "Hospitality POS"}</strong>
            <small>
              {venueName} · {session ? ROLE_LABELS[session.role] : "Signed out"}
            </small>
          </div>
        </div>
        <div className="top-actions">
          <span className="pill">
            <span className="status-dot status-dot--success" /> Online
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

      <nav className="nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
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
        ) : (
          <Placeholder view={view} />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
