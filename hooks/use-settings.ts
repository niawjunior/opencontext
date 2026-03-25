"use client";

import { useState, useEffect, useCallback } from "react";
import { useElectron } from "./use-electron";
import type { AppSettings } from "@/lib/types";

export function useSettings() {
  const api = useElectron();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const s = (await api.settings.get()) as AppSettings;
      setSettings(s);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (data: Partial<AppSettings>) => {
      if (!api) return null;
      const updated = (await api.settings.update(data)) as AppSettings;
      setSettings(updated);
      return updated;
    },
    [api]
  );

  return { settings, loading, refresh, update };
}
