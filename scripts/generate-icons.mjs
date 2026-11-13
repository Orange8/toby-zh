import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

// Render our own SVG artwork; no external image service or network request.
const svg = await readFile(
  new URL("../public/icon.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname,
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
}

// Also expose the app's own standard /favicon.ico for ordinary browser tabs.
const png = await readFile(new URL("../public/icon-32.png", import.meta.url));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(
  new URL("../public/favicon.ico", import.meta.url),
  Buffer.concat([header, png]),
);
