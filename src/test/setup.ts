// Vitest setup: jest-dom matchers (toBeInTheDocument, toHaveAttribute, …) and a
// per-test DOM cleanup.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
