import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  initialData,
  normalizeUrl,
  parseBackup,
  type AppData,
} from "./model.ts";

function fixture(): AppData {
  return {
    schemaVersion: 2,
    spaces: [{ id: "s", name: "Personal", color: "purple", createdAt: 1 }],
    revision: 0,
    collections: [
      {
        id: "a",
        spaceId: "s",
        name: "工作",
        color: "blue",
        starred: false,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "b",
        spaceId: "s",
        name: "学习",
        color: "green",
        starred: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    links: [
      {
        id: "l1",
        collectionId: "a",
        title: "Example",
        url: "https://example.com/",
        createdAt: 1,
      },
    ],
  };
}

describe("persistent collection operations", () => {
  it("reorders spaces without changing their contents and preserves order in backups", () => {
    const current = fixture();
    current.spaces.push(
      { id: "s2", name: "学习", color: "blue", createdAt: 2 },
      { id: "s3", name: "阅读", color: "green", createdAt: 3 },
    );
    const moved = applyCommand(current, { type: "reorderSpace", id: "s" });
    assert.deepEqual(
      moved.spaces.map((s) => s.id),
      ["s2", "s3", "s"],
    );
    assert.deepEqual(moved.collections, current.collections);
    assert.deepEqual(moved.links, current.links);
    assert.deepEqual(parseBackup(moved).spaces, moved.spaces);
    const first = applyCommand(moved, {
      type: "reorderSpace",
      id: "s",
      beforeId: "s2",
    });
    assert.deepEqual(first.spaces, current.spaces);
    assert.deepEqual(
      current.spaces.map((s) => s.id),
      ["s", "s2", "s3"],
    );
    assert.deepEqual(
      applyCommand(first, { type: "reorderSpace", id: "s", beforeId: "s" })
        .spaces,
      first.spaces,
    );
    assert.throws(() =>
      applyCommand(first, { type: "reorderSpace", id: "missing" }),
    );
    assert.throws(() =>
      applyCommand(first, {
        type: "reorderSpace",
        id: "s",
        beforeId: "missing",
      }),
    );
  });

  it("migrates version 1 into a stable default space, preserving all collection IDs and URLs", () => {
    const current = fixture();
    const legacy = {
      schemaVersion: 1,
      revision: 7,
      collections: current.collections.map(({ spaceId, ...c }) => c),
      links: current.links,
    };
    const migrated = parseBackup(legacy);
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.spaces.length, 1);
    assert.equal(migrated.revision, 7);
    assert.deepEqual(migrated.links, legacy.links);
    assert.ok(
      migrated.collections.every((c) => c.spaceId === migrated.spaces[0].id),
    );
    assert.deepEqual(parseBackup(legacy), migrated);
    assert.deepEqual(parseBackup(migrated), migrated);
  });

  it("creates spaces, moves collections, deletes with descendants and restores the whole hierarchy", () => {
    const current = fixture();
    const created = applyCommand(current, {
      type: "createSpace",
      name: "新项目",
      color: "green",
    });
    const space = created.spaces[1];
    const moved = applyCommand(created, {
      type: "updateCollection",
      id: "a",
      spaceId: space.id,
    });
    assert.equal(moved.collections[0].spaceId, space.id);
    assert.deepEqual(moved.links, current.links);
    const renamed = applyCommand(moved, {
      type: "updateSpace",
      id: space.id,
      name: "工作",
      color: "blue",
    });
    assert.equal(renamed.spaces[1].name, "工作");
    const deleted = applyCommand(renamed, {
      type: "deleteSpace",
      id: space.id,
    });
    assert.equal(deleted.collections.length, 1);
    assert.equal(deleted.links.length, 0);
    const restored = applyCommand(deleted, {
      type: "restore",
      spaces: [renamed.spaces[1]],
      collections: [moved.collections[0]],
      links: moved.links,
    });
    assert.equal(restored.spaces.length, 2);
    assert.equal(
      restored.collections.find((c) => c.id === "a")?.spaceId,
      space.id,
    );
    assert.deepEqual(restored.links, current.links);
    assert.deepEqual(parseBackup(restored), restored);
    assert.throws(
      () => applyCommand(current, { type: "deleteSpace", id: "s" }),
      /至少保留/,
    );
  });

  it("rejects missing spaces, orphans and cross-space reorder targets", () => {
    const current = fixture();
    assert.throws(() =>
      applyCommand(current, {
        type: "createCollection",
        spaceId: "missing",
        name: "Invalid",
        color: "blue",
      }),
    );
    assert.throws(() =>
      applyCommand(current, {
        type: "updateCollection",
        id: "a",
        spaceId: "missing",
      }),
    );
    assert.throws(() =>
      parseBackup({
        ...current,
        collections: [{ ...current.collections[0], spaceId: "missing" }],
      }),
    );
    const created = applyCommand(current, {
      type: "createSpace",
      name: "Other",
      color: "green",
    });
    const moved = applyCommand(created, {
      type: "updateCollection",
      id: "a",
      spaceId: created.spaces[1].id,
    });
    assert.throws(() =>
      applyCommand(moved, {
        type: "reorderCollection",
        id: "a",
        beforeId: "b",
      }),
    );
  });
  it("rejects over-capacity writes before they can make persisted data unreadable", () => {
    const current = fixture();
    current.collections = Array.from({ length: 1000 }, (_, i) => ({
      ...current.collections[0],
      id: String(i),
    }));
    current.links = [];
    assert.throws(
      () =>
        applyCommand(current, {
          type: "createCollection",
          spaceId: "s",
          name: "Too many",
          color: "blue",
        }),
      /容量上限/,
    );
    assert.equal(current.collections.length, 1000);
    assert.equal(parseBackup(current).collections.length, 1000);
  });
  it("deduplicates normalized URLs in one collection but permits them in another", () => {
    const a = applyCommand(fixture(), {
      type: "addLinks",
      collectionId: "a",
      links: [
        { title: "Duplicate", url: "https://example.com" },
        { title: "New", url: "https://example.org" },
        { title: "New duplicate", url: "https://example.org/" },
      ],
    });
    assert.equal(a.links.length, 2);
    assert.equal(a.revision, 1);
    const b = applyCommand(a, {
      type: "addLinks",
      collectionId: "b",
      links: [{ title: "Example", url: "https://example.com/" }],
    });
    assert.equal(b.links.length, 3);
  });

  it("rejects unsafe URL schemes, missing collections, and blank names without mutating input", () => {
    const current = fixture();
    const original = structuredClone(current);
    assert.throws(() => normalizeUrl("javascript:alert(1)"));
    assert.throws(() => normalizeUrl("file:///private/tmp/file"));
    assert.throws(() =>
      applyCommand(current, {
        type: "addLinks",
        collectionId: "missing",
        links: [],
      }),
    );
    assert.throws(() =>
      applyCommand(current, {
        type: "createCollection",
        spaceId: "s",
        name: " ",
        color: "coral",
      }),
    );
    assert.throws(() =>
      applyCommand(current, {
        type: "addLinks",
        collectionId: "a",
        links: [
          { title: "Okay", url: "https://valid.com" },
          { title: "Bad", url: "data:hello" },
        ],
      }),
    );
    assert.deepEqual(current, original);
  });

  it("undoes a deletion without replacing unrelated edits", () => {
    const current = fixture();
    const deleted = applyCommand(current, {
      type: "deleteCollection",
      id: "a",
    });
    const edited = applyCommand(deleted, {
      type: "updateCollection",
      id: "b",
      name: "更新的名称",
    });
    const restored = applyCommand(edited, {
      type: "restore",
      collections: [current.collections[0]],
      links: current.links,
    });
    assert.equal(
      restored.collections.find((c) => c.id === "b")?.name,
      "更新的名称",
    );
    assert.deepEqual(restored.links, current.links);
    assert.equal(
      applyCommand(restored, {
        type: "restore",
        collections: current.collections,
        links: current.links,
      }).links.length,
      1,
    );
  });

  it("moves and orders links and prevents duplicates in the destination", () => {
    const withLink = applyCommand(fixture(), {
      type: "addLinks",
      collectionId: "b",
      links: [{ title: "Second", url: "https://second.com" }],
    });
    const moved = applyCommand(withLink, {
      type: "moveLink",
      id: "l1",
      collectionId: "b",
      beforeId: withLink.links[1].id,
    });
    assert.equal(moved.links[0].id, "l1");
    assert.equal(moved.links[0].collectionId, "b");
    const duplicate = applyCommand(fixture(), {
      type: "addLinks",
      collectionId: "b",
      links: [{ title: "Duplicate", url: "https://example.com" }],
    });
    assert.throws(
      () =>
        applyCommand(duplicate, {
          type: "moveLink",
          id: "l1",
          collectionId: "b",
        }),
      /已经存在/,
    );
  });

  it("imports additively with remapped IDs, preserving existing content", () => {
    const current = fixture();
    const imported = applyCommand(current, { type: "import", data: fixture() });
    assert.equal(imported.collections.length, 4);
    assert.equal(new Set(imported.collections.map((c) => c.id)).size, 4);
    assert.equal(new Set(imported.links.map((l) => l.id)).size, 2);
    assert.deepEqual(imported.links[0], current.links[0]);
    assert.ok(
      imported.collections.some((c) => c.id === imported.links[1].collectionId),
    );
    assert.deepEqual(
      parseBackup(JSON.parse(JSON.stringify(imported))),
      imported,
    );
  });

  it("rejects future versions, invalid references, duplicate IDs and unsafe imported links", () => {
    assert.throws(
      () => parseBackup({ ...fixture(), schemaVersion: 99 }),
      /版本/,
    );
    assert.throws(() =>
      parseBackup({
        ...fixture(),
        links: [{ ...fixture().links[0], collectionId: "missing" }],
      }),
    );
    assert.throws(() =>
      parseBackup({
        ...fixture(),
        collections: [fixture().collections[0], fixture().collections[0]],
      }),
    );
    assert.throws(() =>
      parseBackup({
        ...fixture(),
        links: [{ ...fixture().links[0], url: "javascript:alert(1)" }],
      }),
    );
    assert.throws(() =>
      parseBackup({
        ...fixture(),
        collections: [{ ...fixture().collections[0], createdAt: NaN }],
      }),
    );
  });

  it("preserves all data when reordering and produces a valid first-run document", () => {
    const current = fixture();
    const reordered = applyCommand(current, {
      type: "reorderCollection",
      id: "b",
      beforeId: "a",
    });
    assert.deepEqual(
      reordered.collections.map((c) => c.id),
      ["b", "a"],
    );
    assert.deepEqual(reordered.links, current.links);
    assert.equal(parseBackup(initialData()).links.length, 3);
  });
});
