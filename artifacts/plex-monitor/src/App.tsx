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
import sticker1 from "/sticker1-nobg.png";
import sticker2 from "/sticker2-nobg.png";

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
  const [authed, setAuthed] = useState(() => getCookie("starlight_session") === "ok");
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

      {/* Background */}
      <div className="bg-image" style={{ backgroundImage: `url(${bgImage})` }} />
      <div className="bg-overlay" />

      {/* Stickers scattered around */}
      <img src={sticker1} alt="" className="sticker sticker-tr" aria-hidden />
      <img src={sticker2} alt="" className="sticker sticker-bl" aria-hidden />
      <img src={sticker1} alt="" className="sticker sticker-tm" aria-hidden />
      <img src={sticker2} alt="" className="sticker sticker-br2" aria-hidden />

      {/* Yor — left side */}
      <div className="yor-wrap">
        <img src={yorImage} alt="Yor" className="yor-img" />
      </div>

      {/* Main content */}
      <div className="content-wrap">
        <div className="header">
          <h1 className="page-title">✦ Project Starlight ✦</h1>
        </div>

        <div className="card">
          <table className="server-table">
            <thead>
              <tr>
                <th className="th" style={{ width: "42%" }}>Server</th>
                <th className="th" style={{ width: "22%", textAlign: "center" }}>Status</th>
                <th className="th">Last Changed</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={3} className="loading-cell">Loading servers… 🌸</td>
                </tr>
              )}
              {servers.map((server, idx) => (
                <tr
                  key={server.id}
                  className={`server-row ${idx < servers.length - 1 ? "row-sep" : ""}`}
                >
                  <td className="td">
                    <div className="server-name-wrap">
                      <span className={`dot ${server.status === "on" ? "dot-on" : "dot-off"}`} />
                      <span className="server-emoji">{SERVER_EMOJI[server.id] ?? "🌟"}</span>
                      <span className="server-name">{server.name}</span>
                    </div>
                  </td>
                  <td className="td" style={{ textAlign: "center" }}>
                    <div className="toggle-wrap">
                      <button
                        onClick={() => handleToggle(server.id, server.status)}
                        className={`toggle ${server.status === "on" ? "toggle-on" : "toggle-off"}`}
                        aria-label={`Toggle ${server.name}`}
                      >
                        <span className="toggle-track">
                          <span className="toggle-thumb" />
                        </span>
                        <span className="toggle-label">
                          {server.status === "on" ? "ON" : "OFF"}
                        </span>
                      </button>
                      <Sparkle active={lastToggled === server.id} />
                    </div>
                  </td>
                  <td className="td">
                    <span className="timestamp">{formatTime(server.updatedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
