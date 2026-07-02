// The space manager (UI_AS_APPS_SPEC §5.2). Lists the user's spaces (spaces:user),
// surfaces the user's live Invitations inbox (Accept/Decline — FILE_SHARING §6.4/§9.8),
// and, for owned spaces, manages sharing (spaces:admin): INVITE a user by provider
// handle (a pull-based invitation, NOT an immediate membership write — the recipient
// accepts), revoke a pending invite, change a member's role, remove a member. The host
// resolves handles and enforces the owner-lockout invariant (a space always keeps an
// owner) — this app just drives the flow and shows the result.
import { useCallback, useEffect, useState } from "react";
import {
  listAllSpaces,
  getSpaceMembers,
  inviteToSpace,
  listPendingInvites,
  revokeInvite,
  useInvites,
  acceptInvite,
  declineInvite,
  unshareSpace,
  setSpaceRole,
  listGrants,
  revokeGrant,
  createSpace,
  useAuth,
  useRegion,
  type SpaceInfo,
  type Member,
  type Invite,
  type Role,
  type GrantRecord,
} from "@immediately-run/sdk";
import "./SpaceManager.css";

const ROLES: Role[] = ["owner", "writer", "reader"];

const uidOf = (principal: string): string => principal.replace(/^user:/, "");

// appKey = enc(provider)__enc(namespace)__enc(repository) (§spaceId.ts).
const decodeApp = (appKey: string): string => {
  try {
    const [, ns, repo] = appKey.split("__").map(decodeURIComponent);
    return ns && repo ? `${ns}/${repo}` : appKey;
  } catch {
    return appKey;
  }
};
const labelOf = (m: Member): string => (m.login ? `@${m.login}` : `#${uidOf(m.grantee).split(":").slice(1).join(":") || uidOf(m.grantee)}`);

// Owner-written display fields (login/name/avatarUrl on invites + members) are
// UNTRUSTED (FILE_SHARING §3/§6.4). React escapes text children, so name/handle are
// safe as `{...}`; an avatarUrl, however, becomes a URL — accept only `https:` so a
// crafted `javascript:`/`data:` value can never reach an `<img src>`.
const httpsAvatar = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

export default function SpaceManager() {
  const [spaces, setSpaces] = useState<SpaceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpaceInfo | null>(null);
  // SPACES_UI_SPEC §5 / R-SPACES-7: this app renders in two surfaces. The narrow
  // `panel.spaces` column inside the workbench, and — at its own deep-linkable route
  // (`/spaces`) — a standalone full-tab surface bound as `page.spaces`. Any region
  // that is not the narrow panel (the full-tab binding, a fork, or `null` for plain
  // `vite dev`) gets the roomier full-screen layout.
  const region = useRegion();
  const fullTab = region !== "panel.spaces";

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
    const run = async () => {
      await loadSpaces();
    };
    void run();
  }, [loadSpaces]);

  return (
    <div className={fullTab ? "sm sm-full" : "sm"}>
      <header className="sm-hd">
        <span className="sm-title">Spaces</span>
        {fullTab && <CreateSpaceEntry onCreated={loadSpaces} />}
      </header>
      {error && <div className="sm-msg">{error}</div>}
      <InvitationsInbox onAccepted={loadSpaces} />
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
      <AuditView />
    </div>
  );
}

// FILE_SHARING §6.4/§9.8 Invitations inbox: the invitee's pull-based accept surface.
// A pending invite confers NO access — the user opts in here. The list is LIVE via
// `useInvites()` (the host pushes the inbox on the `spaces:user` channel), so an
// arriving/accepted/declined invite reflects within one snapshot — no reload. Accept
// materializes membership; the accepted space then appears once we refresh the spaces
// list (spaces aren't live-pushed to the app), while the invite leaves the inbox on
// its own via the live channel. All owner-written fields are escaped as text (React
// children) — never `dangerouslySetInnerHTML`, and an avatar only if it is `https:`.
function InvitationsInbox({ onAccepted }: { onAccepted: () => void | Promise<void> }) {
  const invites = useInvites();
  const [busy, setBusy] = useState<string | null>(null);

  const onAccept = async (inv: Invite) => {
    setBusy(inv.spaceId);
    try {
      await acceptInvite(inv.spaceId);
      // The invite leaves the inbox via the live channel; refresh the spaces list so
      // the newly-accepted space appears in the same interaction (§6.4).
      await onAccepted();
    } catch {
      /* leave the row; the user can retry */
    } finally {
      setBusy(null);
    }
  };

  const onDecline = async (inv: Invite) => {
    setBusy(inv.spaceId);
    try {
      await declineInvite(inv.spaceId);
      // The row leaves the inbox via the live channel.
    } catch {
      /* leave the row */
    } finally {
      setBusy(null);
    }
  };

  if (invites.length === 0) return null;

  return (
    <section className="sm-invites" aria-label="Invitations">
      <h3 className="sm-invites-h">Invitations</h3>
      <ul className="sm-invite-list">
        {invites.map((inv) => {
          const avatar = httpsAvatar(inv.avatarUrl);
          return (
            <li key={inv.spaceId} className="sm-invite-row">
              {avatar ? <img className="sm-av" src={avatar} alt="" /> : <span className="sm-av sm-av-ph" />}
              <span className="sm-invite-text">
                {inv.invitedBy} invited you to{" "}
                <span className="sm-name">{inv.name ?? "Untitled space"}</span> as {inv.role}
              </span>
              <button
                type="button"
                className="sm-accept"
                disabled={busy === inv.spaceId}
                onClick={() => onAccept(inv)}
              >
                {busy === inv.spaceId ? "…" : "Accept"}
              </button>
              <button
                type="button"
                className="sm-remove"
                disabled={busy === inv.spaceId}
                onClick={() => onDecline(inv)}
              >
                Decline
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// SPACES_UI_SPEC §5 (R-SPACES-7) "create a space" entry — only on the full-tab
// surface (the in-workbench modal is the other entry point). It drives the SAME host
// `createSpace()` consent path (FILE_SHARING §6/§9.3): the host owns the quota gate,
// the first-create-per-app consent, and the write ordering. This app does NOT paint
// any authorization chrome — it just calls `createSpace()` and reflects the result.
// Gated on signed-in: creating storage in the user's account needs an account.
function CreateSpaceEntry({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Until the host reports auth, render nothing rather than a button that can't work.
  if (status !== "signed-in") return null;

  const onCreate = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createSpace();
      await onCreated();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // `cancelled` is the user dismissing the host consent — calm, not an error.
      if (code === "cancelled") return;
      setErr(code === "quota-exceeded" ? "Space limit reached." : "Couldn’t create a space.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="sm-create">
      <button type="button" className="sm-add" onClick={onCreate} disabled={busy}>
        {busy ? "Creating…" : "Create a space"}
      </button>
      {err && <span className="sm-err">{err}</span>}
    </span>
  );
}

// §8.11 capability audit view: which apps hold which mount grants, with one-click
// revoke (durable + best-effort live teardown, host-side).
function AuditView() {
  const [grants, setGrants] = useState<GrantRecord[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGrants(await listGrants());
    } catch {
      setGrants([]);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    void run();
  }, [load]);

  const onRevoke = async (g: GrantRecord) => {
    const key = g.appKey + g.spaceId;
    setBusy(key);
    try {
      await revokeGrant(g.appKey, g.spaceId);
      await load();
    } catch {
      /* leave the row; the user can retry */
    } finally {
      setBusy(null);
    }
  };

  if (!grants || grants.length === 0) return null;

  // Group by app for a readable "this app can reach these spaces" view.
  const byApp = new Map<string, GrantRecord[]>();
  for (const g of grants) byApp.set(g.appKey, [...(byApp.get(g.appKey) ?? []), g]);

  return (
    <section className="sm-audit">
      <h3 className="sm-audit-h">App access</h3>
      {[...byApp.entries()].map(([appKey, list]) => (
        <div key={appKey} className="sm-audit-app">
          <div className="sm-audit-name">{decodeApp(appKey)}</div>
          <ul className="sm-audit-grants">
            {list.map((g) => (
              <li key={g.spaceId} className="sm-audit-grant">
                <span className="sm-audit-space">{g.name ?? g.spaceId.slice(0, 8)}</span>
                <span className="sm-audit-scope">
                  {g.mode === "ro" ? "read-only" : "read-write"}
                  {g.subtree ? ` · ${g.subtree}` : ""}
                </span>
                <button
                  type="button"
                  className="sm-remove"
                  disabled={busy === g.appKey + g.spaceId}
                  onClick={() => onRevoke(g)}
                >
                  {busy === g.appKey + g.spaceId ? "…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ManageModal({ space, onClose }: { space: SpaceInfo; onClose: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [pending, setPending] = useState<Invite[]>([]);
  const [handle, setHandle] = useState("");
  const [addRole, setAddRole] = useState<Role>("writer");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
