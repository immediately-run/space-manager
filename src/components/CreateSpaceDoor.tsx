// The create door: Create a space, with the personal-or-shared choice beside it. It drives
// the host's `createSpace()` consent path through the region's space list; the host owns
// the quota gate, the first-create consent and the write ordering, and this paints none
// of that. Creating storage in the reader's account needs an account, so a signed-out
// frame shows no door rather than a button that cannot work.
//
// Personal is the default because it is the reversible state; shared is shared from the
// first byte, and the host fixes it at creation.
import { useId, useState } from "react";
import { useAuth } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import type { SpaceKind } from "../lib/inventory";
import "./CreateSpaceDoor.css";

export default function CreateSpaceDoor({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (kind: SpaceKind) => void;
}) {
  const { status } = useAuth();
  const [kind, setKind] = useState<SpaceKind>("personal");
  // One name per door, so two doors in one document never share a radio group.
  const group = useId();

  if (status !== "signed-in") return null;

  return (
    <div className="door">
      <button type="button" className="btn" onClick={() => onCreate(kind)} disabled={busy} aria-busy={busy}>
        {busy ? COPY.creating : COPY.create}
      </button>
      <div className="door-kind" role="radiogroup" aria-label={COPY.kindGroup}>
        <label>
          <input type="radio" name={group} checked={kind === "personal"} onChange={() => setKind("personal")} />
          {COPY.kindPersonal}
        </label>
        <label>
          <input type="radio" name={group} checked={kind === "shared"} onChange={() => setKind("shared")} />
          {COPY.kindShared}
        </label>
        {kind === "shared" && <span className="door-note">{COPY.sharedNote}</span>}
      </div>
    </div>
  );
}
