// The Spaces activity's panel: the reader's spaces as a listbox. Selecting one asks the
// host to move the mode there; which row is selected comes from the host's pushed route,
// never from this frame's state, so the panel and the main pane always agree.
//
// Invitations are events and live in notifications: this panel points at them with one
// line and never lists them.
import { useId, useState, type KeyboardEvent } from "react";
import { navigateSpaces, useInvites, useSpacesMode, type SpacesTarget } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import { useSpaceList } from "../hooks/useSpaceList";
import { activeOption, inventoryItems, inventoryRow, inviteLine, nextActiveIndex } from "../lib/inventory";
import CreateSpaceDoor from "../components/CreateSpaceDoor";
import SpaceRow from "../components/SpaceRow";
import "./Inventory.css";

const SKELETON_ROWS = 4;

export default function Inventory() {
  const list = useSpaceList();
  const invites = useInvites();
  const selectedId = useSpacesMode()?.route.spaceId ?? null;
  const baseId = useId();
  const [active, setActive] = useState<number | null>(null);

  // A refusal is the host's answer, not a crash: log it and say so in the live region.
  const navigate = (target: SpacesTarget) => {
    navigateSpaces(target).catch((e: unknown) => {
      console.error("space-manager: navigateSpaces refused", e);
      list.announce(COPY.openFailed);
    });
  };
  const go = (spaceId: string) => navigate({ spaceId, activity: "spaces" });

  const { state } = list;
  if (state.status === "auth-required") return null;
  if (state.status === "refused") return <p className="inv-refused">{COPY.listRefused}</p>;

  const spaces = state.status === "ready" ? state.spaces : [];
  const items = inventoryItems(spaces, list.pendingKind);
  const activeIndex = activeOption(items, selectedId, active);
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const pointer = inviteLine(invites.length);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Enter") {
      const item = items[activeIndex];
      if (item && !item.pending) {
        e.preventDefault();
        go(item.space.spaceId);
      }
      return;
    }
    const next = nextActiveIndex(e.key, activeIndex, items.length);
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };

  return (
    <section className="inv" aria-labelledby={`${baseId}-h`}>
      <header className="inv-hd">
        <span className="tag">{COPY.eyebrow}</span>
        <h2 className="inv-h" id={`${baseId}-h`}>
          {COPY.heading}
        </h2>
      </header>

      {state.status === "loading" && (
        <ul className="inv-skeleton" aria-busy="true" aria-label={COPY.loading}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <li key={i} className="inv-skeleton-row" />
          ))}
        </ul>
      )}

      {state.status === "failed" && <p className="inv-msg">{COPY.listFailed}</p>}

      {state.status === "ready" && spaces.length === 0 && (
        <div className="inv-empty">
          <p className="inv-msg">{COPY.empty}</p>
          <CreateSpaceDoor busy={list.pendingKind !== null} onCreate={(kind) => void list.create(kind)} />
        </div>
      )}

      {items.length > 0 && (
        <ul
          className="inv-list"
          role="listbox"
          tabIndex={0}
          aria-labelledby={`${baseId}-h`}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={onKeyDown}
        >
          {items.map((item, i) => (
            <SpaceRow
              key={item.space.spaceId}
              optionId={optionId(i)}
              row={inventoryRow(item.space)}
              selected={item.space.spaceId === selectedId}
              active={i === activeIndex}
              pending={item.pending}
              onOpen={() => {
                setActive(i);
                go(item.space.spaceId);
              }}
            />
          ))}
        </ul>
      )}

      {pointer && (
        <button type="button" className="inv-invites" onClick={() => navigate({ destination: "notifications" })}>
          {pointer}
        </button>
      )}

      <p className="inv-status" role="status">
        {list.announcement}
      </p>
    </section>
  );
}
