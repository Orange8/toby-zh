import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("real MV3 extension: new-tab override, persistence, safe save/close, drag, concurrency and restore", async () => {
  const profile = await mkdtemp(join(tmpdir(), "local-toby-extension-"));
  const extension = resolve(process.env.TOBY_EXTENSION_DIR || "dist");
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await context.route("https://toby-test.example/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<title>Test ${new URL(route.request().url()).pathname}</title><h1>Local extension fixture</h1>`,
      }),
    );
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).hostname;
    // Fail if the application tries to use account storage during local operations.
    await worker.evaluate(() => {
      const calls: string[] = [];
      Object.assign(globalThis, { __accountStorageCalls: calls });
      for (const method of ["get", "set", "remove", "clear"] as const) {
        Object.assign(chrome.storage.sync, {
          [method]: async () => {
            calls.push(method);
            throw new Error("账户存储已禁用");
          },
        });
      }
    });
    const url = `chrome-extension://${extensionId}/newtab.html`;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("chrome://newtab");
    await expect(
      page.getByRole("heading", { name: "我的第一个空间" }),
    ).toBeVisible();
    expect(page.url()).toContain(extensionId);
    await expect(page.getByText("浏览器预览", { exact: true })).toHaveCount(0);
    const logo = page.locator(".card-links .site-icon img").first();
    await expect(logo).toHaveAttribute(
      "src",
      /chrome-extension:\/\/.*\/_favicon\//,
    );
    await expect
      .poll(() =>
        logo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);

    const first = await context.newPage();
    await first.goto("https://toby-test.example/first");
    const second = await context.newPage();
    await second.goto("https://toby-test.example/second");
    const pinned = await context.newPage();
    await pinned.goto("https://toby-test.example/pinned");
    await page.evaluate(async () => {
      const [tab] = await chrome.tabs.query({
        url: "https://toby-test.example/pinned",
      });
      await chrome.tabs.update(tab.id!, { pinned: true });
    });
    await page.bringToFront();
    await expect(page.locator(".open-tab")).toHaveCount(3);
    const openTabLogo = page.locator(".open-tab .site-icon img").first();
    await expect(openTabLogo).toHaveAttribute("src", /\/_favicon\//);
    await expect
      .poll(() =>
        openTabLogo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);

    // Saving to a dedicated collection makes the restoration assertion unambiguous.
    await page
      .getByRole("button", { name: "新建合集", exact: true })
      .last()
      .click();
    await page.getByLabel("合集名称").fill("真实标签测试");
    await page.getByRole("button", { name: "创建合集", exact: true }).click();
    const card = page.locator(".collection-card").filter({
      has: page.getByRole("heading", { name: "真实标签测试", exact: true }),
    });

    await page
      .getByRole("button", { name: "保存当前窗口", exact: true })
      .last()
      .click();
    await page
      .getByRole("checkbox", { name: "保存成功后关闭这些标签" })
      .check();
    // A real storage failure must leave both source tabs open.
    await worker.evaluate(
      `globalThis.__tobyOriginalSet = chrome.storage.local.set; chrome.storage.local.set = async () => { throw new Error('模拟存储写入失败'); };`,
    );
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("模拟存储写入失败");
    expect(first.isClosed()).toBe(false);
    expect(second.isClosed()).toBe(false);
    await worker.evaluate(
      `chrome.storage.local.set = globalThis.__tobyOriginalSet; delete globalThis.__tobyOriginalSet;`,
    );
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(card.getByRole("link")).toHaveCount(2);
    await expect.poll(() => first.isClosed() && second.isClosed()).toBe(true);
    expect(pinned.isClosed()).toBe(false);
    await page.reload();
    await expect(card.getByRole("link")).toHaveCount(2);

    // Drag the pinned tab into a collection: saving it is allowed, closing it is not.
    await page.locator(".open-tab").dragTo(card);
    await expect(card.getByRole("link")).toHaveCount(3);
    expect(pinned.isClosed()).toBe(false);

    const other = await context.newPage();
    await other.goto(url);
    // Two pages modify the same document concurrently through the worker queue.
    await Promise.all(
      [page, other].map((p, i) =>
        p.evaluate(async (index) => {
          const result = await chrome.runtime.sendMessage({
            channel: "local-toby",
            command: {
              type: "createCollection",
              spaceId: (await chrome.storage.local.get("local-toby-v1"))[
                "local-toby-v1"
              ].spaces[0].id,
              name: `并发合集 ${index}`,
              color: "green",
            },
          });
          if (!result.ok) throw new Error(result.error);
        }, i),
      ),
    );
    await expect(page.locator(".collection-card")).toHaveCount(4);
    await expect(other.locator(".collection-card")).toHaveCount(4);

    const beforeIds = await page.evaluate(async () =>
      (await chrome.tabs.query({})).map((t) => t.id!),
    );
    await page.bringToFront();
    await card.getByRole("button", { name: "打开全部" }).click();
    const restoredTabs = () =>
      page.evaluate(
        async (ids) =>
          (await chrome.tabs.query({})).filter(
            (t) =>
              !ids.includes(t.id!) &&
              t.url?.startsWith("https://toby-test.example/"),
          ),
        beforeIds,
      );
    await expect.poll(async () => (await restoredTabs()).length).toBe(3);
    const restored = await restoredTabs();
    expect(new Set(restored.map((t) => t.windowId)).size).toBe(1);
    expect(restored.map((t) => t.url)).toEqual(
      expect.arrayContaining([
        "https://toby-test.example/first",
        "https://toby-test.example/second",
        "https://toby-test.example/pinned",
      ]),
    );
    expect(errors).toEqual([]);
    // Exercise the storage upgrade inside the actual service worker as well.
    await worker.evaluate(async () => {
      const data = (await chrome.storage.local.get("local-toby-v1"))[
        "local-toby-v1"
      ];
      const { spaces, ...legacy } = data;
      legacy.schemaVersion = 1;
      legacy.collections = legacy.collections.map(
        ({
          spaceId,
          ...collection
        }: {
          spaceId: string;
          [key: string]: unknown;
        }) => collection,
      );
      await chrome.storage.local.set({ "local-toby-v1": legacy });
    });
    await page.reload();
    await expect(page.locator(".collection-card")).toHaveCount(4);
    const upgraded = await page.evaluate(
      async () =>
        (await chrome.storage.local.get("local-toby-v1"))["local-toby-v1"],
    );
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.spaces).toHaveLength(1);
    expect(
      upgraded.collections.every(
        (c: { spaceId: string }) => c.spaceId === upgraded.spaces[0].id,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "设置与备份", exact: true }).click();
    await expect(
      page.getByText("数据只保存在本机", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "立即同步", exact: true }),
    ).toHaveCount(0);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出 JSON 备份", exact: true })
      .click();
    const download = await downloadPromise;
    const backup = await readFile((await download.path())!);
    expect(JSON.parse(backup.toString())).toEqual(upgraded);
    await page.screenshot({
      path: "test-results/local-backup-settings.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "关闭对话框" }).click();
    // Clearing local storage starts fresh; restoring data requires importing the file.
    await worker.evaluate(async () => {
      await chrome.storage.local.clear();
    });
    await page.reload();
    await expect(page.locator(".collection-card")).toHaveCount(1);
    await page.getByLabel("导入备份文件").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: backup,
    });
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.locator(".space-nav")).toHaveCount(2);
    await page.locator(".space-nav").last().click();
    await expect(page.locator(".collection-card")).toHaveCount(4);
    const restoredData = await page.evaluate(
      async () =>
        (await chrome.storage.local.get("local-toby-v1"))["local-toby-v1"],
    );
    expect(restoredData.collections).toHaveLength(
      upgraded.collections.length + 1,
    );
    expect(restoredData.links.map((link: { url: string }) => link.url)).toEqual(
      expect.arrayContaining(
        upgraded.links.map((link: { url: string }) => link.url),
      ),
    );
    expect(await worker.evaluate("globalThis.__accountStorageCalls")).toEqual(
      [],
    );
    const permissions = await page.evaluate(
      () => chrome.runtime.getManifest().permissions,
    );
    expect(permissions).toEqual(["storage", "tabs", "favicon"]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
