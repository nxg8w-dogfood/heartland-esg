/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // Only scan the app's own entry for dependencies. The original app kept under reference/ is
  // a spec, not part of the build, and its imports can't be resolved.
  optimizeDeps: { entries: ["index.html"] },
  // Inline the Excel reader in tests so src/calc/xlsx.test.ts can stand in for the host's
  // block on Web Workers in its fflate dependency.
  test: { server: { deps: { inline: ["read-excel-file"] } } },
});
