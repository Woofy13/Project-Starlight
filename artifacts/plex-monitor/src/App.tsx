import {
  useListServers,
  useUpdateServerStatus,
  getListServersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

  function handleStatusChange(id: string, newStatus: string) {
    updateStatus.mutate({ id, data: { status: newStatus } });
  }

  return (
    <div className="app-bg min-h-screen flex flex-col items-center py-14 px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#1e40af"/>
              <polygon points="12,8 26,16 12,24" fill="#93c5fd"/>
            </svg>
            <h1 className="title-text text-3xl font-bold tracking-tight">
              Plex Monitoring Service
            </h1>
          </div>
          <p className="subtitle-text text-sm mt-1">Server status and selection control panel</p>
        </div>

        <div className="card-bg rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full">
            <thead>
              <tr className="header-row">
                <th className="px-8 py-4 text-left text-xs font-semibold uppercase tracking-widest header-text w-2/5">
                  Server
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-widest header-text w-1/5">
                  Selection
                </th>
                <th className="px-8 py-4 text-left text-xs font-semibold uppercase tracking-widest header-text">
                  Last Changed
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={3} className="px-8 py-8 text-center timestamp-text text-sm">
                    Loading servers…
                  </td>
                </tr>
              )}
              {servers?.map((server, idx) => (
                <tr
                  key={server.id}
                  className={`row-hover transition-colors duration-150 ${idx < (servers.length - 1) ? "row-divider" : ""}`}
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`status-dot ${server.status === "on" ? "dot-on" : "dot-off"}`}
                        aria-label={server.status === "on" ? "Online" : "Offline"}
                      />
                      <span className="server-name text-base font-semibold">{server.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-center gap-5">
                      <label className="radio-label flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`status-${server.id}`}
                          value="on"
                          checked={server.status === "on"}
                          onChange={() => handleStatusChange(server.id, "on")}
                          className="radio-input"
                        />
                        <span className="radio-text text-sm font-medium">On</span>
                      </label>
                      <label className="radio-label flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`status-${server.id}`}
                          value="off"
                          checked={server.status === "off"}
                          onChange={() => handleStatusChange(server.id, "off")}
                          className="radio-input"
                        />
                        <span className="radio-text text-sm font-medium">Off</span>
                      </label>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="timestamp-text text-sm font-mono">
                      {formatTimestamp(server.updatedAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center footer-text text-xs">
          {dataUpdatedAt
            ? <>Last synced: <span className="font-mono">{new Date(dataUpdatedAt).toLocaleTimeString()}</span> · refreshes every 30s</>
            : "Connecting…"}
        </p>
      </div>
    </div>
  );
}
