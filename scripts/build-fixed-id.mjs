import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import { readFile, writeFile, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const identityPath = new URL("extension-identity.json", root);
let identity;
try {
  identity = JSON.parse(await readFile(identityPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  identity = {
    publicKey: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
  };
  await writeFile(identityPath, JSON.stringify(identity, null, 2) + "\n", {
    flag: "wx",
  });
}
const key = createPublicKey({
  key: Buffer.from(identity.publicKey, "base64"),
  format: "der",
  type: "spki",
});
const bytes = key.export({ type: "spki", format: "der" });
const id = [...createHash("sha256").update(bytes).digest().subarray(0, 16)]
  .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
  .join("");
const manifest = JSON.parse(
  await readFile(new URL("dist/manifest.json", root), "utf8"),
);
manifest.key = bytes.toString("base64");
await rm(new URL("dist-fixed-id/", root), { recursive: true, force: true });
await cp(new URL("dist/", root), new URL("dist-fixed-id/", root), {
  recursive: true,
});
await writeFile(
  new URL("dist-fixed-id/manifest.json", root),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `固定 ID 本地版本已生成：${fileURLToPath(new URL("dist-fixed-id/", root))}`,
);
console.log(`固定扩展 ID：${id}`);
console.log(
  "原 dist 和原扩展 ID 均未修改。请先从旧版导出 JSON 备份，再加载 dist-fixed-id 并导入；跨电脑迁移请使用 JSON 导出、导入。",
);
