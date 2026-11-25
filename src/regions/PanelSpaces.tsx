// The space list outside the spaces mode, in two layouts the caller picks.
//
// The narrow layout is the `panel.spaces` region: edit mode's panel, and the region the
// notifications detail composes for invitation kinds. It browses and holds the
// Invitations inbox, and offers no admin verb, because that region holds `spaces:user`
// only.
//
// The full-tab layout is `page.spaces` (the `/spaces` route): the same list plus create,
// connect, the Manage modal on owned rows and the grant audit, which that binding's
// `spaces:admin` allows.
import { useState } from "react";
import { COPY } from "../data/copy";
import { useSpaceList } from "../hooks/useSpaceList";
import { spaceName } from "../lib/display";
import { inventoryItems, kindOf, type InventorySpace } from "../lib/inventory";
import InvitationsInbox from "../components/InvitationsInbox";
import CreateSpaceDoor from "../components/CreateSpaceDoor";
import ConnectSourceEntry from "../components/ConnectSourceEntry";
import ManageModal from "../components/legacy/ManageModal";
import AuditView from "../components/legacy/AuditView";
import "./PanelSpaces.css";

export default function PanelSpaces({ fullTab }: { fullTab: boolean }) {
  const list = useSpaceList();
  const [selected, setSelected] = useState<InventorySpace | null>(null);
  const { state } = list;

  return (
    <div className={fullTab ? "sm sm-full" : "sm"}>
      <header className="sm-hd">
        <span className="sm-title">{COPY.panelTitle}</span>
        {fullTab && (
          <span className="sm-create">
            <ConnectSourceEntry onConnected={list.reload} />
            <CreateSpaceDoor busy={list.pendingKind !== null} onCreate={(kind) => void list.create(kind)} />
          </span>
        )}
      </header>
      {state.status === "auth-required" && <div className="sm-msg">{COPY.panelSignIn}</div>}
      {(state.status === "failed" || state.status === "refused") && <div className="sm-msg">{COPY.listFailed}</div>}
      <InvitationsInbox onAccepted={list.reload} />
      {state.status === "loading" ? (
        <div className="sm-msg">{COPY.loading}</div>
      ) : state.status === "ready" && state.spaces.length === 0 && list.pendingKind === null ? (
        <div className="sm-msg">{COPY.panelEmpty}</div>
      ) : (
        <ul className="sm-list">
          {inventoryItems(state.status === "ready" ? state.spaces : [], list.pendingKind).map(({ space: s, pending }) => (
            <li key={s.spaceId} className="sm-row" aria-busy={pending || undefined}>
              <div className="sm-row-main">
                <span className="sm-name">{spaceName(s.name)}</span>
                {/* Only shared is marked: personal is the unmarked default. */}
                {kindOf(s) === "shared" && (
                  <span className="sm-kind" data-kind="shared">
                    {COPY.shared}
                  </span>
                )}
                <span className="sm-role" data-role={s.role}>
                  {pending ? COPY.creatingRow : s.role}
                </span>
              </div>
              {fullTab && !pending && s.role === "owner" && (
                <button type="button" className="sm-manage" onClick={() => setSelected(s)}>
                  Manage
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {fullTab && <p className="sm-msg" role="status">{list.announcement}</p>}
      {fullTab && selected && (
        <ManageModal space={selected} onClose={() => setSelected(null)} onSpacesChanged={list.reload} />
      )}
      {fullTab && <AuditView />}
    </div>
  );
}
