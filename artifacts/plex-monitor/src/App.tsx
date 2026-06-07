import { useState, useEffect } from "react";
import {
  useListServers,
  useUpdateServerStatus,
  getListServersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import Login from "./Login";
import bgImage from "/bg.png";
import anyaStare from "/anya-nobg.png";
import anyaExcited from "/anya2-nobg.png";
import yorImage from "/yor-nobg.png";

const SERVER_ORDER = ["mio", "bo", "new-tunes", "aaryn"];
const SERVER_EMOJI: Record<string, string> = {
  mio: "🌸",
  bo: "🐾",
  "new-tunes": "🎵",
  aaryn: "⭐",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function Sparkle({ active }: { active: boolean }) {
  return (
    <span className={`sparkle-wrap ${active ? "sparkle-pop" : ""}`}>✨</span>
  );
}

const PETALS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 5.7 + 3) % 100}%`,
  animationDelay: `${(i * 1.3) % 8}s`,
  animationDuration: `${6 + (i % 5)}s`,
  fontSize: `${10 + (i % 8)}px`,
  opacity: 0.55 + (i % 3) * 0.12,
}));

export default function App() {
  const [authed, setAuthed] = useState(true); // password gate disabled
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (localStorage.getItem("starlight_theme") as "dark" | "light") ?? "dark"
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("starlight_theme", theme);
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const queryClient = useQueryClient();
  const { data: rawServers, isLoading, dataUpdatedAt } = useListServers({
    query: { refetchInterval: 30_000, enabled: authed },
  });
  const updateStatus = useUpdateServerStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
      },
    },
  });

  const [lastToggled, setLastToggled] = useState<string | null>(null);
  const [anyaExcitedVisible, setAnyaExcitedVisible] = useState(false);

  const servers = rawServers
    ? [...rawServers].sort(
        (a, b) => SERVER_ORDER.indexOf(a.id) - SERVER_ORDER.indexOf(b.id)
      )
    : [];

  const anyServerOn = servers.some((s) => s.status === "on");
  useEffect(() => {
    setAnyaExcitedVisible(anyServerOn);
  }, [anyServerOn]);

  function handleToggle(id: string, current: string) {
    const next = current === "on" ? "off" : "on";
    setLastToggled(id);
    setTimeout(() => setLastToggled(null), 600);
    updateStatus.mutate({ id, data: { status: next } });
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="page-root">
      {/* Sakura petals */}
      {PETALS.map((p, i) => (
        <div
          key={i}
          className="petal"
          style={{
            left: p.left,
            animationDelay: p.animationDelay,
            animationDuration: p.animationDuration,
            fontSize: p.fontSize,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* Theme toggle */}
      <button
        className="theme-toggle"
        onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      {/* Background */}
      <div className="bg-image" style={{ backgroundImage: `url(${bgImage})` }} />
      <div className="bg-overlay" />

      {/* Yor — left side */}
      <div className="yor-wrap">
        <img src={yorImage} alt="Yor" className="yor-img" />
      </div>

      {/* Main content */}
      <div className="content-wrap">
        <div className="header">
          <h1 className="page-title">✦ Project Starlight ✦</h1>
        </div>

        {/* Card grid */}
        <div className="server-grid">
          {isLoading && (
            <div className="grid-loading">Loading servers… 🌸</div>
          )}
          {servers.map((server) => {
            const isOn = server.status === "on";
            return (
              <button
                key={server.id}
                className={`server-card ${isOn ? "card-on" : "card-off"}`}
                onClick={() => handleToggle(server.id, server.status)}
                aria-label={`Toggle ${server.name}`}
              >
                <div className="card-header">
                  <div className="card-name-wrap">
                    <span className="card-emoji">{SERVER_EMOJI[server.id] ?? "🌟"}</span>
                    <span className="card-server-name">{server.name}</span>
                  </div>
                  <span className={`card-badge ${isOn ? "badge-on" : "badge-off"}`}>
                    {isOn ? "In use" : "Free"}
                  </span>
                </div>
                <div className={`card-status-text ${isOn ? "status-occupied" : "status-available"}`}>
                  {isOn ? "Occupied" : "Available"}
                </div>
                <div className="card-since">
                  {server.updatedAt
                    ? `Since ${formatTime(server.updatedAt)} · ${formatRelative(server.updatedAt, now)}`
                    : "No activity yet"}
                </div>
                <Sparkle active={lastToggled === server.id} />
              </button>
            );
          })}
        </div>

        <p className="sync-text">
          {dataUpdatedAt
            ? <>✦ Synced: <span className="mono">{new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}</span> · auto-refreshes every 30s</>
            : "Connecting… 🌸"}
        </p>
      </div>

      {/* Anya bottom center */}
      <div className="anya-wrap">
        <img src={anyaStare} alt="Anya stare" className="anya-img"
          style={{ opacity: anyaExcitedVisible ? 0 : 1 }} />
        <img src={anyaExcited} alt="Anya excited" className="anya-img anya-overlay"
          style={{ opacity: anyaExcitedVisible ? 1 : 0 }} />
      </div>
    </div>
  );
}
