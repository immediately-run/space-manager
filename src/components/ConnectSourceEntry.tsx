// Connect a new source → Google Drive.
//
// Connect is not select, which is why this is its own entry rather than a row in the
// powerbox: `requestMount()` picks from sources the reader already has, and this sets one
// up (an incremental Google consent, a folder pick, an access choice). Every step is drawn
// by the host; this app supplies the scheme and nothing else, and never sees the reader's
// Drive, the granted scope or any of the wording. It sits beside the create door because
// connecting a source is creating one.
//
// Called through `protocolRequest` because the pinned SDK has no typed `connectSource`;
// the wire method is the contract either way.
import { useState } from "react";
import { useAuth } from "@immediately-run/sdk";
import { protocolRequest } from "@immediately-run/sdk/sandboxUtils";
import "./ConnectSourceEntry.css";

export default function ConnectSourceEntry({ onConnected }: { onConnected: () => void | Promise<void> }) {
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Connecting a source in the reader's account needs an account.
  if (status !== "signed-in") return null;

  const onConnect = async () => {
    setBusy(true);
    setErr(null);
    try {
      await protocolRequest("protocol-spaces", "connectSource", [{ scheme: "drive" }]);
      await onConnected();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // `cancelled` is the reader backing out of the host flow: calm, not an error.
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
    <span className="connect">
      <button type="button" className="btn-ghost" onClick={onConnect} disabled={busy} aria-busy={busy}>
        {busy ? "Connecting…" : "Connect Google Drive"}
      </button>
      {err && (
        <span className="connect-err" role="status">
          {err}
        </span>
      )}
    </span>
  );
}
