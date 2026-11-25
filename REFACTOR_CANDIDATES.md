# REFACTOR / FINDINGS — space-manager

Recorded by the 2026-06 code-verification pass (R3-124; plan `08-system-apps.md`).
**Record only — no symbol renamed in this pass.**

## RENAME-SM-1 — `Member.principal` → `grantee` — CLOSED

Closed, verified on 2026-11-25: no file under `src/` reads `.principal`. Member rows are
read through `grantee` (`src/lib/display.ts` `labelOf`, `src/components/legacy/ManageModal.tsx`),
on the SDK's `Member.grantee` field.

## Spec-refs (verified on 2026-11-25)

- `src/components/legacy/AuditView.tsx` is the capability audit view the UI_AS_APPS
  spec body calls "the audit view (§8.11)"; the § header/body mismatch is spec-side.
- `src/lib/display.ts` `decodeApp` decodes the appKey encoding (`enc(provider)__enc(namespace)__enc(repository)`).

## SDK-version skew — CLOSED

Closed, verified on 2026-11-25: `package.json` pins `@immediately-run/sdk` at the exact
version `0.73.0` (no caret), the first published version exporting `useSpacesMode` and
`navigateSpaces`.

## Vocabulary (Phase 2)

`role` (owner/writer/reader) is the FILE_SHARING grant-role, **not** a principal —
correct per core_concepts §11; left intact. No `kernel` in comments.
