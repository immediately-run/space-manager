// The inventory's logic, framework-free: ordering, row labels, the list's load states,
// the pending create, and listbox key movement. Components wire these; tests drive them.
import type { SandboxMount, SpaceInfo } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import { spaceName } from "./display";

export type SpaceKind = "personal" | "shared";

/**
 * A listed space. The host derives `kind` and sends it on the wire, but the pinned SDK's
 * `SpaceInfo` does not type it yet, so it is widened here and read through `kindOf`.
 */
export type InventorySpace = SpaceInfo & { kind?: SpaceKind };

/** The host's derived kind, or undefined for a row from a host that does not send one. */
export const kindOf = (s: SpaceInfo): SpaceKind | undefined => {
  const kind = (s as { kind?: unknown }).kind;
  return kind === "personal" || kind === "shared" ? kind : undefined;
};

/**
 * Orders the inventory by name, then by id so two spaces with one name keep a stable
 * order. The visit-order sort replaces this once the host keeps a per-space visit cursor.
 */
export function sortInventory<T extends SpaceInfo>(spaces: readonly T[]): T[] {
  return [...spaces].sort((a, b) => {
    const byName = spaceName(a.name).localeCompare(spaceName(b.name));
    if (byName !== 0) return byName;
    return a.spaceId < b.spaceId ? -1 : a.spaceId > b.spaceId ? 1 : 0;
  });
}

export interface InventoryRow {
  id: string;
  name: string;
  roleLabel: string;
  modeLabel: string;
}

/** What one inventory row shows: the name, the reader's role, and personal or shared. */
export function inventoryRow(space: SpaceInfo): InventoryRow {
  return {
    id: space.spaceId,
    name: spaceName(space.name),
    roleLabel: space.role ?? "",
    modeLabel: kindOf(space) === "shared" ? COPY.shared : COPY.personal,
  };
}

/** The pointer line to invitations in notifications, or null when none are waiting. */
export function inviteLine(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? COPY.invitation : COPY.invitations} ${COPY.waitingInNotifications}`;
}

/** The main pane's count line with nothing selected. */
export function spaceCountLine(count: number): string {
  return `${count} ${count === 1 ? COPY.space : COPY.spaces}.`;
}

// --- the list's load state ----------------------------------------------------------

export type ListState =
  | { status: "loading" }
  | { status: "ready"; spaces: InventorySpace[] }
  | { status: "refused" }
  | { status: "auth-required" }
  | { status: "failed" };

const codeOf = (e: unknown): string | undefined => {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

/**
 * Maps a `listAllSpaces` rejection to a state. `forbidden` is a fork not yet consented
 * (one line, nothing else); `auth-required` cannot happen in a signed-in-only mode, so it
 * renders nothing and is logged; anything else is a failure the reader is told about.
 */
export function listStateFromError(e: unknown): ListState {
  const code = codeOf(e);
  if (code === "forbidden") return { status: "refused" };
  if (code === "auth-required") return { status: "auth-required" };
  return { status: "failed" };
}

/** The line to announce for a failed create, or null when the reader backed out of the host's consent. */
export function createFailureLine(e: unknown): string | null {
  const code = codeOf(e);
  if (code === "cancelled") return null;
  return code === "quota-exceeded" ? COPY.createQuota : COPY.createFailed;
}

/**
 * Whether the inventory should list again because the host's route selects a space it
 * does not list: one just created in the main pane, or one accepted from notifications.
 * Once per routed id, so a space the reader cannot list does not loop.
 */
export function shouldRelist(state: ListState, routedId: string | null, relistedFor: string | null): boolean {
  if (state.status !== "ready" || routedId === null || routedId === relistedFor) return false;
  return !state.spaces.some((s) => s.spaceId === routedId);
}

/**
 * What the main pane says with nothing selected: *Pick a space…* while the list can be
 * shown, and the count once it is loaded. A list the host refused or failed shows neither.
 */
export function launcherLines(state: ListState): { pick: boolean; count: number | null } {
  if (state.status === "ready") return { pick: true, count: state.spaces.length };
  return { pick: state.status === "loading", count: null };
}

// --- the pending create -------------------------------------------------------------

/** The prefix of a pending row's id. A real spaceId never carries it. */
export const PENDING_ID = "pending:";

export interface InventoryItem {
  space: InventorySpace;
  pending: boolean;
}

/**
 * The rows to render: the settled spaces plus, while a create is in flight, the new space
 * at the position it will settle at. The host names an unnamed space *Untitled space*, so
 * that is where it sorts.
 */
export function inventoryItems(spaces: readonly InventorySpace[], pendingKind: SpaceKind | null): InventoryItem[] {
  const pending: InventorySpace | null =
    pendingKind === null ? null : { spaceId: PENDING_ID + "new", role: "owner", kind: pendingKind };
  const all = pending ? [...spaces, pending] : [...spaces];
  return sortInventory(all).map((space) => ({ space, pending: space === pending }));
}

/**
 * The settled row, from `createSpace`'s own answer, so the new space appears without a
 * refetch. Null when the host's answer carries no id, which leaves a refetch as the way
 * to learn it.
 */
export function settledSpace(mount: Pick<SandboxMount, "id" | "name">, kind: SpaceKind): InventorySpace | null {
  if (!mount.id) return null;
  return { spaceId: mount.id, name: mount.name, role: "owner", kind };
}

// --- listbox keys -------------------------------------------------------------------

/**
 * The next active option for an APG listbox key, or null for a key the listbox does not
 * handle. ↑/↓ stop at the ends; Home and End jump.
 */
export function nextActiveIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown":
      return Math.min(index + 1, count - 1);
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * The option the listbox's focus sits on: the one the reader moved to, kept inside the
 * list as it shrinks, else the selected space, else the first.
 */
export function activeOption(spaces: readonly SpaceInfo[], selectedId: string | null, moved: number | null): number {
  if (spaces.length === 0) return 0;
  if (moved !== null) return Math.min(moved, spaces.length - 1);
  const selected = spaces.findIndex((s) => s.spaceId === selectedId);
  return selected >= 0 ? selected : 0;
}
