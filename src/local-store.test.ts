import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalStore, type LocalStorageAdapter } from "./local-store.ts";
import { initialData, STORAGE_KEY } from "./model.ts";

function fixture(initial: Record<string, unknown> = {}) {
  const items = structuredClone(initial);
  let failWrite = false;
  let writes = 0;
  const adapter: LocalStorageAdapter = {
    async get(key) {
      return structuredClone({ [key]: items[key] });
    },
    async set(values) {
      if (failWrite) throw new Error("模拟写入失败");
      Object.assign(items, structuredClone(values));
      writes++;
    },
  };
  return {
    store: new LocalStore(adapter),
    items,
    fail: (value: boolean) => {
      failWrite = value;
    },
    writes: () => writes,
  };
}

describe("local persistence", () => {
  it("preserves the previous version's local document and ignores unrelated metadata", async () => {
    const data = initialData();
    data.spaces[0].name = "已有空间";
    data.revision = 42;
    const f = fixture({
      [STORAGE_KEY]: data,
      "legacy-metadata": { pending: true },
    });
    assert.deepEqual(await f.store.read(), data);
    assert.equal(f.writes(), 0);
  });

  it("upgrades a version-1 local document without losing links or collection IDs", async () => {
    const data = initialData();
    const legacy = {
      schemaVersion: 1,
      revision: 9,
      collections: data.collections.map(
        ({ spaceId, ...collection }) => collection,
      ),
      links: data.links,
    };
    const f = fixture({ [STORAGE_KEY]: legacy });
    const migrated = await f.store.read();
    assert.deepEqual(migrated.links, data.links);
    assert.deepEqual(
      migrated.collections.map((c) => c.id),
      data.collections.map((c) => c.id),
    );
    assert.equal(migrated.schemaVersion, 2);
    assert.deepEqual(f.items[STORAGE_KEY], migrated);
  });

  it("serializes concurrent changes without dropping either edit", async () => {
    const f = fixture({ [STORAGE_KEY]: initialData() });
    await Promise.all(
      ["工作", "学习"].map((name) =>
        f.store.read({ type: "createSpace", name, color: "blue" }),
      ),
    );
    assert.deepEqual(
      (await f.store.read()).spaces.slice(1).map((s) => s.name),
      ["工作", "学习"],
    );
  });

  it("rejects a failed write, keeps saved data and resumes the queue from persisted state", async () => {
    const data = initialData();
    const f = fixture({ [STORAGE_KEY]: data });
    f.fail(true);
    await assert.rejects(
      f.store.read({ type: "createSpace", name: "未保存", color: "blue" }),
      /模拟写入失败/,
    );
    assert.deepEqual(f.items[STORAGE_KEY], data);
    f.fail(false);
    const saved = await f.store.read({
      type: "createSpace",
      name: "已保存",
      color: "green",
    });
    assert.deepEqual(
      saved.spaces.slice(1).map((s) => s.name),
      ["已保存"],
    );
  });

  it("keeps corrupt stored data intact instead of silently replacing it with demos", async () => {
    const f = fixture({ [STORAGE_KEY]: { schemaVersion: 99 } });
    await assert.rejects(f.store.read());
    assert.deepEqual(f.items[STORAGE_KEY], { schemaVersion: 99 });
    assert.equal(f.writes(), 0);
  });
});
