# DEVLOG: PropelX fork of herdr-web-ui

Fork of `devswha/herdr-web-ui` at v0.4.12, branch `lane-tabs`, kept by pinned tag. Upstream code is
unchanged except the rows below. Owner: Tom Herbert (tomherbert202); used on px-server-urbn-1.

| When (Melbourne) | Where | Change | Undo |
|---|---|---|---|
| 2026-10-23 10:00 | `src/lib/laneTabs.ts` (new), `src/components/PaneCanvas.tsx`, `PaneCanvas.css` | Lane tabs (Tom, 23 Oct 2026, brain `tasks/261023-herdr-build-lanes-get-tabs-x1` R2): a pane labelled x1 in workspace "Brain / HQ" shows a Chrome-style tab strip in its header: the lane itself, then each tab of workspace "Brain / HQ · x1" (made by propelx-desks `desk-herdr tab`), "·start" tabs hidden. A click shows that tab's terminal in the pane body, in place (browser state only, saved in localStorage; herdr's layout unchanged). `+` asks for a name and opens a Claude tab in the lane workspace (max 8 builds); `x` closes a build tab after a confirm. Typecheck, conventions test and build pass; browser-tested on a second server (port 7799) with Playwright. | `herdr plugin install devswha/herdr-web-ui --ref v0.4.12 -y` |
