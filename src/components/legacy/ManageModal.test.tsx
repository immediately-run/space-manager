// The legacy Manage modal: inviting creates a pending offer (not a member), the owner
// revokes a pending invite, and the one-way conversion to shared is armed then confirmed.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventorySpace } from "../../lib/inventory";
import { doubles, refusal, resetDoubles } from "../../test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("../../test/sdkDouble")).sdkModule);
vi.mock("@immediately-run/sdk/sandboxUtils", async () => (await import("../../test/sdkDouble")).sandboxUtilsModule);

import ManageModal from "./ManageModal";

const mine: InventorySpace = { spaceId: "s1", name: "Mine", role: "owner", kind: "personal" };
const ours: InventorySpace = { spaceId: "s2", name: "Ours", role: "owner", kind: "shared" };
const bob = { spaceId: "s1", uid: "uid-of-bob", role: "writer" as const, owner: "u-me", invitedBy: "u-me", login: "bob" };

beforeEach(() => {
  resetDoubles();
});

describe("ManageModal — invitations", () => {
  it("inviting calls inviteToSpace and the offer lands under Pending, not Members", async () => {
    const user = userEvent.setup();
    doubles.listPendingInvites.mockResolvedValueOnce([]).mockResolvedValue([bob]);
    render(<ManageModal space={mine} onClose={() => {}} />);

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("handle"), "bob");
    await user.click(within(dialog).getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(doubles.inviteToSpace).toHaveBeenCalledWith("s1", "bob", "writer"));
    await within(dialog).findByText("Pending invites");
    expect(within(dialog).getByText("@bob")).toBeInTheDocument();
  });

  it("owner Revoke calls revokeInvite and drops the pending row", async () => {
    const user = userEvent.setup();
    doubles.listPendingInvites.mockResolvedValueOnce([bob]).mockResolvedValue([]);
    render(<ManageModal space={mine} onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Pending invites");

    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(doubles.revokeInvite).toHaveBeenCalledWith("s1", "uid-of-bob"));
    await waitFor(() => expect(within(dialog).queryByText("Pending invites")).not.toBeInTheDocument());
  });
});

describe("ManageModal — converting to shared", () => {
  it("the owner's personal space offers Convert; arming shows the irreversibility; confirming hits the verb once", async () => {
    render(<ManageModal space={mine} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /Convert to shared…/ }));
    expect(doubles.protocolRequest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Convert to shared — cannot be undone/ }));
    expect(doubles.protocolRequest).toHaveBeenCalledWith("protocol-spaces", "convertToShared", [{ spaceId: "s1", confirm: true }]);
    expect(doubles.protocolRequest).toHaveBeenCalledTimes(1);
  });

  it("a shared space offers no conversion", async () => {
    render(<ManageModal space={ours} onClose={() => {}} />);
    await screen.findByText(/Share “Ours”/);
    expect(screen.queryByRole("button", { name: /Convert to shared/ })).not.toBeInTheDocument();
  });

  it("a forbidden conversion surfaces the owner-only message", async () => {
    doubles.protocolRequest.mockRejectedValue(refusal("forbidden"));
    render(<ManageModal space={mine} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /Convert to shared…/ }));
    await userEvent.click(screen.getByRole("button", { name: /Convert to shared — cannot be undone/ }));
    expect(await screen.findByText(/Only the owner can convert this space/)).toBeInTheDocument();
  });
});
