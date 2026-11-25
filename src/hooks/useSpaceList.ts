// The reader's spaces as one region sees them: the load state, the create in flight, and
// the line the region's live region announces. Each frame holds its own copy; spaces are
// not pushed by the host, so a frame learns of a change by its own write or a reload.
import { useCallback, useEffect, useState } from "react";
import { createSpace, listAllSpaces } from "@immediately-run/sdk";
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
  announce: (line: string) => void;
  reload: () => Promise<void>;
  create: (kind: SpaceKind) => Promise<void>;
}

export function useSpaceList(): SpaceList {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [pendingKind, setPendingKind] = useState<SpaceKind | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const reload = useCallback(async () => {
    try {
      setState({ status: "ready", spaces: await listAllSpaces() });
    } catch (e) {
      const next = listStateFromError(e);
      // auth-required renders nothing and failed renders a generic line; both are
      // logged so the cause is not lost.
      if (next.status !== "refused") console.error("space-manager: listAllSpaces failed", e);
      setState(next);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await reload();
    };
    void run();
  }, [reload]);

  const create = useCallback(
    async (kind: SpaceKind) => {
      setPendingKind(kind);
      setAnnouncement("");
      try {
        // The host takes `kind` on the wire; the pinned SDK types only `name`, so the
        // options are widened here. The host validates the literal either way.
        const mount = await createSpace({ kind } as unknown as Parameters<typeof createSpace>[0]);
        const space = settledSpace(mount, kind);
        if (space) {
          setState((s) => (s.status === "ready" ? { status: "ready", spaces: [...s.spaces, space] } : s));
        } else {
          await reload();
        }
        setAnnouncement(COPY.created);
      } catch (e) {
        // A cancel is the reader dismissing the host's consent: nothing to say.
        const line = createFailureLine(e);
        if (line === null) return;
        console.error("space-manager: createSpace failed", e);
        setAnnouncement(line);
      } finally {
        setPendingKind(null);
      }
    },
    [reload],
  );

  return { state, pendingKind, announcement, announce: setAnnouncement, reload, create };
}
