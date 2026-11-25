// Every user-facing string the spaces mode's inventory renders, in one place. The
// sentences come from the Spaces brief's copy section; a component imports them and
// never spells them again.

export const COPY = {
  eyebrow: "/SPACES",
  heading: "Your spaces.",
  untitled: "Untitled space",

  // The inventory's states.
  empty: "You are not in any space yet. Create one, or wait for an invitation to reach your notifications.",
  listRefused: "This version cannot list your spaces.",
  listFailed: "Couldn’t load spaces.",
  openFailed: "Couldn’t open that space.",

  // The main pane with nothing selected.
  pickASpace: "Pick a space to see its files.",

  // Row labels.
  open: "Open",
  personal: "personal",
  shared: "shared",
  creatingRow: "creating…",

  // The create door.
  create: "Create a space",
  creating: "Creating…",
  created: "Space created.",
  createFailed: "Couldn’t create a space.",
  createQuota: "Space limit reached.",
  kindGroup: "Space kind",
  kindPersonal: "Personal",
  kindShared: "Shared",
  sharedNote: "More than one person will be able to change it.",

  // The narrow panel and the full-tab page (panel.spaces, page.spaces).
  panelTitle: "Spaces",
  panelEmpty: "No spaces yet. Apps create them on demand.",
  panelSignIn: "Sign in to manage your spaces.",
  loading: "Loading…",
} as const;
