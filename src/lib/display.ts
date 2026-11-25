// Display helpers shared by every region of this app. Owner-written fields (names,
// logins, avatar URLs) are untrusted: React escapes text children, so a name is safe as
// `{...}`, but a URL is not text and gets its own guard here.
import type { Member } from "@immediately-run/sdk";
import { COPY } from "../data/copy";

/** `user:<uid>` → `<uid>`. */
export const uidOf = (principal: string): string => principal.replace(/^user:/, "");

/** appKey = enc(provider)__enc(namespace)__enc(repository) → `namespace/repository`. */
export const decodeApp = (appKey: string): string => {
  try {
    const [, ns, repo] = appKey.split("__").map(decodeURIComponent);
    return ns && repo ? `${ns}/${repo}` : appKey;
  } catch {
    // A malformed percent-escape: show the raw key rather than nothing.
    return appKey;
  }
};

/** A member's handle, or a short id when the host resolved no login. */
export const labelOf = (m: Member): string =>
  m.login ? `@${m.login}` : `#${uidOf(m.grantee).split(":").slice(1).join(":") || uidOf(m.grantee)}`;

/** Accept only an `https:` avatar, so a crafted `javascript:` or `data:` value never reaches an `<img src>`. */
export const httpsAvatar = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

/** A space's name as shown, with the host's own fallback for an unnamed space. */
export const spaceName = (name: string | undefined): string => name ?? COPY.untitled;
