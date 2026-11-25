// The region switch: each region the host reports renders its own component. The regions
// render for real against the SDK double, and each case asserts a mark only that region
// draws.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceInfo } from "@immediately-run/sdk";
import { COPY } from "./data/copy";
import { REGION } from "./lib/regions";
import { doubles, live, resetDoubles } from "./test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("./test/sdkDouble")).sdkModule);
vi.mock("@immediately-run/sdk/sandboxUtils", async () => (await import("./test/sdkDouble")).sandboxUtilsModule);

import App from "./App";

const owned: SpaceInfo = { spaceId: "s1", name: "My space", role: "owner" };

beforeEach(() => {
  resetDoubles();
  doubles.listAllSpaces.mockResolvedValue([owned]);
});

describe("App", () => {
  it("renders the inventory for panel.spaces.inventory", async () => {
    live.region = REGION.inventory;
    render(<App />);
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: COPY.heading })).toBeInTheDocument();
  });

  it("renders the launcher shell for mainpane.spaces.launcher", async () => {
    live.region = REGION.launcher;
    render(<App />);
    expect(await screen.findByText(COPY.pickASpace)).toBeInTheDocument();
    expect(await screen.findByText("1 space.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.create })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("the launcher's create door yields once a space is selected", () => {
    live.region = REGION.launcher;
    live.mode = { route: { spaceId: "s1", activity: "spaces" }, space: null };
    const { container } = render(<App />);
    expect(screen.queryByRole("button", { name: COPY.create })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders PanelSpaces in its narrow layout for panel.spaces", async () => {
    live.region = REGION.panel;
    render(<App />);
    expect(await screen.findByText("My space")).toBeInTheDocument();
    expect(screen.getByText(COPY.panelTitle)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders PanelSpaces in its full-tab layout, with Manage, for page.spaces", async () => {
    live.region = REGION.page;
    render(<App />);
    expect(await screen.findByRole("button", { name: "Manage" })).toBeInTheDocument();
  });

  it("renders the inventory for a null region and for a region it does not know", async () => {
    for (const region of [null, "stage"]) {
      live.region = region;
      const { unmount } = render(<App />);
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
      unmount();
    }
  });
});
