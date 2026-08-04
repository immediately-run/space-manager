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
    // R3-256: process real CSS imports instead of stubbing them to empty. jsdom
    // does not lay out, but it DOES cascade a stylesheet into `getComputedStyle`,
    // so this lets a test assert the shipped stylesheet's effect on the shipped
    // markup — the only way to pin a CSS-only regression in this harness. With the
    // default (`css: false`) every CSS import is an empty string and such a test
    // passes vacuously against any stylesheet at all.
    css: true,
  },
});
