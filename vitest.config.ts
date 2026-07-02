import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config for the space-manager unit tests (R3-91 invitations UI). jsdom DOM
// + Testing Library; the SDK is mocked per test so the UI renders without a live host.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
