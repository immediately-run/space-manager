// The space manager (UI_AS_APPS_SPEC §5.2). Lists the user's spaces (spaces:user),
// surfaces the user's live Invitations inbox (Accept/Decline — FILE_SHARING §6.4/§9.8),
// and, for owned spaces, manages sharing (spaces:admin): INVITE a user by provider
// handle (a pull-based invitation, NOT an immediate membership write — the recipient
// accepts), revoke a pending invite, change a member's role, remove a member. The host
// resolves handles and enforces the owner-lockout invariant (a space always keeps an
// owner) — this app just drives the flow and shows the result.
import { useCallback, useEffect, useRef, useState } from "react";
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
  useTaskInput,
  type SpaceInfo,
  type Member,
  type Invite,
  type Role,
  type GrantRecord,
} from "@immediately-run/sdk";
// The wire-level escape hatch, from the SDK's own subpath. `connectSource` is not on
// the pinned typed surface yet (R3-206 adds the host verb; the SDK export follows on
// its next release), and `protocolRequest` is exactly the seam for that gap — the
// method name is the contract either way.
import { protocolRequest } from "@immediately-run/sdk/sandboxUtils";
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
  // PRINCIPALS §9 B3 / R3-96: the narrow `panel.spaces` rail is browse/open/mount-only
  // and holds `spaces:user` but NOT `spaces:admin` (see site-main `registry/defaults.ts`).
  // So the admin surfaces below — the per-space "Manage" modal (invite/role/remove) and
  // the grant AuditView, all `spaces:admin`-gated host-side — are rendered ONLY on the
  // non-panel surface (`page.spaces` full tab). In the rail they'd only fire `forbidden`,
  // and the exit criterion is "the rail exposes no admin verb." Browse (list spaces,
  // `spaces:user`) and the invitee-side Invitations inbox (accept/decline own invites,
  // also `spaces:user`) stay in both surfaces.
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

  // R3-269 D4: the host's `open-space` boot hint — `/spaces?space=<id>` (the file
  // explorer's "Manage sharing →" deep link) auto-opens the Manage modal AT that
  // space. Untrusted display/navigation data: it is only ever MATCHED against the
  // spaces this user actually has (and only where the admin surface renders — the
  // full tab, on an owned space). Consumed once, so closing the modal stays closed.
  const taskInput = useTaskInput();
  const hintConsumed = useRef(false);
  useEffect(() => {
    if (hintConsumed.current || !fullTab || !spaces) return;
    if (taskInput?.task !== "open-space") return;
    const spaceId = taskInput.params?.spaceId;
    if (typeof spaceId !== "string") return;
    hintConsumed.current = true;
    const target = spaces.find((s) => s.spaceId === spaceId);
    // Deferred so the selection isn't a synchronous set-state inside the effect
    // (react-hooks/set-state-in-effect); the ref above makes it one-shot.
    if (target && target.role === "owner") queueMicrotask(() => setSelected(target));
  }, [fullTab, spaces, taskInput]);

  return (
    <div className={fullTab ? "sm sm-full" : "sm"}>
      <header className="sm-hd">
        <span className="sm-title">Spaces</span>
        {fullTab && (
          <span className="sm-create">
            <ConnectSourceEntry onConnected={loadSpaces} />
            <CreateSpaceEntry onCreated={loadSpaces} />
          </span>
        )}
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
                {/* R3-259 — only SHARED is badged: personal is the unmarked default
                    (the same "absence is the quiet case" rule the publisher badge
                    uses), and the kind shown is the host's DERIVED one. */}
                {kindOf(s) === "shared" && (
                  <span className="sm-kind" data-kind="shared">
                    shared
                  </span>
                )}
                <span className="sm-role" data-role={s.role}>{s.role}</span>
              </div>
              {fullTab && s.role === "owner" && (
                <button type="button" className="sm-manage" onClick={() => setSelected(s)}>
                  Manage
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {fullTab && selected && (
        <ManageModal space={selected} onClose={() => setSelected(null)} onSpacesChanged={loadSpaces} />
      )}
      {fullTab && <AuditView />}
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
//
// R3-259 — the create-time KIND. Personal (default) is the safe,
// reversible-until-converted state; Shared is shared from the first byte (the host
// latches it at birth). The wire param is additive (the pinned typed wrapper passes
// opts straight through — the cast is the local widening until the SDK export
// catches up; the HOST validates the literal either way).
type CreateKind = "personal" | "shared";

function CreateSpaceEntry({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<CreateKind>("personal");

  // Until the host reports auth, render nothing rather than a button that can't work.
  if (status !== "signed-in") return null;

  const onCreate = async () => {
    setBusy(true);
    setErr(null);
    try {
      // The wire param is additive (the pinned typed wrapper passes opts straight
      // through — the double cast is the local widening until the SDK export
      // catches up; the HOST validates the literal either way).
      await createSpace({ kind } as unknown as Parameters<typeof createSpace>[0]);
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
    <>
      <div className="sm-create-kind" role="radiogroup" aria-label="Space kind">
        <label>
          <input
            type="radio"
            name="sm-create-kind"
            checked={kind === "personal"}
            onChange={() => setKind("personal")}
          />
          Personal
        </label>
        <label>
          <input
            type="radio"
            name="sm-create-kind"
            checked={kind === "shared"}
            onChange={() => setKind("shared")}
          />
          Shared
        </label>
        {kind === "shared" && (
          <span className="sm-create-note">More than one person will be able to change it.</span>
        )}
      </div>
      <button type="button" className="sm-add" onClick={onCreate} disabled={busy}>
        {busy ? "Creating…" : "Create a space"}
      </button>
      {err && <span className="sm-err">{err}</span>}
    </>
  );
}

// R3-259 — the DERIVED kind the host lists (`SpaceInfo` gains `kind` on the wire;
// read defensively so the pinned SDK type doesn't gate the badge).
const kindOf = (s: SpaceInfo): CreateKind | undefined => (s as { kind?: CreateKind }).kind;

// R3-206 / SPACES_UI_SPEC §4–§5 (R-SPACES-6) — "Connect a new source → Google Drive".
//
// CONNECT IS NOT SELECT, and that is why this is a second entry point rather than a
// row in the powerbox. `requestMount()` picks from sources the user ALREADY has;
// this SETS ONE UP — an incremental Google consent, a folder pick, an access choice.
// Putting a provider OAuth flow inside the powerbox would mean the picker sometimes
// navigates the whole page to Google, which is exactly what §8.2 rules out.
//
// Every step is drawn by the HOST: the scope request, the folder browser, the ro|rw
// choice and the single-writer disclosure. This app supplies the SCHEME and nothing
// else — it never sees the user's Drive, the granted scope, or any of the wording.
// That is the same discipline as `createSpace()` above: drive the flow, reflect the
// result, paint no authorization chrome.
//
// Called through `protocolRequest` rather than a typed SDK verb because the SDK's
// pinned surface has no `connectSource` yet; the wire method is the contract either
// way, and swapping to the typed export when it ships is a one-line change.
function ConnectSourceEntry({ onConnected }: { onConnected: () => void | Promise<void> }) {
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Connecting a source in the user's account needs an account.
  if (status !== "signed-in") return null;

  const onConnect = async () => {
    setBusy(true);
    setErr(null);
    try {
      await protocolRequest("protocol-spaces", "connectSource", [{ scheme: "drive" }]);
      await onConnected();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // `cancelled` is the user backing out of the host flow — calm, not an error.
      if (code === "cancelled") return;
      setErr(
        code === "auth-required"
          ? "Sign in to connect a source."
          : code === "unsupported-scheme"
            ? "Google Drive isn’t available on this deployment."
            : code === "google_reauth_required"
              ? "Reconnect Google in Settings → Connections, then try again."
              : "Couldn’t connect that source.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="sm-manage" onClick={onConnect} disabled={busy}>
        {busy ? "Connecting…" : "Connect Google Drive"}
      </button>
      {err && <span className="sm-err">{err}</span>}
    </>
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

function ManageModal({
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
  // `protocolRequest` seam like `connectSource` above: the host gate holds
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
        <h2 className="sm-modal-title">Share “{space.name ?? "Untitled space"}”</h2>

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
