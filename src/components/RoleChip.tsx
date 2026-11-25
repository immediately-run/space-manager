// The reader's role and the space's kind, as one quiet line: `writer · shared`. Never a
// fill or a count; the Inbox dot is the only filled mark in the chrome.
export default function RoleChip({ roleLabel, modeLabel, id }: { roleLabel: string; modeLabel: string; id?: string }) {
  return (
    <span className="role-chip" id={id}>
      {roleLabel ? `${roleLabel} · ${modeLabel}` : modeLabel}
    </span>
  );
}
