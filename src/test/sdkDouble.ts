// A controllable stand-in for `@immediately-run/sdk`, shared by every component test:
//
//   vi.mock("@immediately-run/sdk", async () => (await import("../test/sdkDouble")).sdkModule);
//
// The verbs are `vi.fn`s a test programs; the pushed channels (invitations, the spaces
// mode's route) live in `live`, and `push()` simulates a host push that re-renders every
// subscribed hook.
import { useEffect, useReducer } from "react";
import { act } from "@testing-library/react";
import { vi } from "vitest";
import type {
  GrantRecord,
  Invite,
  Member,
  SandboxMount,
  SpaceInfo,
  SpacesModeState,
  SpacesTarget,
} from "@immediately-run/sdk";

export const doubles = {
  listAllSpaces: vi.fn<() => Promise<SpaceInfo[]>>(),
  getSpaceMembers: vi.fn<(spaceId: string) => Promise<Member[]>>(),
  listPendingInvites: vi.fn<(spaceId: string) => Promise<Invite[]>>(),
  inviteToSpace: vi.fn<(spaceId: string, handle: string, role: string) => Promise<void>>(),
  acceptInvite: vi.fn<(spaceId: string) => Promise<void>>(),
  declineInvite: vi.fn<(spaceId: string) => Promise<void>>(),
  revokeInvite: vi.fn<(spaceId: string, uid: string) => Promise<void>>(),
  unshareSpace: vi.fn<(spaceId: string, uid: string) => Promise<void>>(),
  setSpaceRole: vi.fn<(spaceId: string, uid: string, role: string) => Promise<void>>(),
  listGrants: vi.fn<() => Promise<GrantRecord[]>>(),
  revokeGrant: vi.fn<(appKey: string, spaceId: string) => Promise<void>>(),
  createSpace: vi.fn<(opts?: unknown) => Promise<Partial<SandboxMount>>>(),
  navigateSpaces: vi.fn<(target: SpacesTarget) => Promise<void>>(),
  protocolRequest: vi.fn<(scheme: string, method: string, args: unknown[]) => Promise<unknown>>(),
};

interface Live {
  invites: Invite[];
  mode: SpacesModeState | null;
  region: string | null;
  auth: "signed-in" | "signed-out";
}

export const live: Live = { invites: [], mode: null, region: null, auth: "signed-in" };
const listeners = new Set<() => void>();

function useLive<T>(read: () => T): T {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return read();
}

/** Simulate a host push on the live channels. */
export const push = (patch: Partial<Live>) =>
  act(() => {
    Object.assign(live, patch);
    listeners.forEach((l) => l());
  });

/** Reset every double to an empty, signed-in host with no spaces-mode route. */
export function resetDoubles() {
  for (const fn of Object.values(doubles)) fn.mockReset();
  Object.assign(live, { invites: [], mode: null, region: null, auth: "signed-in" } satisfies Live);
  doubles.listAllSpaces.mockResolvedValue([]);
  doubles.getSpaceMembers.mockResolvedValue([]);
  doubles.listPendingInvites.mockResolvedValue([]);
  doubles.inviteToSpace.mockResolvedValue(undefined);
  doubles.acceptInvite.mockResolvedValue(undefined);
  doubles.declineInvite.mockResolvedValue(undefined);
  doubles.revokeInvite.mockResolvedValue(undefined);
  doubles.listGrants.mockResolvedValue([]);
  doubles.createSpace.mockResolvedValue({ id: "s-new", path: "/mnt/s-new", type: "firestore" });
  doubles.navigateSpaces.mockResolvedValue(undefined);
  doubles.protocolRequest.mockResolvedValue({ ok: true });
}

/** A host refusal, shaped as the SDK rejects: an Error carrying `code`. */
export const refusal = (code: string) => Object.assign(new Error(code), { code });

/** The module the `vi.mock` factory returns for `@immediately-run/sdk`. */
export const sdkModule = {
  listAllSpaces: () => doubles.listAllSpaces(),
  getSpaceMembers: (id: string) => doubles.getSpaceMembers(id),
  listPendingInvites: (id: string) => doubles.listPendingInvites(id),
  inviteToSpace: (id: string, h: string, r: string) => doubles.inviteToSpace(id, h, r),
  acceptInvite: (id: string) => doubles.acceptInvite(id),
  declineInvite: (id: string) => doubles.declineInvite(id),
  revokeInvite: (id: string, uid: string) => doubles.revokeInvite(id, uid),
  unshareSpace: (id: string, uid: string) => doubles.unshareSpace(id, uid),
  setSpaceRole: (id: string, uid: string, r: string) => doubles.setSpaceRole(id, uid, r),
  listGrants: () => doubles.listGrants(),
  revokeGrant: (k: string, id: string) => doubles.revokeGrant(k, id),
  createSpace: (opts?: unknown) => doubles.createSpace(opts),
  navigateSpaces: (t: SpacesTarget) => doubles.navigateSpaces(t),
  useInvites: () => useLive(() => live.invites),
  useSpacesMode: () => useLive(() => live.mode),
  useRegion: () => live.region,
  useAuth: () => ({ status: live.auth }),
};

/** The module the `vi.mock` factory returns for `@immediately-run/sdk/sandboxUtils`. */
export const sandboxUtilsModule = {
  protocolRequest: (scheme: string, method: string, args: unknown[]) => doubles.protocolRequest(scheme, method, args),
};
