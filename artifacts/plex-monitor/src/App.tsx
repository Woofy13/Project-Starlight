import {
  useListServers,
  useUpdateServerStatus,
  getListServersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import bgImage from "/bg.png";
import anyaImage from "/anya-nobg.png";

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function App() {
  const queryClient = useQueryClient();
  const { data: servers, isLoading, dataUpdatedAt } = useListServers({
    query: { refetchInterval: 30_000 },
  });
  const updateStatus = useUpdateServerStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServersQueryKey() });
      },
    },
  });

  function handleToggle(id: string, current: string) {
    const next = current === "on" ? "off" : "on";
    updateStatus.mutate({ id, data: { status: next } });
  }

  return (
    <div className="page-root">
      {/* Background image with overlay */}
      <div
        className="bg-image"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="bg-overlay" />

      {/* Content */}
      <div className="content-wrap">
        {/* Header */}
        <div className="header">
          <div className="header-badge">✦ MONITORING</div>
          <h1 className="page-title">Plex Monitoring Service</h1>
          <p className="page-subtitle">Server status control panel</p>
        </div>

        {/* Table card */}
        <div className="card">
          <table className="server-table">
            <thead>
              <tr>
                <th className="th" style={{ width: "40%" }}>Server</th>
                <th className="th" style={{ width: "20%", textAlign: "center" }}>Status</th>
                <th className="th">Last Changed</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={3} className="loading-cell">Loading servers…</td>
                </tr>
              )}
              {servers?.map((server, idx) => (
                <tr
                  key={server.id}
                  className={`server-row ${idx < (servers.length - 1) ? "row-sep" : ""}`}
                >
                  {/* Server name + dot */}
                  <td className="td">
                    <div className="server-name-wrap">
                      <span className={`dot ${server.status === "on" ? "dot-on" : "dot-off"}`} />
                      <span className="server-name">{server.name}</span>
                    </div>
                  </td>

                  {/* Toggle */}
                  <td className="td" style={{ textAlign: "center" }}>
                    <button
                      onClick={() => handleToggle(server.id, server.status)}
                      className={`toggle ${server.status === "on" ? "toggle-on" : "toggle-off"}`}
                      aria-label={`Toggle ${server.name}`}
                    >
                      <span className="toggle-thumb" />
                      <span className="toggle-label">
                        {server.status === "on" ? "ON" : "OFF"}
                      </span>
                    </button>
                  </td>

                  {/* Timestamp */}
                  <td className="td">
                    <span className="timestamp">{formatTime(server.updatedAt)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sync footer */}
        <p className="sync-text">
          {dataUpdatedAt
            ? <>✦ Last synced: <span className="mono">{new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}</span> · refreshes every 30s</>
            : "Connecting…"}
        </p>
      </div>

      {/* Anya at the bottom */}
      <div className="anya-wrap">
        <img src={anyaImage} alt="Anya" className="anya-img" />
      </div>
    </div>
  );
}
