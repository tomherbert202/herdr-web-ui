/**
 * B-159: a phone watching a pane another device sized wider than the width a reply was printed
 * at. Replays a real lane reply (B159_REPLY: ANSI rows from `herdr pane read --format ansi`) into
 * a test pane a 1280 px client drives, then a 390 px touch client that watches it (observe, as a
 * phone does while another device types) taps: both halves of a long absolute path Claude Code
 * cut across two rows, and a repo-relative path (`world/urbn.md`) from a pane in another repo,
 * read through the configured roots (B159_ROOT, default ~/projects/brain).
 */
import "./test-herdr.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createServer } from "../server/index.ts";
import { paneSendText, workspaceCreate, workspaceClose } from "../server/herdr/client.ts";
import { chromePath } from "./chrome-path.ts";

const reply = process.env["B159_REPLY"];
assert.ok(reply, "B159_REPLY names the ANSI file of a real lane reply");
const laneCwd = process.env["B159_CWD"] ?? join(homedir(), "projects", "propelx-ims-tom-herbert");
const evidence = process.env["UI_EVIDENCE_DIR"];
const stateDir = mkdtempSync(join(tmpdir(), "herdr-b159-"));
writeFileSync(join(stateDir, "file-roots"), `${process.env["B159_ROOT"] ?? join(homedir(), "projects", "brain")}\n`);
const workspace = await workspaceCreate({ cwd: laneCwd, label: "herdr-web-ui-test-b159" });
const pane = workspace.root_pane.pane_id;
let server: ReturnType<typeof createServer> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: string[] = [];
try {
  server = createServer({ port: 0, hostname: "127.0.0.1", token: "", stateDir });
  browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  const url = `http://127.0.0.1:${server.port}/?pane=${encodeURIComponent(pane)}`;
  const terminalView = (id: string) => localStorage.setItem(`herdr-web-ui:view:${id}`, "terminal");

  // the device that drives the grid: wide, as the laptop is
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await desk.addInitScript(terminalView, pane);
  const deskPage = await desk.newPage();
  deskPage.setDefaultTimeout(15_000);
  await deskPage.goto(url);
  await deskPage.locator(".conn-live").waitFor();
  await paneSendText(pane, `clear; cat '${reply}'\r`);
  await deskPage.waitForFunction(() => document.querySelector(".xterm-rows")?.textContent?.includes("DATION-TOOLS"));

  // the phone: 390 px, touch, watching the grid the desk drives
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await phone.addInitScript(terminalView, pane);
  await phone.addInitScript(() => {
    const Native = window.WebSocket;
    class Watching extends Native {
      constructor(address: string | URL, protocols?: string | string[]) {
        super(address, protocols);
        this.addEventListener("open", () => super.send(JSON.stringify({ type: "role", mode: "observe" })));
      }
      // the app replays its role (interact) on connect: a watching phone keeps observe, and attaches at the pane's size
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (typeof data === "string" && data.startsWith("{")) {
          const message = JSON.parse(data) as Record<string, unknown>;
          if (message["type"] === "role") message["mode"] = "observe";
          if (message["type"] === "attach") message["keep_size"] = true;
          super.send(JSON.stringify(message));
          return;
        }
        super.send(data);
      }
    }
    window.WebSocket = Watching as typeof WebSocket;
  });
  const page = await phone.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(url);
  await page.locator(".conn-live").waitFor();
  await page.waitForFunction(() => document.querySelector(".xterm-rows")?.textContent?.includes("DATION-TOOLS"));
  await page.waitForTimeout(500);
  const cols = await page.evaluate(() => (document.querySelector(".xterm-rows > div")?.textContent ?? "").length);
  console.log(`phone grid: ${cols} columns (the reply was printed at 84)`);
  if (evidence) await page.screenshot({ path: join(evidence, "b159-phone-390.png") });

  const tap = async (p: Page, row: RegExp, needle: string, want: RegExp, name: string) => {
    const line = p.locator(".xterm-rows > div", { hasText: row }).first();
    await line.waitFor();
    const text = (await line.textContent()) ?? "";
    const at = text.indexOf(needle);
    assert.ok(at >= 0, `${needle} not in ${text}`);
    const box = await line.boundingBox();
    assert.ok(box);
    const cell = box.width / text.length;
    await p.touchscreen.tap(box.x + cell * (at + 2.5), box.y + box.height / 2);
    const viewer = p.locator(".modal.file-viewer");
    try {
      await viewer.waitFor({ timeout: 4_000 });
    } catch {
      results.push(`FAIL ${name}: no viewer opened`);
      console.log(results.at(-1));
      return;
    }
    // the viewer says "Opening…" until the server answers: judge what it settles on
    await p.waitForFunction(() => !/Opening/.test(document.querySelector(".modal.file-viewer")?.textContent ?? ""), null, { timeout: 8_000 }).catch(() => {});
    await p.waitForTimeout(300);
    const shown = await viewer.innerText();
    if (evidence) await p.screenshot({ path: join(evidence, `b159-${name}.png`) });
    if (want.test(shown)) results.push(`PASS ${name}: ${shown.split("\n")[0]}`);
    else results.push(`FAIL ${name}: viewer shows ${shown.slice(0, 120)}`);
    console.log(results.at(-1));
    await p.keyboard.press("Escape");
    await viewer.waitFor({ state: "hidden" }).catch(() => p.locator(".file-viewer-header button").last().click());
  };
  await tap(page, /Tool set: \/home/, "/home/tom", /tool set for the deal outreach engine/i, "wrapped-path-first-row");
  await tap(page, /^\s*DATION-TOOLS\.md/, "DATION", /tool set for the deal outreach engine/i, "wrapped-path-second-row");
  await tap(page, /card world\/urbn\.md/, "world/urbn.md", /URBN Group/, "relative-path-other-repo");
  await phone.close();
  await desk.close();
} finally {
  try { await browser?.close(); } finally {
    try { server?.stop(); } finally {
      await workspaceClose(workspace.workspace.workspace_id);
      rmSync(stateDir, { recursive: true, force: true });
    }
  }
}
console.log(results.join("\n"));
process.exit(results.every((line) => line.startsWith("PASS")) ? 0 : 1);
