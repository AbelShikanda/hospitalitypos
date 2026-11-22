import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@hpos/ui/styles/tokens.css";
import "./styles.css";

type Role = "owner" | "manager" | "cashier" | "waiter" | "kitchen";

type Staff = { id: string; name: string; role: Role };
type Venue = { id: string; tenant_id: string; name: string; created_at: string };
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

type Phase = "loading" | "login" | "ready" | "offline";

const NAV_ITEMS = [
  "Tables",
  "Orders",
  "Menu",
  "KDS",
  "Stock",
  "Reports",
  "Settings",
];

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
              <span className="avatar avatar--large">{initials(staff.name)}</span>
              <div>
                <h1>{staff.name}</h1>
                <p className="login-hint">{ROLE_LABELS[staff.role]}</p>
              </div>
            </div>

            <div className="pin-dots" aria-label={`${pin.length} digits entered`}>
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

function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

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
          <button key={item} className="nav-item" type="button">
            {item}
          </button>
        ))}
      </nav>

      <main className="content">
        <section className="card hero">
          <span className="eyebrow">Local edge connected</span>
          <h1>Ready for service</h1>
          <p>
            {session
              ? `Signed in as ${session.name}. `
              : ""}
            The venue server is running on the local network. Orders, payments
            and printing keep working even if the internet drops.
          </p>
          <div className="meta">
            <span>
              Mode <b>{health?.mode ?? "edge"}</b>
            </span>
            <span>
              Version <b>{health?.version ?? "0.0.0-dev"}</b>
            </span>
            <span>
              Connection <b>LAN</b>
            </span>
          </div>
        </section>

        <section className="tiles" aria-label="Overview">
          <div className="card tile">
            <span className="tile-label">Tables</span>
            <strong className="tile-value">0 / 0</strong>
            <span className="tile-foot">No tables configured yet</span>
          </div>
          <div className="card tile">
            <span className="tile-label">Open orders</span>
            <strong className="tile-value">0</strong>
            <span className="tile-foot">Live on this venue</span>
          </div>
          <div className="card tile">
            <span className="tile-label">Today's sales</span>
            <strong className="tile-value">KES 0.00</strong>
            <span className="tile-foot">Demo environment</span>
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
