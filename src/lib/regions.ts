// The regions this app is bound at, and which view each one renders. The host names the
// region; this is the one place the app spells those names.

export const REGION = {
  inventory: "panel.spaces.inventory",
  launcher: "mainpane.spaces.launcher",
  panel: "panel.spaces",
  page: "page.spaces",
} as const;

export type RegionView = "inventory" | "launcher" | "panel" | "page";

/**
 * The view for a region. `null` (plain `vite dev`, or a host that does not report the
 * region) and any region this app does not know render the inventory.
 */
export function viewForRegion(region: string | null): RegionView {
  switch (region) {
    case REGION.launcher:
      return "launcher";
    case REGION.panel:
      return "panel";
    case REGION.page:
      return "page";
    default:
      return "inventory";
  }
}
