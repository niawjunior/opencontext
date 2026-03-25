"use client";

export function useElectron() {
  if (typeof window !== "undefined" && window.electronAPI) {
    return window.electronAPI;
  }
  return null;
}
