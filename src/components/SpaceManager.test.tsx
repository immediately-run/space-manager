// R3-91 (FILE_SHARING §6.4/§9.7/§9.8) — the space-manager Invitations UI. Driven
// against a mocked SDK: inviting creates a PENDING offer (not a member); the invitee
// inbox Accepts/Declines; the owner Revokes a pending invite; owner-written strings
// render inert.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Invite, Member, SpaceInfo } from "@immediately-run/sdk";

// --- controllable SDK doubles ------------------------------------------------
const listAllSpaces = vi.fn<() => Promise<SpaceInfo[]>>();
const getSpaceMembers = vi.fn<() => Promise<Member[]>>();
const listPendingInvites = vi.fn<() => Promise<Invite[]>>();
const listMyInvites = vi.fn<() => Promise<Invite[]>>();
const inviteToSpace = vi.fn<() => Promise<void>>();
const acceptInvite = vi.fn<() => Promise<void>>();
const declineInvite = vi.fn<() => Promise<void>>();
const revokeInvite = vi.fn<() => Promise<void>>();
const shareSpace = vi.fn<() => Promise<void>>();

vi.mock("@immediately-run/sdk", () => ({
  listAllSpaces: () => listAllSpaces(),
  getSpaceMembers: () => getSpaceMembers(),
  listPendingInvites: () => listPendingInvites(),
  listMyInvites: () => listMyInvites(),
  inviteToSpace: (...a: unknown[]) => inviteToSpace(...(a as [])),
  acceptInvite: (...a: unknown[]) => acceptInvite(...(a as [])),
  declineInvite: (...a: unknown[]) => declineInvite(...(a as [])),
  revokeInvite: (...a: unknown[]) => revokeInvite(...(a as [])),
  shareSpace: (...a: unknown[]) => shareSpace(...(a as [])),
  unshareSpace: vi.fn(),
  setSpaceRole: vi.fn(),
  listGrants: vi.fn(async () => []),
  revokeGrant: vi.fn(),
  createSpace: vi.fn(),
  useAuth: () => ({ status: "signed-in" }),
  useRegion: () => "panel.spaces",
}));

import SpaceManager from "./SpaceManager";

const ownedSpace: SpaceInfo = { spaceId: "s1", name: "My space", role: "owner" } as SpaceInfo;

beforeEach(() => {
  for (const m of [
    listAllSpaces, getSpaceMembers, listPendingInvites, listMyInvites,
    inviteToSpace, acceptInvite, declineInvite, revokeInvite, shareSpace,
  ]) m.mockReset();
  // sensible empty defaults; individual tests override.
  listAllSpaces.mockResolvedValue([]);
  getSpaceMembers.mockResolvedValue([]);
  listPendingInvites.mockResolvedValue([]);
  listMyInvites.mockResolvedValue([]);
  inviteToSpace.mockResolvedValue(undefined);
  acceptInvite.mockResolvedValue(undefined);
  declineInvite.mockResolvedValue(undefined);
  revokeInvite.mockResolvedValue(undefined);
});

describe("SpaceManager — invitations (R3-91)", () => {
  it("inviting calls inviteToSpace (not shareSpace) and the offer lands under Pending, not Members", async () => {
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
    expect(shareSpace).not.toHaveBeenCalled();
    // The offer appears under Pending invites — and is NOT a member row.
    await within(dialog).findByText("Pending invites");
    expect(within(dialog).getByText("@bob")).toBeInTheDocument();
  });

  it("the inbox renders a received invite; Accept calls acceptInvite, then the row is gone and the space appears", async () => {
    const user = userEvent.setup();
    // The inbox has one invite until accept; after accept the inbox is empty and the
    // space list gains the accepted space.
    listMyInvites
      .mockResolvedValueOnce([{ spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: "u-owner", name: "Shared docs" }])
      .mockResolvedValue([]);
    listAllSpaces
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ spaceId: "s9", name: "Shared docs", role: "reader" } as SpaceInfo]);

    render(<SpaceManager />);
    await screen.findByText("Invitations");
    expect(screen.getByText(/invited you to/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith("s9"));
    // The inbox row is gone and the space now appears in the list (one round-trip).
    await waitFor(() => expect(screen.queryByText("Invitations")).not.toBeInTheDocument());
    expect(await screen.findByText("Shared docs")).toBeInTheDocument();
  });

  it("Decline calls declineInvite and removes the inbox row with no space added", async () => {
    const user = userEvent.setup();
    listMyInvites
      .mockResolvedValueOnce([{ spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: "u-owner", name: "Shared docs" }])
      .mockResolvedValue([]);
    listAllSpaces.mockResolvedValue([]);

    render(<SpaceManager />);
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

  it("an invite whose name/invitedBy contains markup renders as inert text (escaped)", async () => {
    const markup = '<img src=x onerror="alert(1)">';
    listMyInvites.mockResolvedValue([
      { spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: markup, name: markup },
    ]);
    listAllSpaces.mockResolvedValue([]);

    const { container } = render(<SpaceManager />);
    await screen.findByText("Invitations");
    // The markup is present as TEXT, and produced no injected <img> element.
    expect(screen.getByText(/invited you to/i).textContent).toContain(markup);
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
