import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const siteIconFixture = readFileSync(
  new URL("../public/icon-32.png", import.meta.url),
);

test.beforeEach(async ({ context }) => {
  await context.route("**/favicon.ico*", (route) =>
    route.fulfill({ contentType: "image/png", body: siteIconFixture }),
  );
});

test("collection drag preview supports inserting after the last group and cancelling without changes", async ({
  page,
}) => {
  await page.goto("/newtab.html");
  for (const name of ["设计资料", "工作现场"]) {
    await page.getByRole("button", { name: "新建合集", exact: true }).click();
    await page.getByLabel("合集名称").fill(name);
    await page.getByRole("button", { name: "创建合集", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  const source = page
    .locator(".collection-card")
    .filter({
      has: page.getByRole("heading", { name: "工作现场", exact: true }),
    });
  const target = page
    .locator(".collection-card")
    .filter({
      has: page.getByRole("heading", { name: "开始探索", exact: true }),
    });
  await target.locator(".card-title").hover();
  await source.locator(".card-title").hover();
  const start = await source.locator(".card-title").boundingBox();
  await page.mouse.down();
  await page.mouse.move(
    start!.x + start!.width / 2 + 12,
    start!.y + start!.height / 2,
    { steps: 4 },
  );
  await expect(page.locator(".collection-drag-preview")).toBeVisible();
  await expect(source).toHaveClass(/is-dragging/);
  const end = await target.boundingBox();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height - 15, {
    steps: 12,
  });
  await page.mouse.move(end!.x + end!.width / 2 + 1, end!.y + end!.height - 15);
  await expect(target.locator(".collection-drop-marker.after")).toBeVisible();
  await page.screenshot({
    path: "test-results/collection-drag.png",
    fullPage: true,
  });
  await page.mouse.up();
  await expect(page.locator(".collection-drag-preview")).toHaveCount(0);
  await expect(page.locator(".collection-card h2")).toHaveText([
    "设计资料",
    "开始探索",
    "工作现场",
  ]);
  await page.reload();
  await expect(page.locator(".collection-card h2")).toHaveText([
    "设计资料",
    "开始探索",
    "工作现场",
  ]);

  await source.locator(".card-title").hover();
  const cancelStart = await source.locator(".card-title").boundingBox();
  await page.mouse.down();
  await page.mouse.move(
    cancelStart!.x + cancelStart!.width / 2 + 12,
    cancelStart!.y + cancelStart!.height / 2,
    { steps: 4 },
  );
  await expect(page.locator(".collection-drag-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".collection-drag-preview")).toHaveCount(0);
  await expect(page.locator(".collection-drop-marker")).toHaveCount(0);
  await expect(page.locator(".collection-card h2")).toHaveText([
    "设计资料",
    "开始探索",
    "工作现场",
  ]);
});

test("website logos render, failed icons fall back, and edited URLs retry the correct site", async ({
  page,
}) => {
  await page.route("https://missing-icon.example/favicon.ico*", (route) =>
    route.abort(),
  );
  await page.goto("/newtab.html");
  // A local fixture keeps image decoding independent of external site availability.
  await page
    .getByRole("button", { name: "开始探索 添加链接", exact: true })
    .click();
  await page
    .getByLabel("网址", { exact: true })
    .fill("http://127.0.0.1:5173/website");
  await page.getByLabel("标题").fill("网站图标测试");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const icon = page.locator(
    'a[href="http://127.0.0.1:5173/website"] .site-icon',
  );
  await expect(icon).toHaveClass(/has-logo/);
  expect(
    await icon
      .locator("img")
      .evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBe(32);
  await page
    .getByRole("button", { name: "编辑 网站图标测试", exact: true })
    .click();
  await page
    .getByLabel("网址", { exact: true })
    .fill("https://missing-icon.example/page");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const fallback = page.locator(
    'a[href="https://missing-icon.example/page"] .site-icon',
  );
  await expect(fallback.locator("img")).toHaveCount(0);
  await expect(fallback).toHaveText("M");
  await expect(page.getByRole("link", { name: "网站图标测试" })).toBeVisible();
  await page
    .getByRole("button", { name: "编辑 网站图标测试", exact: true })
    .click();
  await page
    .getByLabel("网址", { exact: true })
    .fill("http://127.0.0.1:5173/website-updated");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const edited = page.locator(
    'a[href="http://127.0.0.1:5173/website-updated"] .site-icon',
  );
  await expect(edited).toHaveClass(/has-logo/);
  await expect(edited.locator("img")).toHaveAttribute(
    "src",
    "http://127.0.0.1:5173/favicon.ico?local-toby=1",
  );
});

test("click titles to rename with Enter, blur, Escape, IME and save failure handling", async ({
  page,
}) => {
  await page.goto("/newtab.html");
  await page
    .getByRole("button", { name: "重命名空间 我的第一个空间", exact: true })
    .click();
  const spaceInput = page.getByRole("textbox", {
    name: "空间名称",
    exact: true,
  });
  await spaceInput.fill("我的研究空间");
  await spaceInput.dispatchEvent("keydown", {
    key: "Enter",
    isComposing: true,
  });
  await expect(spaceInput).toBeVisible();
  await spaceInput.press("Enter");
  await expect(
    page.getByRole("heading", { name: "我的研究空间", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".space-nav")).toContainText("我的研究空间");

  await page
    .getByRole("button", { name: "重命名合集 开始探索", exact: true })
    .click();
  const collectionInput = page.getByRole("textbox", {
    name: "合集名称",
    exact: true,
  });
  await collectionInput.fill("不保存的名字");
  await collectionInput.press("Escape");
  await expect(
    page.getByRole("heading", { name: "开始探索", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "重命名合集 开始探索", exact: true })
    .click();
  await collectionInput.fill("  ");
  await collectionInput.press("Enter");
  await expect(page.getByRole("alert")).toContainText("名称不能为空");
  await collectionInput.fill("  常用开发文档  ");
  await page.locator(".space-stats").click();
  await expect(
    page.getByRole("heading", { name: "常用开发文档", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "MDN Web Docs" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "我的研究空间", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "常用开发文档", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "重命名空间 我的研究空间", exact: true })
    .click();
  await spaceInput.fill("待重试的名称");
  await page.evaluate(
    `window.__tobySetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'local-toby-v1') throw new Error('模拟保存失败'); return window.__tobySetItem.call(this, key, value); };`,
  );
  await spaceInput.press("Enter");
  await expect(page.getByRole("alert")).toContainText("模拟保存失败");
  await expect(spaceInput).toHaveValue("待重试的名称");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("local-toby-v1")!).spaces[0].name,
    ),
  ).toBe("我的研究空间");
  await page.evaluate(
    `Storage.prototype.setItem = window.__tobySetItem; delete window.__tobySetItem;`,
  );
  await spaceInput.press("Enter");
  await expect(
    page.getByRole("heading", { name: "待重试的名称", exact: true }),
  ).toBeVisible();
});

test("spaces isolate collections, persist selection, support collapse, moves and deletion undo", async ({
  page,
}) => {
  await page.goto("/newtab.html");
  await page.getByRole("button", { name: "创建空间", exact: true }).click();
  await page.getByLabel("空间名称").fill("产品设计");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建空间", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "产品设计", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".collection-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "新建合集", exact: true })
    .first()
    .click();
  await page.getByLabel("合集名称").fill("设计参考");
  await page.getByRole("button", { name: "创建合集", exact: true }).click();
  const card = page.locator(".collection-card").filter({
    has: page.getByRole("heading", { name: "设计参考", exact: true }),
  });
  await card.getByRole("button", { name: "添加链接" }).click();
  await page.getByLabel("网址", { exact: true }).fill("https://www.figma.com/");
  await page.getByLabel("标题").fill("Figma 设计灵感");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .getByRole("button", { name: "折叠 设计参考", exact: true })
    .click();
  await expect(card.getByRole("link", { name: "Figma 设计灵感" })).toBeHidden();
  await page.getByRole("button", { name: "展开所有合集" }).click();
  await expect(
    card.getByRole("link", { name: "Figma 设计灵感" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "产品设计", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Figma 设计灵感" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "空间列表" })
    .getByRole("button", { name: /我的第一个空间/ })
    .click();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "开始探索", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "空间列表" })
    .getByRole("button", { name: /产品设计/ })
    .click();
  await card.getByRole("button", { name: "设计参考 更多操作" }).click();
  await page.getByRole("button", { name: "编辑合集", exact: true }).click();
  await page.getByLabel("所属空间").selectOption({ label: "我的第一个空间" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.locator(".space-nav").first().click();
  await expect(
    card.getByRole("link", { name: "Figma 设计灵感" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/spaces-desktop.png",
    fullPage: true,
  });
  await card.locator(".card-title").dragTo(page.locator(".space-nav").last());
  await expect(card).toHaveCount(0);
  await page.locator(".space-nav").last().click();
  await expect(
    card.getByRole("link", { name: "Figma 设计灵感" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "空间更多操作" }).click();
  await page.getByRole("button", { name: "编辑空间", exact: true }).click();
  await page.getByLabel("空间名称").fill("设计工作室");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "设计工作室", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "空间更多操作" }).click();
  await page.getByRole("button", { name: "删除空间", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "删除空间", exact: true })
    .click();
  await expect(page.locator(".space-nav")).toHaveCount(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator(".space-nav")).toHaveCount(2);
  await page.locator(".space-nav").last().click();
  await expect(
    card.getByRole("link", { name: "Figma 设计灵感" }),
  ).toBeVisible();
});

test("upgrades existing version-1 storage in place and accepts legacy backups", async ({
  page,
}) => {
  const legacy = {
    schemaVersion: 1,
    revision: 3,
    collections: [
      {
        id: "old-c",
        name: "旧版资料",
        color: "blue",
        starred: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    links: [
      {
        id: "old-l",
        collectionId: "old-c",
        title: "保留的网页",
        url: "https://example.com/legacy",
        createdAt: 1,
      },
    ],
  };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("local-toby-v1"))
      localStorage.setItem("local-toby-v1", JSON.stringify(data));
  }, legacy);
  await page.goto("/newtab.html");
  await expect(
    page.getByRole("heading", { name: "我的第一个空间", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "保留的网页" })).toBeVisible();
  const migrated = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("local-toby-v1")!),
  );
  expect(migrated.schemaVersion).toBe(2);
  expect(migrated.collections[0].id).toBe("old-c");
  expect(migrated.links[0].id).toBe("old-l");
  await page.reload();
  await expect(page.getByRole("link", { name: "保留的网页" })).toBeVisible();
  await page.getByLabel("导入备份文件").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.getByRole("dialog")).toContainText(
    "1 个空间、1 个合集、1 个链接",
  );
  await page.getByRole("button", { name: "确认导入" }).click();
  await expect(page.locator(".space-nav")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "保留的网页" })).toBeVisible();
});

test("collection lifecycle, persistence, link search, stars, and deletion undo", async ({
  page,
}) => {
  await page.goto("/newtab.html");
  await expect(
    page.getByRole("heading", { name: "我的第一个空间" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page
    .getByRole("button", { name: "新建合集", exact: true })
    .last()
    .click();
  await page.getByLabel("合集名称").fill("研究资料");
  await page.getByRole("button", { name: "创建合集", exact: true }).click();
  const card = page.locator(".collection-card").filter({
    has: page.getByRole("heading", { name: "研究资料", exact: true }),
  });
  await card.getByRole("button", { name: "添加链接" }).click();
  await page
    .getByLabel("网址", { exact: true })
    .fill("https://example.com/research");
  await page.getByLabel("标题", { exact: false }).fill("有用的论文");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(card.getByRole("link", { name: "有用的论文" })).toBeVisible();
  await page.reload();
  await expect(card.getByRole("link", { name: "有用的论文" })).toBeVisible();
  await page.getByLabel("搜索合集或链接").fill("research");
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await page.getByRole("button", { name: "清空搜索" }).first().click();
  await card
    .getByRole("button", { name: "星标 研究资料", exact: true })
    .click();
  await page.getByRole("button", { name: /星标合集/ }).click();
  await expect(page.locator(".collection-card")).toHaveCount(1);
  await card.getByRole("button", { name: "研究资料 更多操作" }).click();
  await page.getByRole("button", { name: "删除合集", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "删除合集" })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(card.getByRole("link", { name: "有用的论文" })).toBeVisible();
});

test("multiple pages see changes, moving links and JSON roundtrip works", async ({
  page,
  context,
}) => {
  await page.goto("/newtab.html");
  const other = await context.newPage();
  await other.goto("/newtab.html");
  await page
    .getByRole("button", { name: "新建合集", exact: true })
    .last()
    .click();
  await page.getByLabel("合集名称").fill("同步测试");
  await page.getByRole("button", { name: "创建合集", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "同步测试", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑 MDN Web Docs" }).click();
  await page.getByLabel("所属合集").selectOption({ label: "同步测试" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const card = other.locator(".collection-card").filter({
    has: other.getByRole("heading", { name: "同步测试", exact: true }),
  });
  await expect(card.getByRole("link", { name: "MDN Web Docs" })).toBeVisible();
  await page.getByRole("button", { name: "设置与备份" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON 备份" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.getByLabel("导入备份文件").setInputFiles(path!);
  await expect(page.getByRole("dialog")).toContainText("2 个合集、3 个链接");
  await page.getByRole("button", { name: "确认导入" }).click();
  await expect(page.locator(".space-nav")).toHaveCount(2);
  await expect(other.locator(".space-nav")).toHaveCount(2);
  await expect(page.locator(".collection-card")).toHaveCount(2);
  await expect(other.locator(".collection-card")).toHaveCount(2);
  await page.locator(".space-nav").last().click();
  await expect(page.locator(".collection-card")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "MDN Web Docs" })).toBeVisible();
});

test("rejects invalid backup without losing saved data and works at narrow widths", async ({
  page,
}) => {
  await page.goto("/newtab.html");
  await page.getByLabel("导入备份文件").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("alert")).toContainText("不支持此备份版本");
  await page.getByRole("button", { name: "关闭通知" }).click();
  await expect(page.getByRole("link", { name: "MDN Web Docs" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "收起当前窗口", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await expect(
    page.getByRole("button", { name: "新建合集", exact: true }).last(),
  ).toBeVisible();
});
