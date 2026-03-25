import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node22",
  outdir: "dist-electron",
  external: ["electron", "electron-updater", "electron-log"],
  sourcemap: true,
  logLevel: "info",
};

// Main process
await build({
  ...shared,
  entryPoints: ["electron/main.ts"],
});

// Preload script
await build({
  ...shared,
  entryPoints: ["electron/preload.ts"],
});
