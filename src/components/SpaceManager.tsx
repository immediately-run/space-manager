// The space manager (UI_AS_APPS_SPEC §5.2). Lists the user's spaces (spaces:user)
// and, for owned spaces, manages membership (spaces:admin): invite by provider
// handle, change a member's role, remove a member. The host resolves handles and
// enforces the owner-lockout invariant (a space always keeps an owner) — this app
// just drives the flow and shows the result.
import { useCallback, useEffect, useState } from "react";
import {
  listAllSpaces,
  getSpaceMembers,
  shareSpace,
  unshareSpace,
  setSpaceRole,
  type SpaceInfo,
  type Member,
  type Role,
} from "@immediately-run/sdk";
import "./SpaceManager.css";

const ROLES: Role[] = ["owner", "writer", "reader"];

const uidOf = (principal: string): string => principal.replace(/^user:/, "");
const labelOf = (m: Member): string => (m.login ? `@${m.login}` : `#${uidOf(m.principal).split(":").slice(1).join(":") || uidOf(m.principal)}`);

export default function SpaceManager() {
  const [spaces, setSpaces] = useState<SpaceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpaceInfo | null>(null);

  const loadSpaces = useCallback(async () => {
    setError(null);
    try {
      setSpaces(await listAllSpaces());
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === "auth-required" ? "Sign in to manage your spaces." : "Couldn’t load spaces.");
      setSpaces([]);
    }
  }, []);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  return (
    <div className="sm">
      <header className="sm-hd">
        <span className="sm-title">Spaces</span>
      </header>
      {error && <div className="sm-msg">{error}</div>}
      {spaces === null ? (
        <div className="sm-msg">Loading…</div>
      ) : spaces.length === 0 && !error ? (
        <div className="sm-msg">No spaces yet. Apps create them on demand.</div>
      ) : (
        <ul className="sm-list">
          {spaces.map((s) => (
            <li key={s.spaceId} className="sm-row">
              <div className="sm-row-main">
                <span className="sm-name">{s.name ?? "Untitled space"}</span>
                <span className="sm-role" data-role={s.role}>{s.role}</span>
              </div>
              {s.role === "owner" && (
                <button type="button" className="sm-manage" onClick={() => setSelected(s)}>
                  Manage
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {selected && <ManageModal space={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ManageModal({ space, onClose }: { space: SpaceInfo; onClose: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [handle, setHandle] = useState("");
  const [addRole, setAddRole] = useState<Role>("writer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMembers(await getSpaceMembers(space.spaceId));
    } catch {
      setErr("Couldn’t load members.");
    }
  }, [space.spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ownerCount = (members ?? []).filter((m) => m.role === "owner").length;

  const onInvite = async () => {
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setBusy(true);
    setErr(null);
    try {
      await shareSpace(space.spaceId, h, addRole);
      setHandle("");
      await refresh();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setErr(code === "not_found" ? `No user “@${h}”.` : code === "forbidden" ? "Not allowed." : "Couldn’t invite.");
    } finally {
      setBusy(false);
    }
  };

  const onRole = async (m: Member, role: Role) => {
    setErr(null);
    try {
      await setSpaceRole(space.spaceId, uidOf(m.principal), role);
      await refresh();
    } catch (e) {
      setErr((e as { code?: string })?.code === "owner-lockout" ? "A space must keep an owner." : "Couldn’t change role.");
    }
  };

  const onRemove = async (m: Member) => {
    setErr(null);
    try {
      await unshareSpace(space.spaceId, uidOf(m.principal));
      await refresh();
    } catch (e) {
      setErr((e as { code?: string })?.code === "owner-lockout" ? "A space must keep an owner." : "Couldn’t remove.");
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Manage space">
        <button type="button" className="sm-x" onClick={onClose} aria-label="Close">×</button>
        <h2 className="sm-modal-title">Share “{space.name ?? "Untitled space"}”</h2>

        <div className="sm-invite">
          <input
            className="sm-input"
            placeholder="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && onInvite()}
            disabled={busy}
          />
          <select className="sm-select" value={addRole} onChange={(e) => setAddRole(e.target.value as Role)} disabled={busy}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="button" className="sm-add" onClick={onInvite} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {err && <div className="sm-err">{err}</div>}

        <div className="sm-members">
          {members === null ? (
            <div className="sm-msg">Loading members…</div>
          ) : (
            members.map((m) => {
              const lastOwner = m.role === "owner" && ownerCount <= 1;
              return (
                <div key={m.principal} className="sm-member">
                  {m.avatarUrl ? <img className="sm-av" src={m.avatarUrl} alt="" /> : <span className="sm-av sm-av-ph" />}
                  <span className="sm-member-name">{labelOf(m)}</span>
                  <select
                    className="sm-select"
                    value={m.role}
                    disabled={lastOwner}
                    title={lastOwner ? "A space must keep an owner" : undefined}
                    onChange={(e) => onRole(m, e.target.value as Role)}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="button" className="sm-remove" disabled={lastOwner} onClick={() => onRemove(m)}>
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
