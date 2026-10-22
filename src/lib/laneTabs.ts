import type { HerdrPane, SessionSnapshot } from "../../shared/protocol.ts";

/** Build tabs per pane (PropelX lane tabs). A pane labelled "x1" in workspace "Brain / HQ" gets a
 *  Chrome-style tab strip in its header: the pane itself first, then each tab of the workspace
 *  "Brain / HQ · x1" (made by `desk-herdr lanes` / `desk-herdr tab`). Clicking a tab shows that tab's
 *  terminal in the pane's body, in place; herdr's own layout is not changed. "<lane>·start" shell
 *  tabs only keep the workspace alive and are not shown. */
export const LANE_TAB_SEPARATOR = " · ";
export const MAX_LANE_BUILDS = 8;

export interface LaneTab { key: string; label: string; paneId: string; tabId: string | null; home: boolean }
export interface LaneTabs { workspaceId: string; tabs: LaneTab[]; builds: number }

export function laneWorkspaceLabel(snapshot: SessionSnapshot, pane: HerdrPane): string | null {
  const lane = pane.label?.trim();
  if (!lane) return null;
  const ws = snapshot.workspaces.find((item) => item.workspace_id === pane.workspace_id);
  return ws ? `${ws.label}${LANE_TAB_SEPARATOR}${lane}` : null;
}

export function laneTabs(snapshot: SessionSnapshot | null, pane: HerdrPane): LaneTabs | null {
  if (!snapshot) return null;
  const label = laneWorkspaceLabel(snapshot, pane);
  const ws = label ? snapshot.workspaces.find((item) => item.label === label) : undefined;
  if (!ws) return null;
  const home: LaneTab = { key: pane.pane_id, label: pane.label?.trim() || pane.pane_id, paneId: pane.pane_id, tabId: null, home: true };
  const builds = snapshot.tabs
    .filter((tab) => tab.workspace_id === ws.workspace_id && !tab.label.endsWith("·start"))
    .sort((a, b) => a.number - b.number)
    .flatMap((tab): LaneTab[] => {
      const layout = snapshot.layouts.find((item) => item.tab_id === tab.tab_id);
      const first = snapshot.panes.find((item) => item.pane_id === layout?.focused_pane_id)
        ?? snapshot.panes.find((item) => item.tab_id === tab.tab_id);
      if (!first) return [];
      const lane = pane.label?.trim() ?? "";
      const short = tab.label.startsWith(`${lane}·`) ? tab.label.slice(lane.length + 1) : tab.label;
      return [{ key: tab.tab_id, label: short || tab.tab_id, paneId: first.pane_id, tabId: tab.tab_id, home: false }];
    });
  return { workspaceId: ws.workspace_id, tabs: [home, ...builds], builds: builds.length };
}

const STORE = "herdr-web-ui.lane-tabs";

export function loadLaneSelection(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, string>; } catch { return {}; }
}

export function saveLaneSelection(value: Record<string, string>): void {
  try { localStorage.setItem(STORE, JSON.stringify(value)); } catch { /* private window: keep it in memory */ }
}
