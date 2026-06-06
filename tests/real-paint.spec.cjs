const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { DIST, startDistServer } = require("../tools/test/dist-server.cjs");

test.setTimeout(90000);

let server;
let baseURL;

test.beforeAll(async () => {
  expect(fs.existsSync(DIST), "dist/ must exist; run npm run build first").toBeTruthy();
  server = await startDistServer();
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

function collectBrowserErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.stack || error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

async function stubExternalFonts(page) {
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i, (route) => {
    route.fulfill({ status: 204, body: "" });
  });
}

async function expectPaintedBox(locator, label, min = 8) {
  await expect(locator, `${label} should be visible`).toBeVisible({ timeout: 15000 });
  const box = await locator.boundingBox();
  expect(box, `${label} should have a layout box`).toBeTruthy();
  expect(box.width, `${label} width`).toBeGreaterThan(min);
  expect(box.height, `${label} height`).toBeGreaterThan(min);
}

async function expectServiceWorkerReady(page) {
  const ready = await page.evaluate(() => {
    if (!("serviceWorker" in navigator)) return { ok: false, reason: "unsupported" };
    return Promise.race([
      navigator.serviceWorker.ready.then((reg) => ({
        ok: !!(reg.active || reg.installing || reg.waiting),
        scope: reg.scope
      })),
      new Promise((resolve) => window.setTimeout(() => resolve({ ok: false, reason: "timeout" }), 20000))
    ]);
  });
  expect(ready.ok, `serviceWorker.ready failed: ${JSON.stringify(ready)}`).toBeTruthy();
}

test("campaign paints chrome, lazy feature CSS, drawer, and service worker", async ({ page }) => {
  await stubExternalFonts(page);
  const errors = collectBrowserErrors(page);
  const html = fs.readFileSync(path.join(DIST, "campaign.html"), "utf8");
  expect(html).not.toContain("visual-novel");
  expect(html).not.toContain("l2d-avatar");
  expect(html).not.toContain("minigames-bundle");

  await page.goto(`${baseURL}/campaign.html`, { waitUntil: "load" });
  await expectPaintedBox(page.locator(".campaign-shell"), "campaign shell");
  await expectPaintedBox(page.locator(".campaign-header"), "campaign header");
  await expectPaintedBox(page.locator(".campaign-subtabs"), "campaign tabs");
  await expectPaintedBox(page.locator("main.campaign-main"), "campaign main body");
  await expectPaintedBox(page.locator(".campaign-rail"), "campaign drawer rail");

  await expect(page.locator('link[rel="stylesheet"][href*="visual-novel"]')).toHaveCount(1);
  await expectPaintedBox(page.locator(".campaign-story-vn").first(), "story VN tab body");

  await expect(page.locator('link[rel="stylesheet"][href*="minigames-bundle"]')).toHaveCount(1);
  await page.evaluate(() => window.CJS?.CampaignUI?.setActiveTab?.("minigameTest"));
  await expectPaintedBox(page.locator(".campaign-minigame-test"), "minigame test tab body");

  await expect(page.locator('link[rel="stylesheet"][href*="l2d-avatar"]')).toHaveCount(1);
  await expectPaintedBox(page.locator("#l2d-companion-dock"), "L2D companion dock");
  await expect(page.locator("#l2d-companion-dock")).toHaveCSS("position", "fixed");

  expect(await page.locator(".campaign-drawer").count()).toBe(0);
  await page.locator(".campaign-rail .campaign-rail-btn").first().dispatchEvent("click");
  await expectPaintedBox(page.locator(".campaign-drawer"), "campaign drawer");
  await page.locator(".campaign-drawer-close").dispatchEvent("click");
  await expect(page.locator(".campaign-drawer")).toHaveCount(0, { timeout: 10000 });

  await expectServiceWorkerReady(page);
  expect(errors).toEqual([]);
});

test("combat launches a real painted canvas and runs RAF", async ({ page }) => {
  await stubExternalFonts(page);
  const errors = collectBrowserErrors(page);
  await page.addInitScript(() => {
    window.__cjsRafCount = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => original((time) => {
      window.__cjsRafCount += 1;
      return callback(time);
    });
  });

  await page.goto(`${baseURL}/combat.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#party-grid .setup-unit-card");
  await page.locator("#party-grid .setup-unit-card").first().click();
  await page.locator("#monster-grid .setup-unit-card .mon-add").first().click();
  await expect(page.locator("#btn-launch-quick")).toBeEnabled();
  await page.locator("#btn-launch-quick").click();

  const canvas = page.locator("#cbt-canvas");
  await expectPaintedBox(canvas, "combat grid canvas", 100);
  await page.waitForFunction(() => window.__cjsRafCount > 2);

  const pixels = await canvas.evaluate((el) => {
    const ctx = el.getContext("2d");
    const data = ctx.getImageData(0, 0, el.width, el.height).data;
    let nonTransparent = 0;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 0) nonTransparent += 1;
      if (data[i + 3] !== 0 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) nonWhite += 1;
      if (nonTransparent > 100 && nonWhite > 100) break;
    }
    return {
      width: el.width,
      height: el.height,
      cssWidth: el.getBoundingClientRect().width,
      cssHeight: el.getBoundingClientRect().height,
      nonTransparent,
      nonWhite,
      rafCount: window.__cjsRafCount
    };
  });

  expect(pixels.width).toBeGreaterThan(100);
  expect(pixels.height).toBeGreaterThan(100);
  expect(pixels.cssWidth).toBeGreaterThan(100);
  expect(pixels.cssHeight).toBeGreaterThan(100);
  expect(pixels.nonTransparent).toBeGreaterThan(100);
  expect(pixels.nonWhite).toBeGreaterThan(100);
  expect(pixels.rafCount).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
