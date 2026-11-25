// The Spaces activity's panel, driven against the SDK double.
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invite, SandboxMount, SpaceInfo, SpacesModeState } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import type { InventorySpace } from "../lib/inventory";
import { doubles, push, refusal, resetDoubles } from "../test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("../test/sdkDouble")).sdkModule);

import Inventory from "./Inventory";

const spaces: InventorySpace[] = [
  { spaceId: "s-str", name: "Strategy 2027", role: "reader", kind: "shared" },
  { spaceId: "s-fin", name: "Finance team", role: "writer", kind: "shared" },
  { spaceId: "s-eva", name: "Eva's 8th birthday", role: "owner", kind: "personal" },
];

const invite = (spaceId: string): Invite => ({ spaceId, uid: "u-me", role: "reader", owner: "u-o", invitedBy: "u-o", name: "Theirs" });
const mode = (spaceId: string | null): SpacesModeState => ({ route: { spaceId, activity: "spaces" }, space: null });

const options = () => screen.getAllByRole("option");
const optionNames = () => options().map((o) => o.querySelector(".inv-row-name")?.textContent);

beforeEach(() => {
  resetDoubles();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Inventory", () => {
  it("renders the eyebrow, the heading, and the rows in name order with role and kind", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    await screen.findByRole("listbox");
    expect(screen.getByText(COPY.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: COPY.heading })).toBeInTheDocument();
    expect(optionNames()).toEqual(["Eva's 8th birthday", "Finance team", "Strategy 2027"]);
    expect(options()[1]).toHaveTextContent("writer · shared");
    expect(options()[0]).toHaveTextContent("owner · personal");
  });

  it("names each option by its name and role line, leaving the Open pill out", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    await screen.findByRole("listbox");
    expect(screen.getByRole("option", { name: "Finance team writer · shared" })).toBeInTheDocument();
  });

  it("selecting a row asks the host to navigate to that space", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    await userEvent.click(await screen.findByRole("option", { name: /Finance team/ }));
    expect(doubles.navigateSpaces).toHaveBeenCalledTimes(1);
    expect(doubles.navigateSpaces).toHaveBeenCalledWith({ spaceId: "s-fin", activity: "spaces" });
  });

  it("the Open pill navigates like selecting the row", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    const { container } = render(<Inventory />);
    await screen.findByRole("listbox");
    const pill = container.querySelectorAll<HTMLButtonElement>(".inv-row-open")[2];
    await userEvent.click(pill);
    expect(doubles.navigateSpaces).toHaveBeenCalledTimes(1);
    expect(doubles.navigateSpaces).toHaveBeenCalledWith({ spaceId: "s-str", activity: "spaces" });
  });

  it("marks the selected row from the host's pushed route, and follows a new push", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    await screen.findByRole("listbox");
    expect(options().filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(0);

    await push({ mode: mode("s-str") });
    expect(screen.getByRole("option", { name: /Strategy 2027/ })).toHaveAttribute("aria-selected", "true");

    await push({ mode: mode("s-eva") });
    expect(screen.getByRole("option", { name: /Strategy 2027/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("option", { name: /Eva/ })).toHaveAttribute("aria-selected", "true");
  });

  it("moves with ↑/↓/Home/End and navigates with Enter", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    const listbox = await screen.findByRole("listbox");
    listbox.focus();
    const active = () => document.getElementById(listbox.getAttribute("aria-activedescendant") ?? "");

    expect(active()).toHaveTextContent("Eva");
    await userEvent.keyboard("{ArrowDown}");
    expect(active()).toHaveTextContent("Finance team");
    await userEvent.keyboard("{End}");
    expect(active()).toHaveTextContent("Strategy 2027");
    await userEvent.keyboard("{Home}");
    expect(active()).toHaveTextContent("Eva");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(doubles.navigateSpaces).toHaveBeenCalledWith({ spaceId: "s-fin", activity: "spaces" });
  });

  it("two invitations render the pointer line and no invitation row", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    await screen.findByRole("listbox");
    await push({ invites: [invite("i1"), invite("i2")] });

    const line = screen.getByRole("button", { name: "2 invitations waiting in notifications →" });
    expect(screen.queryByText(/invited you to/)).not.toBeInTheDocument();
    expect(screen.queryByText("Theirs")).not.toBeInTheDocument();
    expect(options()).toHaveLength(3);

    await userEvent.click(line);
    expect(doubles.navigateSpaces).toHaveBeenCalledWith({ destination: "notifications" });
  });

  it("shows no pointer line when no invitation is waiting", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    render(<Inventory />);
    await screen.findByRole("listbox");
    expect(screen.queryByRole("button", { name: /waiting in notifications/ })).not.toBeInTheDocument();
  });

  it("an empty list shows the brief's sentence with the create door as the primary", async () => {
    render(<Inventory />);
    expect(await screen.findByText(COPY.empty)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.create })).toHaveClass("btn");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("forbidden shows only the refusal line", async () => {
    doubles.listAllSpaces.mockRejectedValue(refusal("forbidden"));
    const { container } = render(<Inventory />);
    await screen.findByText(COPY.listRefused);
    expect(container).toHaveTextContent(new RegExp(`^${COPY.listRefused}$`));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("auth-required renders nothing and logs", async () => {
    doubles.listAllSpaces.mockRejectedValue(refusal("auth-required"));
    const { container } = render(<Inventory />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("any other failure says the list could not load", async () => {
    doubles.listAllSpaces.mockRejectedValue(refusal("unknown"));
    render(<Inventory />);
    expect(await screen.findByText(COPY.listFailed)).toBeInTheDocument();
  });

  it("loading shows skeleton rows with nothing clickable", async () => {
    let resolve: (v: SpaceInfo[]) => void = () => {};
    doubles.listAllSpaces.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = render(<Inventory />);
    expect(container.querySelectorAll(".inv-skeleton-row")).toHaveLength(4);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => resolve(spaces));
    expect(container.querySelectorAll(".inv-skeleton-row")).toHaveLength(0);
  });

  it("a pending create shows the row pending, then settled, and the status region reads the settle", async () => {
    doubles.listAllSpaces.mockResolvedValue([]);
    let settle: (m: Partial<SandboxMount>) => void = () => {};
    doubles.createSpace.mockReturnValue(new Promise((r) => (settle = r)));
    render(<Inventory />);

    await userEvent.click(await screen.findByRole("radio", { name: COPY.kindShared }));
    await userEvent.click(screen.getByRole("button", { name: COPY.create }));
    expect(doubles.createSpace).toHaveBeenCalledWith({ kind: "shared" });

    // Pending: the row is in the list at its final position, and the door is busy.
    const pending = await screen.findByRole("option", { name: /Untitled space/ });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    expect(pending).toHaveTextContent(COPY.creatingRow);
    expect(screen.getByRole("button", { name: COPY.creating })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("");

    await act(async () => settle({ id: "s-new", name: "Untitled space", path: "/mnt/s-new", type: "firestore" }));

    const settled = await screen.findByRole("option", { name: /Untitled space/ });
    expect(settled).not.toHaveAttribute("aria-disabled");
    expect(settled).toHaveTextContent("owner · shared");
    expect(screen.getByRole("status")).toHaveTextContent(COPY.created);
    // The new space came from createSpace's own answer, not a second list round-trip.
    expect(doubles.listAllSpaces).toHaveBeenCalledTimes(1);
  });

  it("a failed create removes the pending row and announces why", async () => {
    doubles.createSpace.mockRejectedValue(refusal("quota-exceeded"));
    render(<Inventory />);
    await userEvent.click(await screen.findByRole("button", { name: COPY.create }));
    expect(await screen.findByRole("status")).toHaveTextContent(COPY.createQuota);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.create })).toBeEnabled();
  });

  it("a cancelled create is calm: no row, no announcement", async () => {
    doubles.createSpace.mockRejectedValue(refusal("cancelled"));
    render(<Inventory />);
    await userEvent.click(await screen.findByRole("button", { name: COPY.create }));
    await waitFor(() => expect(screen.getByRole("button", { name: COPY.create })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("a refused navigation is announced, not thrown", async () => {
    doubles.listAllSpaces.mockResolvedValue(spaces);
    doubles.navigateSpaces.mockRejectedValue(refusal("invalid"));
    render(<Inventory />);
    await userEvent.click(await screen.findByRole("option", { name: /Finance team/ }));
    expect(await screen.findByRole("status")).toHaveTextContent(COPY.openFailed);
  });

  it("renders an owner-written name as inert text", async () => {
    const markup = '<img src=x onerror="alert(1)">';
    doubles.listAllSpaces.mockResolvedValue([{ spaceId: "s1", name: markup, role: "reader" }]);
    const { container } = render(<Inventory />);
    const option = await screen.findByRole("option");
    expect(within(option).getByText(markup)).toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
