import { describe, expect, it } from "vitest";
import type { SandboxMount, SpaceInfo } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import {
  PENDING_ID,
  activeOption,
  createFailureLine,
  launcherLines,
  shouldRelist,
  inventoryItems,
  inventoryRow,
  inviteLine,
  kindOf,
  listStateFromError,
  nextActiveIndex,
  settledSpace,
  sortInventory,
  spaceCountLine,
  type InventorySpace,
} from "./inventory";

const space = (spaceId: string, name?: string, extra: Partial<InventorySpace> = {}): InventorySpace => ({
  spaceId,
  name,
  role: "writer",
  ...extra,
});

const refusal = (code: string) => Object.assign(new Error(code), { code });

describe("sortInventory", () => {
  it("orders by name", () => {
    const sorted = sortInventory([space("a", "Strategy 2027"), space("b", "Eva's 8th birthday"), space("c", "Finance team")]);
    expect(sorted.map((s) => s.name)).toEqual(["Eva's 8th birthday", "Finance team", "Strategy 2027"]);
  });

  it("breaks a tie on name by id", () => {
    const sorted = sortInventory([space("s3", "Notes"), space("s1", "Notes"), space("s2", "Notes")]);
    expect(sorted.map((s) => s.spaceId)).toEqual(["s1", "s2", "s3"]);
  });

  it("sorts an unnamed space where the host's Untitled space name puts it", () => {
    const sorted = sortInventory([space("z", "Zoo"), space("u"), space("a", "Alpha")]);
    expect(sorted.map((s) => s.spaceId)).toEqual(["a", "u", "z"]);
  });

  it("does not reorder its input", () => {
    const input = [space("b", "B"), space("a", "A")];
    sortInventory(input);
    expect(input.map((s) => s.spaceId)).toEqual(["b", "a"]);
  });

  it("sorts a realistic list of hundreds of spaces by name then id", () => {
    const many = Array.from({ length: 300 }, (_, i) => space(`id-${(i * 7919) % 300}`, `Space ${i % 40}`));
    const sorted = sortInventory(many);
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      const byName = (a.name ?? "").localeCompare(b.name ?? "");
      expect(byName < 0 || (byName === 0 && a.spaceId < b.spaceId)).toBe(true);
    }
  });
});

describe("inventoryRow", () => {
  it("labels shared from the host's derived kind", () => {
    expect(inventoryRow(space("s", "Ours", { kind: "shared", role: "owner" }))).toEqual({
      id: "s",
      name: "Ours",
      roleLabel: "owner",
      modeLabel: "shared",
    });
  });

  it("labels personal for a personal kind and for a row with no kind", () => {
    expect(inventoryRow(space("s", "Mine", { kind: "personal" })).modeLabel).toBe("personal");
    expect(inventoryRow(space("s", "Legacy")).modeLabel).toBe("personal");
  });

  it("builds a row from the SDK's own SpaceInfo, so a renamed field fails to compile", () => {
    // Typed against the SDK's exported SpaceInfo: if the host type renames spaceId, name
    // or role, this stops compiling. `kind` rides beside it on the wire.
    const fromHost = { spaceId: "s9", name: "Family trip New York 2026", role: "reader", owner: "u1" } satisfies SpaceInfo;
    const wire: SpaceInfo = Object.assign({}, fromHost, { kind: "shared" });
    expect(inventoryRow(wire)).toEqual({ id: "s9", name: "Family trip New York 2026", roleLabel: "reader", modeLabel: "shared" });
  });

  it("shows the host's fallback name for an unnamed space and no role when the host sent none", () => {
    const row = inventoryRow({ spaceId: "s" });
    expect(row.name).toBe(COPY.untitled);
    expect(row.roleLabel).toBe("");
  });
});

describe("kindOf", () => {
  it("reads only the two kinds the host sends", () => {
    expect(kindOf(space("s", "x", { kind: "shared" }))).toBe("shared");
    expect(kindOf(space("s", "x", { kind: "personal" }))).toBe("personal");
    expect(kindOf({ spaceId: "s", kind: "tier-2" } as SpaceInfo)).toBeUndefined();
    expect(kindOf(space("s", "x"))).toBeUndefined();
  });
});

describe("inviteLine and spaceCountLine", () => {
  it("points at notifications only when invitations are waiting", () => {
    expect(inviteLine(0)).toBeNull();
    expect(inviteLine(1)).toBe("1 invitation waiting in notifications →");
    expect(inviteLine(2)).toBe("2 invitations waiting in notifications →");
  });

  it("counts spaces", () => {
    expect(spaceCountLine(0)).toBe("0 spaces.");
    expect(spaceCountLine(1)).toBe("1 space.");
    expect(spaceCountLine(4)).toBe("4 spaces.");
  });
});

describe("listStateFromError", () => {
  it("maps each listAllSpaces refusal code to its state", () => {
    // The SDK's ListAllSpacesError set.
    const codes = ["auth-required", "cancelled", "forbidden", "not-found", "unsupported-scheme", "unknown"];
    expect(Object.fromEntries(codes.map((c) => [c, listStateFromError(refusal(c)).status]))).toEqual({
      "auth-required": "auth-required",
      cancelled: "failed",
      forbidden: "refused",
      "not-found": "failed",
      "unsupported-scheme": "failed",
      unknown: "failed",
    });
  });

  it("treats an error with no code, or not an error at all, as a failure", () => {
    expect(listStateFromError(new Error("boom")).status).toBe("failed");
    expect(listStateFromError(undefined).status).toBe("failed");
  });
});

describe("createFailureLine", () => {
  it("is calm on cancel, names the quota, and is generic otherwise", () => {
    expect(createFailureLine(refusal("cancelled"))).toBeNull();
    expect(createFailureLine(refusal("quota-exceeded"))).toBe(COPY.createQuota);
    expect(createFailureLine(refusal("forbidden"))).toBe(COPY.createFailed);
    expect(createFailureLine(new Error("x"))).toBe(COPY.createFailed);
  });
});

describe("inventoryItems", () => {
  const settled = [space("a", "Alpha"), space("z", "Zulu")];

  it("is the sorted settled list when nothing is pending", () => {
    expect(inventoryItems([settled[1], settled[0]], null).map((i) => [i.space.spaceId, i.pending])).toEqual([
      ["a", false],
      ["z", false],
    ]);
  });

  it("puts a pending create at its final position, as the host will name it", () => {
    const items = inventoryItems(settled, "shared");
    expect(items.map((i) => i.space.spaceId)).toEqual(["a", PENDING_ID + "new", "z"]);
    const pending = items[1];
    expect(pending.pending).toBe(true);
    expect(inventoryRow(pending.space)).toMatchObject({ name: COPY.untitled, roleLabel: "owner", modeLabel: "shared" });
  });
});

describe("settledSpace", () => {
  it("builds the settled row from createSpace's mount", () => {
    const mount: SandboxMount = { path: "/mnt/s-1", type: "firestore", id: "s-1", name: "Untitled space" };
    expect(settledSpace(mount, "personal")).toEqual({ spaceId: "s-1", name: "Untitled space", role: "owner", kind: "personal" });
  });

  it("is null when the mount carries no id", () => {
    expect(settledSpace({ path: "/x", type: "firestore" } as SandboxMount, "personal")).toBeNull();
  });
});

describe("listbox movement", () => {
  it("moves with the APG listbox keys and stops at the ends", () => {
    expect(nextActiveIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextActiveIndex("ArrowDown", 2, 3)).toBe(2);
    expect(nextActiveIndex("ArrowUp", 0, 3)).toBe(0);
    expect(nextActiveIndex("ArrowUp", 2, 3)).toBe(1);
    expect(nextActiveIndex("Home", 2, 3)).toBe(0);
    expect(nextActiveIndex("End", 0, 3)).toBe(2);
    expect(nextActiveIndex("a", 0, 3)).toBeNull();
    expect(nextActiveIndex("ArrowDown", 0, 0)).toBeNull();
  });

  it("starts on the selected space, follows the reader's moves, and stays inside a shrinking list", () => {
    const items = [space("a", "A"), space("b", "B"), space("c", "C")];
    expect(activeOption(items, "b", null)).toBe(1);
    expect(activeOption(items, null, null)).toBe(0);
    expect(activeOption(items, "gone", null)).toBe(0);
    expect(activeOption(items, "b", 2)).toBe(2);
    expect(activeOption(items.slice(0, 1), "a", 2)).toBe(0);
    expect(activeOption([], null, 3)).toBe(0);
  });
});

describe("shouldRelist", () => {
  const ready = { status: "ready" as const, spaces: [space("a", "A")] };

  it("re-lists once for a routed space the list does not have", () => {
    expect(shouldRelist(ready, "new", null)).toBe(true);
    expect(shouldRelist(ready, "new", "new")).toBe(false);
  });

  it("does not re-list for a listed space, no selection, or a list that is not ready", () => {
    expect(shouldRelist(ready, "a", null)).toBe(false);
    expect(shouldRelist(ready, null, null)).toBe(false);
    for (const status of ["loading", "refused", "auth-required", "failed"] as const) {
      expect(shouldRelist({ status }, "new", null)).toBe(false);
    }
  });
});

describe("launcherLines", () => {
  it("shows the pick line while loading and once ready, and the count only once ready", () => {
    expect(launcherLines({ status: "loading" }, null)).toEqual({ pick: true, count: null, pending: false });
    expect(launcherLines({ status: "ready", spaces: [space("a", "A"), space("b", "B")] }, null)).toEqual({
      pick: true,
      count: 2,
      pending: false,
    });
  });

  it("counts the space being created, marked pending, before the create settles", () => {
    const ready = { status: "ready" as const, spaces: [space("a", "A"), space("b", "B")] };
    expect(launcherLines(ready, "personal")).toEqual({ pick: true, count: 3, pending: true });
    expect(launcherLines({ status: "loading" }, "shared")).toEqual({ pick: true, count: null, pending: false });
  });

  it("shows neither line when the host refused or the list failed", () => {
    for (const status of ["refused", "auth-required", "failed"] as const) {
      expect(launcherLines({ status }, null)).toEqual({ pick: false, count: null, pending: false });
    }
  });
});
