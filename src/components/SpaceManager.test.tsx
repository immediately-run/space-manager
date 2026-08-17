// R3-91 (FILE_SHARING §6.4/§9.7/§9.8) — the space-manager Invitations UI. Driven
// against a mocked SDK: inviting creates a PENDING offer (not a member); the invitee
// inbox Accepts/Declines; the owner Revokes a pending invite; owner-written strings
// render inert.
import * as React from "react";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Invite, Member, SpaceInfo } from "@immediately-run/sdk";
// The REAL shipped stylesheet, as text, so the R3-256 layout test asserts against
// what ships rather than a copy of the rules. `vitest.config.ts` sets `css: true`;
// without it this import is an empty string and that test passes vacuously.
import spaceManagerCss from "./SpaceManager.css?raw";

// --- controllable SDK doubles ------------------------------------------------
const listAllSpaces = vi.fn<() => Promise<SpaceInfo[]>>();
const getSpaceMembers = vi.fn<() => Promise<Member[]>>();
const listPendingInvites = vi.fn<() => Promise<Invite[]>>();
const inviteToSpace = vi.fn<() => Promise<void>>();
const acceptInvite = vi.fn<() => Promise<void>>();
const declineInvite = vi.fn<() => Promise<void>>();
const revokeInvite = vi.fn<() => Promise<void>>();

// A controllable `useInvites()` live channel: the host pushes the inbox and the hook
// re-renders. `setInvites(list)` simulates a host push (an invite arriving/leaving).
const inviteState = vi.hoisted(() => ({ current: [] as unknown[], listeners: new Set<() => void>() }));

// A controllable `useRegion()`: admin verbs only render on the non-panel (full-tab)
// surface (R3-96 / PRINCIPALS §9 B3). Default to `page.spaces` so the admin-flow tests
// below exercise the Manage modal; the R3-96 test overrides it to `panel.spaces`.
const regionState = vi.hoisted(() => ({ current: "page.spaces" as string }));

// A controllable `useTaskInput()`: the R3-269 `open-space` boot hint
// (/spaces?space=<id> → auto-open the Manage modal at that space). Default null.
const taskInputState = vi.hoisted(() => ({
  current: null as { task: string; params: Record<string, unknown> } | null,
}));

vi.mock("@immediately-run/sdk", () => ({
  listAllSpaces: () => listAllSpaces(),
  getSpaceMembers: () => getSpaceMembers(),
  listPendingInvites: () => listPendingInvites(),
  useInvites: () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
      inviteState.listeners.add(force);
      return () => { inviteState.listeners.delete(force); };
    }, []);
    return inviteState.current;
  },
  inviteToSpace: (...a: unknown[]) => inviteToSpace(...(a as [])),
  acceptInvite: (...a: unknown[]) => acceptInvite(...(a as [])),
  declineInvite: (...a: unknown[]) => declineInvite(...(a as [])),
  revokeInvite: (...a: unknown[]) => revokeInvite(...(a as [])),
  unshareSpace: vi.fn(),
  setSpaceRole: vi.fn(),
  listGrants: vi.fn(async () => []),
  revokeGrant: vi.fn(),
  createSpace: vi.fn(),
  useAuth: () => ({ status: "signed-in" }),
  useRegion: () => regionState.current,
  useTaskInput: () => taskInputState.current,
}));

import SpaceManager from "./SpaceManager";

const ownedSpace: SpaceInfo = { spaceId: "s1", name: "My space", role: "owner" } as SpaceInfo;

/** Simulate a host push on the live invitations channel. */
const pushInvites = (list: Invite[]) =>
  act(() => {
    inviteState.current = list;
    inviteState.listeners.forEach((l) => l());
  });

beforeEach(() => {
  for (const m of [
    listAllSpaces, getSpaceMembers, listPendingInvites,
    inviteToSpace, acceptInvite, declineInvite, revokeInvite,
  ]) m.mockReset();
  inviteState.current = [];
  regionState.current = "page.spaces"; // full-tab by default; the R3-96 test sets panel.spaces
  taskInputState.current = null;
  // sensible empty defaults; individual tests override.
  listAllSpaces.mockResolvedValue([]);
  getSpaceMembers.mockResolvedValue([]);
  listPendingInvites.mockResolvedValue([]);
  inviteToSpace.mockResolvedValue(undefined);
  acceptInvite.mockResolvedValue(undefined);
  declineInvite.mockResolvedValue(undefined);
  revokeInvite.mockResolvedValue(undefined);
});

describe("SpaceManager — invitations (R3-91)", () => {
  it("inviting calls inviteToSpace and the offer lands under Pending, not Members", async () => {
    const user = userEvent.setup();
    listAllSpaces.mockResolvedValue([ownedSpace]);
    // First manage-open load: no members, no pending. After invite: one pending.
    getSpaceMembers.mockResolvedValue([]);
    listPendingInvites
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ spaceId: "s1", uid: "uid-of-bob", role: "writer", owner: "u-me", invitedBy: "u-me", login: "bob" }]);

    render(<SpaceManager />);
    await user.click(await screen.findByText("Manage"));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/No members|Loading members/i).catch(() => {});
    await user.type(within(dialog).getByPlaceholderText("handle"), "bob");
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(inviteToSpace).toHaveBeenCalledWith("s1", "bob", "writer"));
    // The offer appears under Pending invites — and is NOT a member row.
    await within(dialog).findByText("Pending invites");
    expect(within(dialog).getByText("@bob")).toBeInTheDocument();
  });

  it("the inbox renders a live invite; Accept calls acceptInvite, then the row is gone (live) and the space appears", async () => {
    const user = userEvent.setup();
    // After accept, the host pushes the emptied inbox (simulated in the mock) and the
    // spaces list gains the accepted space.
    acceptInvite.mockImplementation(async () => {
      inviteState.current = [];
      inviteState.listeners.forEach((l) => l());
    });
    listAllSpaces
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ spaceId: "s9", name: "Shared docs", role: "reader" } as SpaceInfo]);

    render(<SpaceManager />);
    await pushInvites([{ spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: "u-owner", name: "Shared docs" }]);
    await screen.findByText("Invitations");
    expect(screen.getByText(/invited you to/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith("s9"));
    // The inbox row is gone (live) and the space now appears in the list.
    await waitFor(() => expect(screen.queryByText("Invitations")).not.toBeInTheDocument());
    expect(await screen.findByText("Shared docs")).toBeInTheDocument();
  });

  it("Decline calls declineInvite and the row leaves the inbox (live) with no space added", async () => {
    const user = userEvent.setup();
    declineInvite.mockImplementation(async () => {
      inviteState.current = [];
      inviteState.listeners.forEach((l) => l());
    });
    listAllSpaces.mockResolvedValue([]);

    render(<SpaceManager />);
    await pushInvites([{ spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: "u-owner", name: "Shared docs" }]);
    await screen.findByText("Invitations");
    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(declineInvite).toHaveBeenCalledWith("s9"));
    await waitFor(() => expect(screen.queryByText("Invitations")).not.toBeInTheDocument());
    expect(screen.queryByText("Shared docs")).not.toBeInTheDocument();
  });

  it("owner Revoke calls revokeInvite and drops the pending row", async () => {
    const user = userEvent.setup();
    listAllSpaces.mockResolvedValue([ownedSpace]);
    getSpaceMembers.mockResolvedValue([]);
    listPendingInvites
      .mockResolvedValueOnce([{ spaceId: "s1", uid: "uid-of-bob", role: "writer", owner: "u-me", invitedBy: "u-me", login: "bob" }])
      .mockResolvedValue([]);

    render(<SpaceManager />);
    await user.click(await screen.findByText("Manage"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Pending invites");

    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith("s1", "uid-of-bob"));
    await waitFor(() => expect(within(dialog).queryByText("Pending invites")).not.toBeInTheDocument());
  });

  it("the narrow panel.spaces rail exposes NO admin verb, but still browses + shows invitations (R3-96 / §9 B3)", async () => {
    regionState.current = "panel.spaces";
    listAllSpaces.mockResolvedValue([ownedSpace]);

    render(<SpaceManager />);
    // Browse still works — the owned space is listed (spaces:user).
    expect(await screen.findByText("My space")).toBeInTheDocument();
    // ...but the admin affordance is absent on the rail (no spaces:admin here).
    expect(screen.queryByText("Manage")).not.toBeInTheDocument();
    // The invitee-side inbox (spaces:user) is retained — a pushed invite renders.
    await pushInvites([{ spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: "u-owner", name: "Shared docs" } as Invite]);
    expect(await screen.findByText("Invitations")).toBeInTheDocument();
  });

  it("the full-tab surface DOES expose Manage for an owned space (page.spaces)", async () => {
    regionState.current = "page.spaces";
    listAllSpaces.mockResolvedValue([ownedSpace]);

    render(<SpaceManager />);
    expect(await screen.findByText("Manage")).toBeInTheDocument();
  });

  it("R3-269: an `open-space` boot hint auto-opens Manage at that owned space", async () => {
    regionState.current = "page.spaces";
    taskInputState.current = { task: "open-space", params: { spaceId: "s1" } };
    listAllSpaces.mockResolvedValue([ownedSpace]);

    render(<SpaceManager />);
    const dialog = await screen.findByRole("dialog", { name: "Manage space" });
    expect(dialog).toHaveTextContent("My space");
  });

  it("R3-269: an `open-space` hint for a non-owned / unknown space opens nothing", async () => {
    regionState.current = "page.spaces";
    taskInputState.current = { task: "open-space", params: { spaceId: "not-mine" } };
    listAllSpaces.mockResolvedValue([ownedSpace]);

    render(<SpaceManager />);
    await screen.findByText("Manage"); // list rendered
    expect(screen.queryByRole("dialog", { name: "Manage space" })).not.toBeInTheDocument();
  });

  it("the invite row cannot push a control outside the dialog (R3-256 / drill F4)", async () => {
    // The reported failure: on a narrow dialog the role select spilled outside and
    // the submit button was "clipped/invisible; only reachable by Tab". jsdom does
    // not lay out, so this cannot be asserted in pixels — but it DOES cascade a
    // stylesheet into getComputedStyle, so the two properties that make the
    // overflow impossible are asserted on the REAL rendered controls with the REAL
    // shipped stylesheet, not by grepping the CSS file:
    //
    //   · the row wraps  ⇒ a control that will not fit moves to the next line
    //                      instead of being pushed past the modal edge;
    //   · the growing input can shrink below its content width ⇒ it gives way
    //                      first, so the row only wraps when it genuinely must.
    //
    // A flex item defaults to `min-width: auto` (its CONTENT minimum), which is
    // precisely why `flex: 1` alone was not enough and the row overflowed.
    // RESIDUAL: the true geometric check ("nothing is clipped at 320px") needs a
    // browser; this repo has no layout-capable harness.
    const user = userEvent.setup();
    listAllSpaces.mockResolvedValue([ownedSpace]);

    // Guard against the vacuous pass: if CSS processing is ever disabled again,
    // the sheet is empty, every computed value falls back to its initial value,
    // and the assertions below would "pass" while testing nothing.
    expect(spaceManagerCss.length).toBeGreaterThan(0);
    const style = document.createElement("style");
    style.textContent = spaceManagerCss;
    document.head.appendChild(style);

    render(<SpaceManager />);
    await user.click(await screen.findByText("Manage"));
    const dialog = await screen.findByRole("dialog");

    const input = within(dialog).getByPlaceholderText("handle");
    const row = input.parentElement as HTMLElement;
    const select = within(dialog).getAllByRole("combobox")[0];
    const submit = within(dialog).getByRole("button", { name: "Invite" });

    // All three controls really are in one row — the premise of the failure.
    expect(row).toContainElement(select);
    expect(row).toContainElement(submit);

    expect(getComputedStyle(row).flexWrap).toBe("wrap");
    expect(getComputedStyle(input).minWidth).toBe("0px");

    style.remove();
  });

  it("an invite whose name/invitedBy contains markup renders as inert text (escaped)", async () => {
    const markup = '<img src=x onerror="alert(1)">';
    listAllSpaces.mockResolvedValue([]);

    const { container } = render(<SpaceManager />);
    await pushInvites([
      { spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: markup, name: markup },
    ]);
    await screen.findByText("Invitations");
    // The markup is present as TEXT, and produced no injected <img> element.
    expect(screen.getByText(/invited you to/i).textContent).toContain(markup);
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
