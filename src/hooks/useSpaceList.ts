// The reader's spaces as one region sees them: the load state, the create in flight, and
// the line the region's live region announces. Each frame holds its own copy; spaces are
// not pushed by the host, so a frame learns of a change by its own write or a reload
// (the inventory reloads when the host's route names a space it does not list).
import { useCallback, useEffect, useRef, useState } from "react";
import { createSpace, listAllSpaces, navigateSpaces, type SpacesTarget } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import {
  createFailureLine,
  listStateFromError,
  settledSpace,
  type ListState,
  type SpaceKind,
} from "../lib/inventory";

export interface SpaceList {
  state: ListState;
  /** The kind of the create in flight, or null when none is. */
  pendingKind: SpaceKind | null;
  /** The last settle, for the region's `role="status"`. */
  announcement: string;
  reload: () => Promise<void>;
  /** Creates a space; resolves to the new space's id, or null when none settled. */
  create: (kind: SpaceKind) => Promise<string | null>;
  /** Asks the host to move; a refusal is logged and `failLine` is announced. */
  navigate: (target: SpacesTarget, failLine: string) => void;
}

export function useSpaceList(): SpaceList {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [pendingKind, setPendingKind] = useState<SpaceKind | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Only the newest list request may land: an older one answering late (the first load,
  // started before a create) would otherwise overwrite a list that has the new space.
  const latestLoad = useRef(0);
  const current = useRef(state);
  useEffect(() => {
    current.current = state;
  }, [state]);

  const reload = useCallback(async () => {
    const seq = ++latestLoad.current;
    let next: ListState;
    try {
      next = { status: "ready", spaces: await listAllSpaces() };
    } catch (e) {
      next = listStateFromError(e);
      // auth-required renders nothing and failed renders a generic line; both are
      // logged so the cause is not lost.
      if (next.status !== "refused") console.error("space-manager: listAllSpaces failed", e);
    }
    if (seq === latestLoad.current) setState(next);
  }, []);

  useEffect(() => {
    const run = async () => {
      await reload();
    };
    void run();
  }, [reload]);

  const create = useCallback(
    async (kind: SpaceKind): Promise<string | null> => {
      setPendingKind(kind);
      // The wait is announced at dispatch, then replaced by the settle.
      setAnnouncement(COPY.creating);
      try {
        // The host takes `kind` on the wire; the pinned SDK types only `name`, so the
        // options are widened here. The host validates the literal either way.
        const mount = await createSpace({ kind } as unknown as Parameters<typeof createSpace>[0]);
        const space = settledSpace(mount, kind);
        if (space && current.current.status === "ready") {
          // The create's own answer is the new row; no list round-trip.
          setState((s) => (s.status === "ready" ? { status: "ready", spaces: [...s.spaces, space] } : s));
        } else {
          // No id to build the row from, or no settled list to add it to: ask again.
          await reload();
        }
        setAnnouncement(COPY.created);
        return mount.id ?? null;
      } catch (e) {
        // A cancel is the reader dismissing the host's consent: the wait line clears and
        // nothing else is said.
        const line = createFailureLine(e);
        if (line !== null) console.error("space-manager: createSpace failed", e);
        setAnnouncement(line ?? "");
        return null;
      } finally {
        setPendingKind(null);
      }
    },
    [reload],
  );

  const navigate = useCallback((target: SpacesTarget, failLine: string) => {
    navigateSpaces(target).catch((e: unknown) => {
      console.error("space-manager: navigateSpaces refused", e);
      setAnnouncement(failLine);
    });
  }, []);

  return { state, pendingKind, announcement, reload, create, navigate };
}
