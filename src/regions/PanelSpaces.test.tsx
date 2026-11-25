// The panel.spaces and page.spaces layouts, driven against the SDK double: the invitee's
// Invitations inbox, the narrow panel's absence of admin verbs, and the full tab's legacy
// Manage modal and its stylesheet.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invite, SpaceInfo } from "@immediately-run/sdk";
// The shipped stylesheet as text, so the invite-row layout case asserts against what
// ships. `vitest.config.ts` sets `css: true`; without it this import is empty and that
// case would pass vacuously.
import type { InventorySpace, SpaceKind } from "../lib/inventory";
import legacyCss from "../components/legacy/legacy.css?raw";
import { doubles, push, resetDoubles } from "../test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("../test/sdkDouble")).sdkModule);
vi.mock("@immediately-run/sdk/sandboxUtils", async () => (await import("../test/sdkDouble")).sandboxUtilsModule);

import PanelSpaces from "./PanelSpaces";

const ownedSpace: SpaceInfo = { spaceId: "s1", name: "My space", role: "owner" };
const sharedDocsInvite: Invite = { spaceId: "s9", uid: "u-me", role: "reader", owner: "u-owner", invitedBy: "u-owner", name: "Shared docs" };

beforeEach(() => {
  resetDoubles();
});

describe("PanelSpaces — the Invitations inbox", () => {
  it("renders a live invite; Accept calls acceptInvite, then the row is gone (live) and the space appears", async () => {
    const user = userEvent.setup();
    // After accept the host pushes the emptied inbox, and the spaces list gains the space.
    doubles.acceptInvite.mockImplementation(async () => {
      await push({ invites: [] });
    });
    doubles.listAllSpaces
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ spaceId: "s9", name: "Shared docs", role: "reader" }]);

    render(<PanelSpaces fullTab={false} />);
    await push({ invites: [sharedDocsInvite] });
    await screen.findByText("Invitations");
    expect(screen.getByText(/invited you to/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(doubles.acceptInvite).toHaveBeenCalledWith("s9"));
    await waitFor(() => expect(screen.queryByText("Invitations")).not.toBeInTheDocument());
    expect(await screen.findByText("Shared docs")).toBeInTheDocument();
  });

  it("Decline calls declineInvite and the row leaves the inbox (live) with no space added", async () => {
    const user = userEvent.setup();
    doubles.declineInvite.mockImplementation(async () => {
      await push({ invites: [] });
    });

    render(<PanelSpaces fullTab={false} />);
    await push({ invites: [sharedDocsInvite] });
    await screen.findByText("Invitations");
    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() => expect(doubles.declineInvite).toHaveBeenCalledWith("s9"));
    await waitFor(() => expect(screen.queryByText("Invitations")).not.toBeInTheDocument());
    expect(screen.queryByText("Shared docs")).not.toBeInTheDocument();
  });

  it("an invite pushed while the panel is open appears without a reload", async () => {
    render(<PanelSpaces fullTab={false} />);
    await screen.findByText("No spaces yet. Apps create them on demand.");
    expect(screen.queryByText("Invitations")).not.toBeInTheDocument();
    await push({ invites: [sharedDocsInvite] });
    expect(await screen.findByText("Invitations")).toBeInTheDocument();
    expect(doubles.listAllSpaces).toHaveBeenCalledTimes(1);
  });

  it("an invite whose name/invitedBy contains markup renders as inert text (escaped)", async () => {
    const markup = '<img src=x onerror="alert(1)">';
    const { container } = render(<PanelSpaces fullTab={false} />);
    await push({ invites: [{ ...sharedDocsInvite, invitedBy: markup, name: markup }] });
    await screen.findByText("Invitations");
    expect(screen.getByText(/invited you to/i).textContent).toContain(markup);
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it("a non-https avatar never reaches an <img src>", async () => {
    const { container } = render(<PanelSpaces fullTab={false} />);
    await push({ invites: [{ ...sharedDocsInvite, avatarUrl: "javascript:alert(1)" }] });
    await screen.findByText("Invitations");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("PanelSpaces — the narrow panel and the full tab", () => {
  it("the narrow panel.spaces layout exposes no admin or setup verb, but browses and shows invitations", async () => {
    doubles.listAllSpaces.mockResolvedValue([ownedSpace]);
    render(<PanelSpaces fullTab={false} />);
    expect(await screen.findByText("My space")).toBeInTheDocument();
    expect(screen.queryByText("Manage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Google Drive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create a space" })).not.toBeInTheDocument();
    await push({ invites: [sharedDocsInvite] });
    expect(await screen.findByText("Invitations")).toBeInTheDocument();
  });

  it("the full tab exposes Manage for an owned space, create and connect", async () => {
    doubles.listAllSpaces.mockResolvedValue([ownedSpace]);
    render(<PanelSpaces fullTab />);
    expect(await screen.findByText("Manage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Google Drive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a space" })).toBeInTheDocument();
  });

  it("marks only shared spaces; personal is the unmarked default", async () => {
    const listed: InventorySpace[] = [
      { spaceId: "s1", name: "Mine", role: "owner", kind: "personal" },
      { spaceId: "s2", name: "Ours", role: "owner", kind: "shared" },
      { spaceId: "s3", name: "Legacy", role: "owner" },
    ];
    doubles.listAllSpaces.mockResolvedValue(listed);
    render(<PanelSpaces fullTab />);
    const row = async (name: string) => (await screen.findByText(name)).closest("li") as HTMLElement;
    expect(within(await row("Ours")).getByText("shared")).toBeInTheDocument();
    expect(within(await row("Mine")).queryByText("shared")).not.toBeInTheDocument();
    expect(within(await row("Legacy")).queryByText("shared")).not.toBeInTheDocument();
  });

  it("after converting in Manage, the refreshed list shows the shared mark", async () => {
    let kind: SpaceKind = "personal";
    doubles.listAllSpaces.mockImplementation(async (): Promise<InventorySpace[]> => [{ spaceId: "s1", name: "Mine", role: "owner", kind }]);
    render(<PanelSpaces fullTab />);
    await userEvent.click(await screen.findByRole("button", { name: "Manage" }));
    await userEvent.click(await screen.findByRole("button", { name: /Convert to shared…/ }));
    doubles.protocolRequest.mockImplementation(async () => {
      kind = "shared";
      return { ok: true };
    });
    await userEvent.click(screen.getByRole("button", { name: /Convert to shared — cannot be undone/ }));
    await waitFor(() =>
      expect(within(screen.getByText("Mine").closest("li") as HTMLElement).getByText("shared")).toBeInTheDocument(),
    );
  });

  it("the invite row cannot push a control outside the dialog", async () => {
    // On a narrow dialog the role select once spilled outside and the submit button was
    // clipped. jsdom does not lay out, but it does cascade a stylesheet into
    // getComputedStyle, so the two properties that make the overflow impossible are
    // asserted on the real controls with the real stylesheet:
    //   - the row wraps, so a control that will not fit moves to the next line;
    //   - the growing input can shrink below its content width, so it gives way first.
    // A flex item defaults to `min-width: auto`, which is why `flex: 1` alone overflowed.
    // The geometric check ("nothing is clipped at 320px") needs a browser.
    const user = userEvent.setup();
    doubles.listAllSpaces.mockResolvedValue([ownedSpace]);

    expect(legacyCss.length).toBeGreaterThan(0);
    const style = document.createElement("style");
    style.textContent = legacyCss;
    document.head.appendChild(style);

    render(<PanelSpaces fullTab />);
    await user.click(await screen.findByText("Manage"));
    const dialog = await screen.findByRole("dialog");

    const input = within(dialog).getByPlaceholderText("handle");
    const row = input.parentElement as HTMLElement;
    const select = within(dialog).getAllByRole("combobox")[0];
    const submit = within(dialog).getByRole("button", { name: "Invite" });

    expect(row).toContainElement(select);
    expect(row).toContainElement(submit);
    expect(getComputedStyle(row).flexWrap).toBe("wrap");
    expect(getComputedStyle(input).minWidth).toBe("0px");

    style.remove();
  });
});
