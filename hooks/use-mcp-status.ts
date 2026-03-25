"use client";

import { useState, useEffect, useCallback } from "react";
import { useElectron } from "./use-electron";

interface McpStatus {
  running: boolean;
  pid: number | null;
}

export function useMcpStatus() {
  const api = useElectron();
  const [status, setStatus] = useState<McpStatus>({
    running: false,
    pid: null,
  });

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const s = (await api.mcp.status()) as McpStatus;
      setStatus(s);
    } catch {
      // ignore
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const start = useCallback(async () => {
    if (!api) return;
    await api.mcp.start();
    await refresh();
  }, [api, refresh]);

  const stop = useCallback(async () => {
    if (!api) return;
    await api.mcp.stop();
    await refresh();
  }, [api, refresh]);

  return { ...status, start, stop, refresh };
}
