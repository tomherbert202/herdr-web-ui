/**
 * B-244 (AGT-381): a laptop click on a file path in the terminal view opens the file. A touchpad press
 * travels a pixel or two before it lets go; that must still be a click, not a drag that selects a sliver
 * of the path, copies it ("copied to clipboard") and leaves the link unopened. Drives a 1280 px mouse
 * client: a still click, a 2 px click and a 6 px click on a printed absolute path must each open the
 * viewer; a real drag across the path must still select and not open.
 */
import "./test-herdr.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "../server/index.ts";
import { paneSendText, workspaceCreate, workspaceClose } from "../server/herdr/client.ts";
import { chromePath } from "./chrome-path.ts";

const target = process.env["B244_FILE"] ?? join(homedir(), "projects", "brain", "CLAUDE.md");
const evidence = process.env["UI_EVIDENCE_DIR"];
const stateDir = mkdtempSync(join(tmpdir(), "herdr-b244-"));
writeFileSync(join(stateDir, "file-roots"), `${join(homedir(), "projects", "brain")}\n`);
const workspace = await workspaceCreate({ cwd: join(homedir(), "projects", "brain"), label: "herdr-web-ui-test-b244" });
const pane = workspace.root_pane.pane_id;
let server: ReturnType<typeof createServer> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const results: string[] = [];
try {
  server = createServer({ port: 0, hostname: "127.0.0.1", token: "", stateDir });
  browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  const url = `http://127.0.0.1:${server.port}/?pane=${encodeURIComponent(pane)}`;
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await desk.addInitScript((id: string) => localStorage.setItem(`herdr-web-ui:view:${id}`, "terminal"), pane);
  const page = await desk.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(url);
  await page.locator(".conn-live").waitFor();
  await paneSendText(pane, `clear; printf 'Plan: %s\\n' '${target}'\r`);
  await page.waitForFunction(() => document.querySelector(".xterm-rows")?.textContent?.includes("CLAUDE.md"));
  await page.waitForTimeout(500);

  const press = async (travel: number, name: string, wantOpen: boolean) => {
    const line = page.locator(".xterm-rows > div", { hasText: /Plan: \/home/ }).first();
    await line.waitFor();
    const text = (await line.textContent()) ?? "";
    const at = text.indexOf("/home");
    const box = await line.boundingBox();
    assert.ok(box);
    const cell = box.width / text.length;
    const x = box.x + cell * (at + 8.5), y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.waitForTimeout(150);                 // xterm registers the link on hover
    await page.mouse.down();
    if (travel) await page.mouse.move(x + travel, y + (travel > 4 ? 1 : 0), { steps: 2 });
    await page.mouse.up();
    const viewer = page.locator(".modal.file-viewer");
    const opened = await viewer.waitFor({ timeout: 3_000 }).then(() => true, () => false);
    const note = await page.evaluate(() => document.body.innerText.includes("copied to clipboard"));
    if (evidence) await page.screenshot({ path: join(evidence, `b244-${name}.png`) });
    const ok = opened === wantOpen;
    results.push(`${ok ? "PASS" : "FAIL"} ${name}: travel ${travel}px, viewer ${opened ? "opened" : "closed"}, ${note ? "copied note shown" : "no copied note"}`);
    console.log(results.at(-1));
    if (opened) {
      await page.keyboard.press("Escape");
      await viewer.waitFor({ state: "hidden" }).catch(() => page.locator(".file-viewer-header button").last().click());
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  };
  await press(0, "still-click", true);
  await press(2, "touchpad-click-2px", true);
  await press(6, "touchpad-click-6px", true);
  await press(160, "real-drag", false);
  await desk.close();
} finally {
  try { await browser?.close(); } finally {
    server?.stop();
    await workspaceClose(workspace.workspace.workspace_id).catch(() => {});
    rmSync(stateDir, { recursive: true, force: true });
  }
}
const failed = results.filter((r) => r.startsWith("FAIL"));
console.log(`RESULT: ${failed.length ? "FAIL" : "PASS"} b244 link click (${results.length - failed.length}/${results.length})`);
process.exit(failed.length ? 1 : 0);
