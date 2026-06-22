# REFACTOR / FINDINGS — space-manager

Recorded by the 2026-06 code-verification pass (R3-124; plan `08-system-apps.md`).
**Record only — no symbol renamed in this pass.**

## RENAME-SM-1 (load-bearing, coordinated) — `Member.principal` → `grantee`

`src/components/SpaceManager.tsx` reads `m.principal` (and a `principal` param in
`uidOf`) at lines ~24, 35, 199, 209, 247. The `Member.principal` field is a
**grantee** (a space member, `user:<uid>`), **not** the authority-context
Principal (core_concepts §4 reserved-word note; SPEC_CODE_DEBT §7.1). This is the
**consumer side** of the SDK's `Member.principal` → `grantee` rename.

- **Type origin:** `Member` is imported from `@immediately-run/sdk` — the field
  rename must land in the SDK first (filed as `02-sdk.md` RENAME-1).
- **Blast radius (this repo):** every `m.principal` read above + the `uidOf`
  parameter name. spaces-panel and file-commander were re-grepped — neither reads
  `.principal`, so this is the only consumer app affected.
- **Gate:** part of the overview §6 **shared cross-repo `principal`→`grantee`
  track** (SDK type + Firestore `spaces/{id}/members/{principal}` + site-main +
  sandbox). **Do NOT land piecemeal** — this app's edit ships with the SDK + host
  halves; per-repo gate is `npm run build && npm run lint` once the SDK type lands.

## Spec-refs (Phase 1 — verified current)

- `SpaceManager.tsx:1` / `App.tsx:2` cite `UI_AS_APPS_SPEC §5.2` (Spaces
  management) — **current**.
- `SpaceManager.tsx:90` cites `§8.11` for the capability audit view (which apps
  hold which mount grants + revoke). The UI_AS_APPS §8.11 *header* reads "Prior art
  & positioning", BUT the spec **body** repeatedly refers to "the audit view
  (§8.11)" (e.g. lines 460, 525, 1388, 1697, 1908). The code's `§8.11` therefore
  matches how the spec cross-references the audit view — **left as-is**; the §
  header/body mismatch is a **spec-side** issue → see DOCS DELTA in the pass report,
  not a code fix.
- `SpaceManager.tsx:26` cites `§spaceId.ts` for the appKey encoding — an
  intra-repo helper pointer, fine.

## SDK-version skew (record only)

Pins `@immediately-run/sdk` at **`0.2.8`** (oldest fleet tier). Coordinated bump
owed; do not bump here.

## Vocabulary (Phase 2)

`role` (owner/writer/reader) is the FILE_SHARING grant-role, **not** a principal —
correct per core_concepts §11; left intact. No `kernel` in comments.
