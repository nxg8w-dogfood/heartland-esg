import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // Only scan the app's own entry for dependencies. The original app kept under reference/ is
  // a spec, not part of the build, and its imports can't be resolved.
  optimizeDeps: { entries: ["index.html"] },
});
