// The Spaces activity's main pane. With nothing selected it is the inventory's empty
// state: the create door as the one gradient primary, Connect Google Drive beside it, and
// the count. With a space selected the door yields to the launcher, which the launcher
// item builds; until then that state renders nothing.
import { useSpacesMode } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import { useSpaceList } from "../hooks/useSpaceList";
import { spaceCountLine } from "../lib/inventory";
import CreateSpaceDoor from "../components/CreateSpaceDoor";
import ConnectSourceEntry from "../components/ConnectSourceEntry";
import "./Launcher.css";

export default function Launcher() {
  const selected = useSpacesMode()?.route.spaceId ?? null;
  if (selected !== null) return null;
  return <NothingSelected />;
}

function NothingSelected() {
  const list = useSpaceList();
  const count = list.state.status === "ready" ? list.state.spaces.length : null;
  return (
    <section className="launch-empty" aria-label={COPY.heading}>
      <div className="launch-doors">
        <CreateSpaceDoor busy={list.pendingKind !== null} onCreate={(kind) => void list.create(kind)} />
        <ConnectSourceEntry onConnected={list.reload} />
      </div>
      <div className="launch-lines">
        <p>{COPY.pickASpace}</p>
        {count !== null && <p>{spaceCountLine(count)}</p>}
      </div>
      <p className="launch-status" role="status">
        {list.announcement}
      </p>
    </section>
  );
}
