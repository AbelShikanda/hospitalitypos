import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@hpos/ui/styles/tokens.css";
import "./styles.css";

type Health = {
  status: string;
  mode: string;
  version: string;
};

type Phase = "loading" | "ready" | "offline";

const NAV_ITEMS = [
  "Tables",
  "Orders",
  "Menu",
  "KDS",
  "Stock",
  "Reports",
  "Settings",
];

function Splash({ phase, version }: { phase: Phase; version?: string }) {
  return (
    <div className="splash">
      <img className="splash-logo" src="/icon.svg" alt="Hospitality POS" />
      <h1>Hospitality POS</h1>
      <span className="splash-pill">
        <span className={`status-dot ${phase === "offline" ? "status-dot--danger" : "status-dot--success"}`} />
        {phase === "offline" ? "Offline — retrying" : "Starting…"}
      </span>
      <p className="splash-version">{version ?? "0.0.0-dev"}</p>
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>("loading");
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
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) throw new Error("unhealthy");
        setHealth((await response.json()) as Health);
        setPhase("ready");
      } catch {
        setPhase("offline");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

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

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <div>
            <strong>Hospitality POS</strong>
            <small>Main Venue · Demo shift</small>
          </div>
        </div>
        <div className="top-actions">
          <span className="pill">
            <span className="status-dot status-dot--success" /> Online
          </span>
          <span className="pill">Up to date</span>
          <button
            className="theme-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light" : "Dark"}
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
            The venue server is running on the local network. Orders, payments
            and printing keep working even if the internet drops.
          </p>
          <div className="meta">
            <span>Mode <b>{health?.mode}</b></span>
            <span>Version <b>{health?.version}</b></span>
            <span>Connection <b>LAN</b></span>
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
