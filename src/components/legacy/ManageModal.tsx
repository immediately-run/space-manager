// Manage a space the reader owns: invite by handle (a pull-based invitation the recipient
// accepts, not a membership write), revoke a pending invitation, change a member's role,
// remove a member, and the one-way conversion to shared. The host resolves handles and
// keeps the owner-lockout invariant (a space always keeps an owner). Legacy: it renders
// only on the full-tab page.spaces surface until People and Settings take these verbs
// over and this directory goes.
import { useCallback, useEffect, useState } from "react";
import {
  getSpaceMembers,
  inviteToSpace,
  listPendingInvites,
  revokeInvite,
  setSpaceRole,
  unshareSpace,
  type Invite,
  type Member,
  type Role,
  type SpaceInfo,
} from "@immediately-run/sdk";
// `convertToShared` has no typed export in the pinned SDK; the wire method is the contract.
import { protocolRequest } from "@immediately-run/sdk/sandboxUtils";
import { httpsAvatar, labelOf, spaceName, uidOf } from "../../lib/display";
import { kindOf } from "../../lib/inventory";
import "./legacy.css";

const ROLES: Role[] = ["owner", "writer", "reader"];

export default function ManageModal({
  space,
  onClose,
  onSpacesChanged,
}: {
  space: SpaceInfo;
  onClose: () => void;
  /** R3-259 — the conversion changes the LIST badge, not just members. */
  onSpacesChanged?: () => void | Promise<void>;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [pending, setPending] = useState<Invite[]>([]);
  const [handle, setHandle] = useState("");
  const [addRole, setAddRole] = useState<Role>("writer");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // R3-259 — the Convert arm-then-confirm state (the same two-click shape the
  // contribute panel's reset uses). The IRREVERSIBILITY copy lives HERE, in the
  // manager, per the item; the wire additionally carries `confirm: true` as
  // belt-and-braces and the host owner-checks the verb.
  const [convertArmed, setConvertArmed] = useState(false);
  const [converting, setConverting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // Members (accepted) and pending invitations (offered, not yet accepted) are
      // disjoint surfaces — a pending invitee is NOT a member (§6.4), so we list
      // them separately and never double-list.
      const [m, p] = await Promise.all([
        getSpaceMembers(space.spaceId),
        listPendingInvites(space.spaceId).catch(() => [] as Invite[]),
      ]);
      setMembers(m);
      setPending(p);
    } catch {
      setErr("Couldn’t load members.");
    }
  }, [space.spaceId]);

  useEffect(() => {
    const run = async () => {
      await refresh();
    };
    void run();
  }, [refresh]);

  const ownerCount = (members ?? []).filter((m) => m.role === "owner").length;

  const onInvite = async () => {
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setBusy(true);
    setErr(null);
    try {
      // §6.4: create an INVITATION (not a membership). The offer shows under Pending
      // until the recipient accepts — refresh reflects it there, not under Members.
      await inviteToSpace(space.spaceId, h, addRole);
      setHandle("");
      await refresh();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setErr(
        code === "not-found"
          ? `No user “@${h}”.`
          : code === "forbidden"
            ? "Not allowed."
            : code === "quota-exceeded"
              ? "Too many pending invites."
              : "Couldn’t invite.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onRevokeInvite = async (inv: Invite) => {
    setRevoking(inv.uid);
    setErr(null);
    try {
      await revokeInvite(space.spaceId, inv.uid);
      await refresh();
    } catch {
      setErr("Couldn’t revoke the invite.");
    } finally {
      setRevoking(null);
    }
  };

  const onRole = async (m: Member, role: Role) => {
    setErr(null);
    try {
      await setSpaceRole(space.spaceId, uidOf(m.grantee), role);
      await refresh();
    } catch (e) {
      setErr((e as { code?: string })?.code === "owner-lockout" ? "A space must keep an owner." : "Couldn’t change role.");
    }
  };

  const onRemove = async (m: Member) => {
    setErr(null);
    try {
      await unshareSpace(space.spaceId, uidOf(m.grantee));
      await refresh();
    } catch (e) {
      setErr((e as { code?: string })?.code === "owner-lockout" ? "A space must keep an owner." : "Couldn’t remove.");
    }
  };

  // R3-259 — the deliberate one-way conversion. First click arms; the second (the
  // button that now says what it does) performs it. The verb rides the
  // `protocolRequest` seam, as `connectSource` does: the host gate holds
  // `spaces:admin` + the confirm literal, and the host checks ownership.
  const onConvert = async () => {
    if (!convertArmed) {
      setConvertArmed(true);
      return;
    }
    setConverting(true);
    setErr(null);
    try {
      await protocolRequest("protocol-spaces", "convertToShared", [{ spaceId: space.spaceId, confirm: true }]);
      setConvertArmed(false);
      await Promise.all([refresh(), onSpacesChanged?.()]);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setErr(code === "forbidden" ? "Only the owner can convert this space." : "Couldn’t convert the space.");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Manage space">
        <button type="button" className="sm-x" onClick={onClose} aria-label="Close">×</button>
        <h2 className="sm-modal-title">Share “{spaceName(space.name)}”</h2>

        {/* R3-259 — the named, one-way conversion. Offered only where it is real:
            the owner's view of a space whose derived kind is still personal (the
            host's derivation — a latched space never shows it). */}
        {space.role === "owner" && kindOf(space) === "personal" && (
          <div className="sm-convert">
            {convertArmed ? (
              <p className="sm-convert-note">
                Converting <strong>{space.name ?? "this space"}</strong> to shared cannot be undone. Apps and agents
                will treat it more cautiously, because more than one person can change what is in it.
              </p>
            ) : (
              <p className="sm-convert-note">
                This is a personal space — only you can change it. You can convert it to shared if others will work in
                it too.
              </p>
            )}
            <button
              type="button"
              className={convertArmed ? "sm-convert-confirm" : "sm-convert-btn"}
              disabled={converting}
              onClick={() => void onConvert()}
            >
              {converting ? "Converting…" : convertArmed ? "Convert to shared — cannot be undone" : "Convert to shared…"}
            </button>
          </div>
        )}

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
            {busy ? "Inviting…" : "Invite"}
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
                <div key={m.grantee} className="sm-member">
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

        {pending.length > 0 && (
          <div className="sm-pending">
            <h3 className="sm-pending-h">Pending invites</h3>
            {pending.map((inv) => (
              <div key={inv.uid} className="sm-member">
                {httpsAvatar(inv.avatarUrl) ? (
                  <img className="sm-av" src={httpsAvatar(inv.avatarUrl)} alt="" />
                ) : (
                  <span className="sm-av sm-av-ph" />
                )}
                <span className="sm-member-name">{inv.login ? `@${inv.login}` : `#${inv.uid}`}</span>
                <span className="sm-role" data-role={inv.role}>{inv.role}</span>
                <button
                  type="button"
                  className="sm-remove"
                  disabled={revoking === inv.uid}
                  onClick={() => onRevokeInvite(inv)}
                >
                  {revoking === inv.uid ? "…" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
