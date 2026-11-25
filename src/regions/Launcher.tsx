// The Spaces activity's main pane. With nothing selected it is the inventory's empty
// state: the create door as the one gradient primary, Connect Google Drive beside it, and
// the count. A create that settles selects the new space, so the door yields to the
// launcher and the panel lists the space when the route names it. With a space selected
// the launcher item fills this pane; until then that state renders only the live region,
// which stays mounted so the create's settle is still announced after the door yields.
import { useSpacesMode } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import { useSpaceList, type SpaceList } from "../hooks/useSpaceList";
import { launcherLines, spaceCountLine, type SpaceKind } from "../lib/inventory";
import CreateSpaceDoor from "../components/CreateSpaceDoor";
import ConnectSourceEntry from "../components/ConnectSourceEntry";
import "./Launcher.css";

export default function Launcher() {
  const selected = useSpacesMode()?.route.spaceId ?? null;
  const list = useSpaceList();
  const onCreate = async (kind: SpaceKind) => {
    const id = await list.create(kind);
    if (id !== null) list.navigate({ spaceId: id, activity: "spaces" }, COPY.openFailed);
  };

  // The live region sits at one position in both states, so the element that announces a
  // settle is the same one that held it while the create was in flight.
  return (
    <>
      {selected === null && <NothingSelected list={list} onCreate={onCreate} />}
      <p className="launch-status" role="status">
        {list.announcement}
      </p>
    </>
  );
}

function NothingSelected({ list, onCreate }: { list: SpaceList; onCreate: (kind: SpaceKind) => Promise<void> }) {
  const lines = launcherLines(list.state);
  return (
    <section className="launch-empty" aria-label={COPY.heading}>
      <div className="launch-doors">
        <CreateSpaceDoor busy={list.pendingKind !== null} onCreate={(kind) => void onCreate(kind)} />
        <ConnectSourceEntry onConnected={list.reload} />
      </div>
      {lines.pick && (
        <div className="launch-lines">
          <p>{COPY.pickASpace}</p>
          {lines.count !== null && <p>{spaceCountLine(lines.count)}</p>}
        </div>
      )}
    </section>
  );
}
