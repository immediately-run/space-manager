# space-manager

The **space manager** as an [immediately.run](https://immediately.run) app
(UI_AS_APPS_SPEC §5.2). Lists the user's spaces and, for spaces they own, manages
membership: invite by provider handle, change a member's role, remove a member.

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
```

Pop the hood: fork it, rebind the `panel.spaces` region to your fork, and the
Spaces panel becomes yours.
