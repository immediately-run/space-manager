# space-manager

The **space manager** as an [immediately.run](https://immediately.run) app
(UI_AS_APPS_SPEC §5.2), and the app of the spaces mode. One app bound at several
regions, each rendering its own component (`src/App.tsx`):

| Region | Component |
|---|---|
| `panel.spaces.inventory` (and `null`, plain `vite dev`) | `src/regions/Inventory.tsx` — the Spaces activity's list of your spaces |
| `mainpane.spaces.launcher` | `src/regions/Launcher.tsx` — with nothing selected, Create a space |
| `panel.spaces` | `src/regions/PanelSpaces.tsx` — the narrow list and the Invitations inbox |
| `page.spaces` | `src/regions/PanelSpaces.tsx`, full tab — plus Manage (invite, roles, remove) and the grant audit |

Elevated capabilities: `spaces:user` (enumerate all the user's spaces) +
`spaces:admin` (membership mutations). The host resolves handles (the identity
lookup token never reaches this app) and enforces the **owner-lockout** invariant —
a space can never be left without an owner (threat T41). This app just drives the
flow and renders the result.

## Develop

```sh
npm install
npm run dev      # standalone (host owns the real protocol, so writes no-op offline)
npm run build
npm run verify   # lint + test + build: the gate
```

Pop the hood: fork it, rebind one of those regions to your fork, and that
surface becomes yours.
