// One option of the inventory listbox: the space's name (owner-written, rendered as text),
// the reader's role and personal or shared. The option is named by its name and that
// line only, so the Open pill is outside its accessible name; the pill repeats what
// selecting the option does, and the keyboard path is Enter on the option.
import type { InventoryRow } from "../lib/inventory";
import { COPY } from "../data/copy";
import RoleChip from "./RoleChip";

export default function SpaceRow({
  optionId,
  row,
  selected,
  active,
  onOpen,
}: {
  optionId: string;
  row: InventoryRow;
  selected: boolean;
  active: boolean;
  onOpen: () => void;
}) {
  const className = ["inv-row", selected && "is-selected", active && "is-active"]
    .filter((c): c is string => typeof c === "string")
    .join(" ");
  return (
    <li
      id={optionId}
      role="option"
      aria-selected={selected}
      aria-labelledby={`${optionId}-name ${optionId}-meta`}
      className={className}
      onClick={onOpen}
    >
      <span className="inv-row-main">
        <span className="inv-row-name" id={`${optionId}-name`}>
          {row.name}
        </span>
        <RoleChip id={`${optionId}-meta`} roleLabel={row.roleLabel} modeLabel={row.modeLabel} />
      </span>
      <button
        type="button"
        className="inv-row-open"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {COPY.open}
      </button>
    </li>
  );
}
