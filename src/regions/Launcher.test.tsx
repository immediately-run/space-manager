// The main pane with nothing selected, driven against the SDK double: the count, the
// create from the main-pane door (busy, settle, then selecting the new space), and the
// refused list.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxMount, SpaceInfo, SpacesModeState } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import { doubles, push, refusal, resetDoubles } from "../test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("../test/sdkDouble")).sdkModule);
vi.mock("@immediately-run/sdk/sandboxUtils", async () => (await import("../test/sdkDouble")).sandboxUtilsModule);

import Launcher from "./Launcher";

const two: SpaceInfo[] = [
  { spaceId: "a", name: "Alpha", role: "owner" },
  { spaceId: "b", name: "Beta", role: "reader" },
];
const selected = (spaceId: string): SpacesModeState => ({ route: { spaceId, activity: "spaces" }, space: null });
const mount = (id: string): Partial<SandboxMount> => ({ id, name: "Untitled space", path: `/mnt/${id}`, type: "firestore" });

beforeEach(() => {
  resetDoubles();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Launcher, nothing selected", () => {
  it("shows the pick line and the count", async () => {
    doubles.listAllSpaces.mockResolvedValue(two);
    render(<Launcher />);
    expect(await screen.findByText("2 spaces.")).toBeInTheDocument();
    expect(screen.getByText(COPY.pickASpace)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COPY.create })).toHaveClass("btn");
  });

  it("a create is busy while pending, announces the settle, and selects the new space", async () => {
    doubles.listAllSpaces.mockResolvedValue(two);
    let settle: (m: Partial<SandboxMount>) => void = () => {};
    doubles.createSpace.mockReturnValue(new Promise((r) => (settle = r)));
    render(<Launcher />);
    await screen.findByText("2 spaces.");

    await userEvent.click(screen.getByRole("radio", { name: COPY.kindShared }));
    await userEvent.click(screen.getByRole("button", { name: COPY.create }));
    expect(doubles.createSpace).toHaveBeenCalledWith({ kind: "shared" });
    expect(screen.getByRole("button", { name: COPY.creating })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(doubles.navigateSpaces).not.toHaveBeenCalled();

    await act(async () => settle(mount("s-new")));
    expect(screen.getByRole("status")).toHaveTextContent(COPY.created);
    expect(screen.getByText("3 spaces.")).toBeInTheDocument();
    expect(doubles.navigateSpaces).toHaveBeenCalledTimes(1);
    expect(doubles.navigateSpaces).toHaveBeenCalledWith({ spaceId: "s-new", activity: "spaces" });

    // The host moves the mode: the door yields, and the same live region keeps the settle.
    const region = screen.getByRole("status");
    await push({ mode: selected("s-new") });
    expect(screen.queryByRole("button", { name: COPY.create })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(COPY.created);
  });

  it("a failed create navigates nowhere and announces why", async () => {
    doubles.createSpace.mockRejectedValue(refusal("quota-exceeded"));
    render(<Launcher />);
    await userEvent.click(await screen.findByRole("button", { name: COPY.create }));
    expect(await screen.findByRole("status")).toHaveTextContent(COPY.createQuota);
    expect(doubles.navigateSpaces).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: COPY.create })).toBeEnabled();
  });

  it("a cancelled create is calm: no announcement, no navigation", async () => {
    doubles.createSpace.mockRejectedValue(refusal("cancelled"));
    render(<Launcher />);
    await userEvent.click(await screen.findByRole("button", { name: COPY.create }));
    await waitFor(() => expect(screen.getByRole("button", { name: COPY.create })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(doubles.navigateSpaces).not.toHaveBeenCalled();
  });

  it("a create that settles while the list is still loading re-lists rather than dropping the space", async () => {
    // The first list request is in flight when the create settles, and answers late
    // without the new space; the re-list after the create is the one that lands.
    let firstAnswer: (v: SpaceInfo[]) => void = () => {};
    doubles.listAllSpaces
      .mockReturnValueOnce(new Promise((r) => (firstAnswer = r)))
      .mockResolvedValue([...two, { spaceId: "s-new", name: "Untitled space", role: "owner" }]);
    render(<Launcher />);
    await userEvent.click(screen.getByRole("button", { name: COPY.create }));

    expect(await screen.findByText("3 spaces.")).toBeInTheDocument();
    expect(doubles.listAllSpaces).toHaveBeenCalledTimes(2);
    await act(async () => firstAnswer(two));
    expect(screen.getByText("3 spaces.")).toBeInTheDocument();
  });

  it("forbidden shows neither the pick line nor a count", async () => {
    doubles.listAllSpaces.mockRejectedValue(refusal("forbidden"));
    render(<Launcher />);
    await waitFor(() => expect(doubles.listAllSpaces).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText(COPY.pickASpace)).not.toBeInTheDocument();
    expect(screen.queryByText(/spaces?\.$/)).not.toBeInTheDocument();
  });
});
