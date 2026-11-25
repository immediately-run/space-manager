// The grant audit: which apps hold which mount grants, with one-click revoke (durable,
// plus a best-effort live teardown, host-side). Legacy: it renders only on the full-tab
// page.spaces surface until Settings takes the audit over and this directory goes.
import { useCallback, useEffect, useState } from "react";
import { listGrants, revokeGrant, type GrantRecord } from "@immediately-run/sdk";
import { decodeApp } from "../../lib/display";
import "./legacy.css";

export default function AuditView() {
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
