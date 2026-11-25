// The Spaces activity's panel: the reader's spaces as a listbox. Selecting one asks the
// host to move the mode there; which row is selected comes from the host's pushed route,
// never from this frame's state, so the panel and the main pane always agree.
//
// Invitations are events and live in notifications: this panel points at them with one
// line and never lists them. Creating a space is the main pane's door; this panel learns
// of the new space when the host's route selects it and the list does not have it.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useInvites, useSpacesMode } from "@immediately-run/sdk";
import { COPY } from "../data/copy";
import { useSpaceList } from "../hooks/useSpaceList";
import { activeOption, inventoryRow, inviteLine, nextActiveIndex, shouldRelist, sortInventory } from "../lib/inventory";
import SpaceRow from "../components/SpaceRow";
import "./Inventory.css";

const SKELETON_ROWS = 4;

export default function Inventory() {
  const list = useSpaceList();
  const invites = useInvites();
  const selectedId = useSpacesMode()?.route.spaceId ?? null;
  const baseId = useId();
  const [active, setActive] = useState<number | null>(null);
  // The active option is marked only while the listbox has focus; otherwise hover alone
  // shows a row's Open pill.
  const [focused, setFocused] = useState(false);
  const { state, reload, navigate } = list;

  const relistedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!shouldRelist(state, selectedId, relistedFor.current)) return;
    relistedFor.current = selectedId;
    const run = async () => {
      await reload();
    };
    void run();
  }, [state, selectedId, reload]);

  const go = (spaceId: string) => navigate({ spaceId, activity: "spaces" }, COPY.openFailed);

  if (state.status === "auth-required") return null;
  if (state.status === "refused") return <p className="inv-refused">{COPY.listRefused}</p>;

  const spaces = state.status === "ready" ? sortInventory(state.spaces) : [];
  const activeIndex = activeOption(spaces, selectedId, active);
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const pointer = inviteLine(invites.length);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Enter") {
      const space = spaces[activeIndex];
      if (space) {
        e.preventDefault();
        go(space.spaceId);
      }
      return;
    }
    const next = nextActiveIndex(e.key, activeIndex, spaces.length);
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

      {state.status === "ready" && spaces.length === 0 && <p className="inv-msg">{COPY.empty}</p>}

      {spaces.length > 0 && (
        <ul
          className="inv-list"
          role="listbox"
          tabIndex={0}
          aria-labelledby={`${baseId}-h`}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          {spaces.map((space, i) => (
            <SpaceRow
              key={space.spaceId}
              optionId={optionId(i)}
              row={inventoryRow(space)}
              selected={space.spaceId === selectedId}
              active={focused && i === activeIndex}
              onOpen={() => {
                setActive(i);
                go(space.spaceId);
              }}
            />
          ))}
        </ul>
      )}

      {pointer && (
        <button type="button" className="inv-invites" onClick={() => navigate({ destination: "notifications" }, COPY.openNotificationsFailed)}>
          {pointer}
        </button>
      )}

      <p className="inv-status" role="status">
        {list.announcement}
      </p>
    </section>
  );
}
