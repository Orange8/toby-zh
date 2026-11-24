// Keep the original key so existing installations are upgraded in place.
export const STORAGE_KEY = "local-toby-v1";
export const COLORS = ["coral", "blue", "purple", "green", "amber"] as const;
export type Color = (typeof COLORS)[number];
export type Space = {
  id: string;
  name: string;
  color: Color;
  createdAt: number;
};
export const DEFAULT_SPACE_ID = "space-personal";
export type Collection = {
  id: string;
  spaceId: string;
  name: string;
  color: Color;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
};
export type SavedLink = {
  id: string;
  collectionId: string;
  title: string;
  url: string;
  createdAt: number;
};
export type AppData = {
  schemaVersion: 2;
  spaces: Space[];
  revision: number;
  collections: Collection[];
  links: SavedLink[];
};
export type LinkInput = { title: string; url: string };
export type Command =
  | { type: "createSpace"; name: string; color: Color }
  | { type: "updateSpace"; id: string; name: string; color?: Color }
  | { type: "deleteSpace"; id: string }
  | { type: "reorderSpace"; id: string; beforeId?: string }
  | { type: "createCollection"; spaceId: string; name: string; color: Color }
  | {
      type: "updateCollection";
      id: string;
      name?: string;
      color?: Color;
      starred?: boolean;
      spaceId?: string;
    }
  | { type: "deleteCollection"; id: string }
  | { type: "reorderCollection"; id: string; beforeId?: string }
  | { type: "addLinks"; collectionId: string; links: LinkInput[] }
  | {
      type: "updateLink";
      id: string;
      title: string;
      url: string;
      collectionId: string;
    }
  | { type: "moveLink"; id: string; collectionId: string; beforeId?: string }
  | { type: "deleteLink"; id: string }
  | {
      type: "restore";
      spaces?: Space[];
      collections: Collection[];
      links: SavedLink[];
    }
  | { type: "import"; data: AppData };

export function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("仅支持 http:// 或 https:// 网址");
  return url.href;
}

function name(value: string) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("名称不能为空");
  if (value.trim().length > 120) throw new Error("名称不能超过 120 个字符");
  return value.trim();
}

function color(value: Color): Color {
  if (!COLORS.includes(value)) throw new Error("无效的合集颜色");
  return value;
}

export function initialData(): AppData {
  const now = Date.now();
  const id = crypto.randomUUID();
  return {
    schemaVersion: 2,
    spaces: [
      {
        id: DEFAULT_SPACE_ID,
        name: "我的第一个空间",
        color: "purple",
        createdAt: now,
      },
    ],
    revision: 0,
    collections: [
      {
        id,
        spaceId: DEFAULT_SPACE_ID,
        name: "开始探索",
        color: "coral",
        starred: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    links: [
      { title: "MDN Web Docs", url: "https://developer.mozilla.org/zh-CN/" },
      { title: "GitHub · 发现下一个灵感", url: "https://github.com/explore" },
      {
        title: "Chrome 扩展开发指南",
        url: "https://developer.chrome.com/docs/extensions",
      },
    ].map((link) => ({
      ...link,
      id: crypto.randomUUID(),
      collectionId: id,
      createdAt: now,
    })),
  };
}

export function parseBackup(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") throw new Error("备份格式无效");
  const version = (raw as { schemaVersion?: number }).schemaVersion;
  if (version !== 1 && version !== 2)
    throw new Error("不支持此备份版本，请使用版本 1 或 2 的备份");
  const data = raw as AppData;
  const legacy = version === 1;
  const rawSpaces = legacy
    ? [
        {
          id: DEFAULT_SPACE_ID,
          name: "我的第一个空间",
          color: "purple" as Color,
          createdAt: 0,
        },
      ]
    : data.spaces;
  if (!Array.isArray(rawSpaces) || !rawSpaces.length || rawSpaces.length > 100)
    throw new Error("空间数据无效，最多支持 100 个空间");
  const spaceIds = new Set<string>();
  const spaces = rawSpaces.map((s) => {
    if (!s || typeof s.id !== "string" || !s.id || spaceIds.has(s.id))
      throw new Error("空间 ID 无效或重复");
    spaceIds.add(s.id);
    return {
      id: s.id,
      name: name(s.name),
      color: color(s.color),
      createdAt: validTime(s.createdAt),
    };
  });
  if (!Array.isArray(data.collections) || !Array.isArray(data.links))
    throw new Error("备份缺少合集或链接");
  if (data.collections.length > 1000 || data.links.length > 10000)
    throw new Error("备份过大：最多 1000 个合集、10000 条链接");
  const ids = new Set<string>();
  const collections = data.collections.map((c) => {
    if (!c || typeof c.id !== "string" || !c.id || ids.has(c.id))
      throw new Error("合集 ID 无效或重复");
    ids.add(c.id);
    const spaceId = legacy ? DEFAULT_SPACE_ID : c.spaceId;
    if (!spaceIds.has(spaceId)) throw new Error("合集所属空间无效");
    return {
      id: c.id,
      spaceId,
      name: name(c.name),
      color: color(c.color),
      starred: c.starred === true,
      createdAt: validTime(c.createdAt),
      updatedAt: validTime(c.updatedAt),
    };
  });
  const linkIds = new Set<string>();
  const links = data.links.map((l) => {
    if (
      !l ||
      typeof l.id !== "string" ||
      !l.id ||
      linkIds.has(l.id) ||
      !ids.has(l.collectionId)
    )
      throw new Error("链接 ID 或所属合集无效");
    linkIds.add(l.id);
    if (typeof l.url !== "string") throw new Error("链接网址无效");
    return {
      id: l.id,
      collectionId: l.collectionId,
      title: name(l.title),
      url: normalizeUrl(l.url),
      createdAt: validTime(l.createdAt),
    };
  });
  return {
    schemaVersion: 2,
    spaces,
    revision: Number.isSafeInteger(data.revision) ? data.revision : 0,
    collections,
    links,
  };
}

function validTime(t: number) {
  if (!Number.isFinite(t) || t < 0) throw new Error("备份时间格式无效");
  return t;
}

export function applyCommand(current: AppData, command: Command): AppData {
  const data = structuredClone(current);
  const now = Date.now();
  const getSpace = (id: string) => {
    const space = data.spaces.find((s) => s.id === id);
    if (!space) throw new Error("空间已被删除，请重新选择空间");
    return space;
  };
  const getCollection = (id: string) => {
    const c = data.collections.find((c) => c.id === id);
    if (!c) throw new Error("合集已被删除，请刷新后重试");
    return c;
  };
  const getLink = (id: string) => {
    const l = data.links.find((l) => l.id === id);
    if (!l) throw new Error("链接已被删除，请刷新后重试");
    return l;
  };
  switch (command.type) {
    case "createSpace":
      data.spaces.push({
        id: crypto.randomUUID(),
        name: name(command.name),
        color: color(command.color),
        createdAt: now,
      });
      break;
    case "updateSpace": {
      const space = getSpace(command.id);
      space.name = name(command.name);
      if (command.color !== undefined) space.color = color(command.color);
      break;
    }
    case "reorderSpace": {
      const space = getSpace(command.id);
      if (command.beforeId === space.id) break;
      if (command.beforeId !== undefined) getSpace(command.beforeId);
      data.spaces = data.spaces.filter((item) => item.id !== space.id);
      const index = data.spaces.findIndex(
        (item) => item.id === command.beforeId,
      );
      data.spaces.splice(index < 0 ? data.spaces.length : index, 0, space);
      break;
    }
    case "deleteSpace": {
      getSpace(command.id);
      if (data.spaces.length === 1) throw new Error("请至少保留一个空间");
      const collectionIds = new Set(
        data.collections
          .filter((c) => c.spaceId === command.id)
          .map((c) => c.id),
      );
      data.spaces = data.spaces.filter((s) => s.id !== command.id);
      data.collections = data.collections.filter(
        (c) => !collectionIds.has(c.id),
      );
      data.links = data.links.filter((l) => !collectionIds.has(l.collectionId));
      break;
    }
    case "createCollection":
      getSpace(command.spaceId);
      data.collections.unshift({
        spaceId: command.spaceId,
        id: crypto.randomUUID(),
        name: name(command.name),
        color: color(command.color),
        starred: false,
        createdAt: now,
        updatedAt: now,
      });
      break;
    case "updateCollection": {
      const c = getCollection(command.id);
      if (command.spaceId !== undefined) {
        getSpace(command.spaceId);
        c.spaceId = command.spaceId;
      }
      if (command.name !== undefined) c.name = name(command.name);
      if (command.color !== undefined) c.color = color(command.color);
      if (command.starred !== undefined) c.starred = command.starred;
      c.updatedAt = now;
      break;
    }
    case "deleteCollection":
      getCollection(command.id);
      data.collections = data.collections.filter((c) => c.id !== command.id);
      data.links = data.links.filter((l) => l.collectionId !== command.id);
      break;
    case "reorderCollection": {
      const c = getCollection(command.id);
      if (command.beforeId === c.id) break;
      if (
        command.beforeId &&
        getCollection(command.beforeId).spaceId !== c.spaceId
      )
        throw new Error("请在同一空间中调整合集顺序");
      data.collections = data.collections.filter((item) => item.id !== c.id);
      const index = data.collections.findIndex(
        (item) => item.id === command.beforeId,
      );
      data.collections.splice(
        index < 0 ? data.collections.length : index,
        0,
        c,
      );
      break;
    }
    case "addLinks": {
      const c = getCollection(command.collectionId);
      const urls = new Set(
        data.links.filter((l) => l.collectionId === c.id).map((l) => l.url),
      );
      for (const input of command.links) {
        const url = normalizeUrl(input.url);
        if (urls.has(url)) continue;
        urls.add(url);
        data.links.push({
          id: crypto.randomUUID(),
          collectionId: c.id,
          title: name(input.title || new URL(url).hostname),
          url,
          createdAt: now,
        });
      }
      c.updatedAt = now;
      break;
    }
    case "updateLink": {
      const l = getLink(command.id);
      const target = getCollection(command.collectionId);
      const url = normalizeUrl(command.url);
      if (
        data.links.some(
          (item) =>
            item.id !== l.id &&
            item.collectionId === target.id &&
            item.url === url,
        )
      )
        throw new Error("该合集中已经存在此网址");
      getCollection(l.collectionId).updatedAt = now;
      Object.assign(l, {
        title: name(command.title),
        url,
        collectionId: target.id,
      });
      target.updatedAt = now;
      break;
    }
    case "moveLink": {
      const l = getLink(command.id);
      const target = getCollection(command.collectionId);
      if (
        data.links.some(
          (item) =>
            item.id !== l.id &&
            item.collectionId === target.id &&
            item.url === l.url,
        )
      )
        throw new Error("该合集中已经存在此网址");
      if (command.beforeId === l.id) break;
      getCollection(l.collectionId).updatedAt = now;
      l.collectionId = target.id;
      data.links = data.links.filter((item) => item.id !== l.id);
      const index = data.links.findIndex(
        (item) =>
          item.id === command.beforeId && item.collectionId === target.id,
      );
      data.links.splice(index < 0 ? data.links.length : index, 0, l);
      target.updatedAt = now;
      break;
    }
    case "deleteLink":
      getCollection(getLink(command.id).collectionId).updatedAt = now;
      data.links = data.links.filter((l) => l.id !== command.id);
      break;
    case "restore": {
      for (const space of command.spaces || []) {
        if (!data.spaces.some((s) => s.id === space.id))
          data.spaces.push(space);
      }
      for (const c of command.collections) {
        if (
          data.spaces.some((s) => s.id === c.spaceId) &&
          !data.collections.some((item) => item.id === c.id)
        )
          data.collections.push(c);
      }
      for (const l of command.links) {
        if (
          data.collections.some((c) => c.id === l.collectionId) &&
          !data.links.some(
            (item) =>
              item.id === l.id ||
              (item.collectionId === l.collectionId && item.url === l.url),
          )
        )
          data.links.push(l);
      }
      break;
    }
    case "import": {
      const imported = parseBackup(command.data);
      // Import as new spaces so existing names, edits and hierarchy are preserved.
      const spaceMap = new Map<string, string>();
      for (const space of imported.spaces) {
        const id = crypto.randomUUID();
        spaceMap.set(space.id, id);
        data.spaces.push({ ...space, id });
      }
      for (const c of imported.collections) {
        const id = crypto.randomUUID();
        data.collections.push({ ...c, id, spaceId: spaceMap.get(c.spaceId)! });
        data.links.push(
          ...imported.links
            .filter((l) => l.collectionId === c.id)
            .map((l) => ({ ...l, id: crypto.randomUUID(), collectionId: id })),
        );
      }
      break;
    }
    default:
      throw new Error("未知操作");
  }
  if (
    data.spaces.length > 100 ||
    data.collections.length > 1000 ||
    data.links.length > 10000
  ) {
    throw new Error(
      "已达到容量上限：最多 100 个空间、1000 个合集、10000 条链接，请先整理或导出备份",
    );
  }
  data.revision = current.revision + 1;
  return data;
}
