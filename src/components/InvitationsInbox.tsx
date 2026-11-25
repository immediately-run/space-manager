// The invitee's Invitations inbox: a pending invitation confers no access, and the reader
// opts in here. The list is live through `useInvites()` (the host pushes the inbox), so an
// arriving, accepted or declined invitation shows within one push and no reload. Accepting
// creates the membership; the accepted space then appears once the caller refreshes its
// spaces list, since spaces are not pushed. Owner-written fields render as text, and an
// avatar only when it is `https:`.
//
// The notifications detail composes the `panel.spaces` region for invitation kinds, which
// is why this view lives on in that region while the spaces mode's inventory only points
// at notifications.
import { useState } from "react";
import { acceptInvite, declineInvite, useInvites, type Invite } from "@immediately-run/sdk";
import { httpsAvatar, spaceName } from "../lib/display";

export default function InvitationsInbox({ onAccepted }: { onAccepted: () => void | Promise<void> }) {
  const invites = useInvites();
  const [busy, setBusy] = useState<string | null>(null);

  const onAccept = async (inv: Invite) => {
    setBusy(inv.spaceId);
    try {
      await acceptInvite(inv.spaceId);
      // The invitation leaves the inbox through the live channel; refresh the spaces
      // list so the accepted space appears in the same interaction.
      await onAccepted();
    } catch {
      /* leave the row; the reader can retry */
    } finally {
      setBusy(null);
    }
  };

  const onDecline = async (inv: Invite) => {
    setBusy(inv.spaceId);
    try {
      await declineInvite(inv.spaceId);
      // The row leaves the inbox through the live channel.
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
                {inv.invitedBy} invited you to <span className="sm-name">{spaceName(inv.name)}</span> as {inv.role}
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
