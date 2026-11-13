import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  COLORS,
  normalizeUrl,
  parseBackup,
  type AppData,
  type Collection,
  type Color,
  type Command,
  type SavedLink,
  type Space,
} from "./model";
import {
  closeSavedTabs,
  isExtension,
  mutate,
  observeTabs,
  openLinks,
  queryTabs,
  readData,
  subscribe,
  type OpenTab,
} from "./platform";
import { CollectionSection } from "./CollectionSection";
import { Dialog, SiteIcon, domain } from "./ui";
import { InlineName } from "./InlineName";
import { CollectionDragPreview } from "./CollectionDragPreview";

type Modal =
  | { type: "space"; space?: Space }
  | { type: "deleteSpace"; space: Space }
  | { type: "collection"; collection?: Collection }
  | { type: "link"; collectionId: string; link?: SavedLink }
  | { type: "save"; tabs: OpenTab[] }
  | { type: "delete"; collection: Collection }
  | { type: "settings" }
  | { type: "import"; data: AppData };
type Notice = { text: string; error?: boolean; undo?: Command };
type DragItem = { type: "link" | "tab" | "collection"; id: string };

export function App() {
  const [data, setData] = useState<AppData>();
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState(
    () => localStorage.getItem("toby-active-space") || "",
  );
  const [search, setSearch] = useState("");
  const [tabSearch, setTabSearch] = useState("");
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [railOpen, setRailOpen] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState("manual");
  const [modal, setModal] = useState<Modal>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string>();
  const [dragOver, setDragOver] = useState<string>();
  const [draggingCollectionId, setDraggingCollectionId] = useState<string>();
  const [spaceDragOver, setSpaceDragOver] = useState<string>();
  const [collectionDrop, setCollectionDrop] = useState<{
    id: string;
    edge: "before" | "after";
  }>();
  const [settledCollectionId, setSettledCollectionId] = useState<string>();
  const [saveTarget, setSaveTarget] = useState("");
  const [color, setColor] = useState<Color>("coral");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyStarred, setOnlyStarred] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<DragItem | undefined>(undefined);
  const collectionDropRef = useRef<typeof collectionDrop>(undefined);
  const dragPreviewRef = useRef<HTMLDivElement>(null);
  const nativeDragImage = useRef<HTMLDivElement>(null);
  const dragPosition = useRef({ x: 0, y: 0 });
  const collectionsRef = useRef<HTMLDivElement>(null);
  const previousLayout = useRef(
    new Map<string, { top: number; left: number }>(),
  );
  const layoutAnimations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const nodes = [
      ...(collectionsRef.current?.querySelectorAll<HTMLElement>(
        "[data-collection]",
      ) || []),
    ];
    const next = new Map(
      nodes.map((node) => [
        node.dataset.collection!,
        { top: node.offsetTop, left: node.offsetLeft },
      ]),
    );
    const orderChanged =
      [...next.keys()].join("|") !==
      [...previousLayout.current.keys()].join("|");
    if (
      orderChanged &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      layoutAnimations.current.forEach((animation) => animation.cancel());
      layoutAnimations.current = [];
      for (const node of nodes) {
        const old = previousLayout.current.get(node.dataset.collection!);
        const current = next.get(node.dataset.collection!)!;
        if (old && (old.top !== current.top || old.left !== current.left)) {
          layoutAnimations.current.push(
            node.animate(
              [
                {
                  transform: `translate(${old.left - current.left}px, ${old.top - current.top}px)`,
                },
                { transform: "translate(0, 0)" },
              ],
              { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" },
            ),
          );
        }
      }
    }
    previousLayout.current = next;
  });

  useEffect(
    () => () =>
      layoutAnimations.current.forEach((animation) => animation.cancel()),
    [],
  );

  useEffect(() => {
    if (!settledCollectionId) return;
    const timer = setTimeout(() => setSettledCollectionId(undefined), 600);
    return () => clearTimeout(timer);
  }, [settledCollectionId]);

  useEffect(() => {
    if (!draggingCollectionId) return;
    let frame = 0;
    const follow = (event: globalThis.DragEvent) => {
      dragPosition.current = {
        x: Math.max(8, Math.min(event.clientX + 18, innerWidth - 284)),
        y: Math.max(8, Math.min(event.clientY + 16, innerHeight - 160)),
      };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { x, y } = dragPosition.current;
        if (dragPreviewRef.current)
          dragPreviewRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    };
    document.addEventListener("dragover", follow);
    return () => {
      document.removeEventListener("dragover", follow);
      cancelAnimationFrame(frame);
    };
  }, [draggingCollectionId]);

  const acceptData = (next: AppData) =>
    setData((old) => (!old || next.revision >= old.revision ? next : old));

  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribe((next) => {
      if (alive) acceptData(next);
    });
    readData()
      .then((next) => {
        if (alive) acceptData(next);
      })
      .catch((error) => {
        if (alive) setLoadError(String(error.message));
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let generation = 0;
    let first = true;
    const refresh = () => {
      const current = ++generation;
      queryTabs()
        .then((next) => {
          if (!alive || current !== generation) return;
          setTabs(next);
          setSelected((old) =>
            first
              ? new Set(next.filter((t) => !t.pinned).map((t) => t.id))
              : new Set([...old].filter((id) => next.some((t) => t.id === id))),
          );
          first = false;
        })
        .catch((error) => {
          if (alive)
            setNotice({ text: `读取标签失败：${error.message}`, error: true });
        });
    };
    const unsubscribe = observeTabs(refresh);
    refresh();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        modal ||
        /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)
      )
        return;
      if (
        event.key === "/" ||
        ((event.metaKey || event.ctrlKey) && event.key === "k")
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setMenu(undefined);
        setSearch("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [modal]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(
      () => setNotice(undefined),
      notice.undo ? 15000 : 6500,
    );
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".space-menu"))
        setMenu(undefined);
    };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, [menu]);

  const activeSpace =
    data?.spaces.find((s) => s.id === filter) || data?.spaces[0];
  const activeFilter = filter === "starred" ? "starred" : activeSpace?.id;
  const spaceCollections =
    data?.collections.filter((c) => c.spaceId === activeSpace?.id) || [];

  function selectSpace(id: string) {
    setFilter(id);
    setSearch("");
    setOnlyStarred(false);
    setMenu(undefined);
    localStorage.setItem("toby-active-space", id);
  }

  function newSpace(space?: Space) {
    setColor(space?.color || "purple");
    setMenu(undefined);
    setModal({ type: "space", space });
  }

  async function commit(command: Command) {
    const next = await mutate(command);
    acceptData(next);
    return next;
  }

  async function task(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : "操作失败，请重试",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function rename(command: Command) {
    if (busy) throw new Error("正在保存，请稍后再试");
    setBusy(true);
    try {
      await commit(command);
    } finally {
      setBusy(false);
    }
  }

  function newCollection(collection?: Collection) {
    setColor(collection?.color || "coral");
    setMenu(undefined);
    setModal({ type: "collection", collection });
  }

  function saveTabs(items: OpenTab[]) {
    if (!items.length) {
      setNotice({
        text: isExtension
          ? "当前没有可保存的网页，请先打开 HTTP/HTTPS 网页"
          : "这是浏览器预览模式。加载 Chrome 扩展后可保存真实标签页。",
      });
      return;
    }
    setSaveTarget(spaceCollections[0]?.id || "__new");
    setModal({ type: "save", tabs: items });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    await task(async () => {
      if (!modal) return;
      if (modal.type === "space") {
        const next = await commit(
          modal.space
            ? {
                type: "updateSpace",
                id: modal.space.id,
                name: value("name"),
                color,
              }
            : { type: "createSpace", name: value("name"), color },
        );
        selectSpace(modal.space?.id || next.spaces[next.spaces.length - 1].id);
        setNotice({ text: modal.space ? "空间已更新" : "新空间已创建" });
      } else if (modal.type === "collection") {
        await commit(
          modal.collection
            ? {
                type: "updateCollection",
                id: modal.collection.id,
                name: value("name"),
                color,
                spaceId: value("spaceId"),
              }
            : {
                type: "createCollection",
                spaceId: activeSpace!.id,
                name: value("name"),
                color,
              },
        );
        setNotice({
          text: modal.collection
            ? "合集已更新"
            : "新合集已创建，开始收集灵感吧",
        });
      } else if (modal.type === "link") {
        const url = normalizeUrl(value("url"));
        const title = value("title") || domain(url);
        if (modal.link)
          await commit({
            type: "updateLink",
            id: modal.link.id,
            title,
            url,
            collectionId: value("collectionId"),
          });
        else {
          const next = await commit({
            type: "addLinks",
            collectionId: modal.collectionId,
            links: [{ title, url }],
          });
          if (next.links.length === data!.links.length) {
            setNotice({ text: "该合集中已经存在此网址" });
            setModal(undefined);
            return;
          }
        }
        setNotice({ text: modal.link ? "链接已更新" : "链接已添加" });
      } else if (modal.type === "save") {
        let collectionId = saveTarget;
        if (collectionId === "__new") {
          const created = await commit({
            type: "createCollection",
            name: value("name"),
            color: "blue",
            spaceId: activeSpace!.id,
          });
          collectionId = created.collections[0].id;
        }
        const before = await readData();
        const next = await commit({
          type: "addLinks",
          collectionId,
          links: modal.tabs,
        });
        // The write must complete before closing any tabs.
        if (form.get("close")) await closeSavedTabs(modal.tabs);
        setNotice({
          text: `已保存到合集，新增 ${next.links.length - before.links.length} 个链接（重复网址自动跳过）`,
        });
      }
      setModal(undefined);
    });
  }

  function exportBackup() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `toby-zh-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ text: "备份已导出" });
  }

  async function importFile(file?: File) {
    if (!file) return;
    await task(async () => {
      if (file.size > 5 * 1024 * 1024) throw new Error("备份文件不能超过 5 MB");
      const parsed = parseBackup(JSON.parse(await file.text()));
      setModal({ type: "import", data: parsed });
    });
  }

  function clearDrag() {
    dragItem.current = undefined;
    setDragOver(undefined);
    setDraggingCollectionId(undefined);
    setSpaceDragOver(undefined);
    collectionDropRef.current = undefined;
    setCollectionDrop(undefined);
  }

  function startDrag(event: DragEvent, item: DragItem) {
    if (busy) {
      event.preventDefault();
      return;
    }
    dragItem.current = item;
    if (item.type === "collection") {
      dragPosition.current = {
        x: Math.max(8, Math.min(event.clientX + 18, innerWidth - 284)),
        y: Math.max(8, Math.min(event.clientY + 16, innerHeight - 160)),
      };
      if (nativeDragImage.current)
        event.dataTransfer.setDragImage(nativeDragImage.current, 0, 0);
    }
    setDraggingCollectionId(item.type === "collection" ? item.id : undefined);
    setSpaceDragOver(undefined);
    event.dataTransfer.setData(
      "application/x-local-toby",
      JSON.stringify(item),
    );
    event.dataTransfer.effectAllowed = item.type === "tab" ? "copy" : "move";
  }

  function overCollection(event: DragEvent, collection: Collection) {
    const item = dragItem.current;
    if (!item) return;
    if (item.type !== "collection") {
      event.preventDefault();
      setDragOver(collection.id);
      return;
    }
    const source = data?.collections.find((c) => c.id === item.id);
    if (
      !source ||
      source.id === collection.id ||
      source.spaceId !== collection.spaceId
    ) {
      collectionDropRef.current = undefined;
      setCollectionDrop(undefined);
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const edge =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (
      collectionDropRef.current?.id !== collection.id ||
      collectionDropRef.current.edge !== edge
    ) {
      collectionDropRef.current = { id: collection.id, edge };
      setCollectionDrop(collectionDropRef.current);
    }
    setDragOver(undefined);
    setSpaceDragOver(undefined);
  }

  function drop(event: DragEvent, collectionId: string, beforeId?: string) {
    event.preventDefault();
    event.stopPropagation();
    const item = dragItem.current;
    const placement = collectionDropRef.current;
    clearDrag();
    if (!item) return;
    void task(async () => {
      if (item.type === "collection") {
        if (sort !== "manual")
          throw new Error("请切换到「手动排序」后拖动合集");
        const target = data?.collections.find((c) => c.id === collectionId);
        const source = data?.collections.find((c) => c.id === item.id);
        if (
          !target ||
          !source ||
          target.id === source.id ||
          target.spaceId !== source.spaceId
        )
          return;
        const siblings = data!.collections.filter(
          (c) => c.spaceId === target.spaceId && c.id !== source.id,
        );
        const targetIndex = siblings.findIndex((c) => c.id === target.id);
        const after = placement?.id === target.id && placement.edge === "after";
        await commit({
          type: "reorderCollection",
          id: item.id,
          beforeId: after ? siblings[targetIndex + 1]?.id : collectionId,
        });
        setSettledCollectionId(item.id);
      } else if (item.type === "link")
        await commit({ type: "moveLink", id: item.id, collectionId, beforeId });
      else {
        const tab = tabs.find((t) => t.id === Number(item.id));
        if (!tab) throw new Error("此标签已关闭");
        const next = await commit({
          type: "addLinks",
          collectionId,
          links: [tab],
        });
        setNotice({
          text:
            next.links.length === data!.links.length
              ? "该合集中已经存在此网址"
              : "标签已保存到合集",
        });
      }
    });
  }

  async function deleteLink(link: SavedLink) {
    await task(async () => {
      await commit({ type: "deleteLink", id: link.id });
      setNotice({
        text: "链接已删除",
        undo: { type: "restore", collections: [], links: [link] },
      });
    });
  }

  if (!data)
    return (
      <main className="loading">
        <div className="brand-symbol">t</div>
        {loadError ? (
          <>
            <h2>暂时无法读取数据</h2>
            <p>{loadError}</p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>正在整理你的空间…</p>
          </>
        )}
      </main>
    );

  const q = search.trim().toLocaleLowerCase();
  const scoped =
    activeFilter === "starred"
      ? data.collections.filter((c) => c.starred)
      : spaceCollections;
  const filtered = scoped.filter((c) => {
    if (onlyStarred && !c.starred) return false;
    return (
      !q ||
      c.name.toLocaleLowerCase().includes(q) ||
      data.links.some(
        (l) =>
          l.collectionId === c.id &&
          `${l.title} ${l.url}`.toLocaleLowerCase().includes(q),
      )
    );
  });
  const collections = [...filtered].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name, "zh-CN")
      : sort === "recent"
        ? b.updatedAt - a.updatedAt
        : 0,
  );
  const selectedTabs = tabs.filter((t) => selected.has(t.id));
  const visibleTabs = tabs.filter((t) =>
    `${t.title} ${t.url}`
      .toLocaleLowerCase()
      .includes(tabSearch.toLocaleLowerCase()),
  );
  const title = activeFilter === "starred" ? "星标合集" : activeSpace!.name;
  const scopedLinkCount = data.links.filter((l) =>
    scoped.some((c) => c.id === l.collectionId),
  ).length;
  const draggedCollection = data.collections.find(
    (c) => c.id === draggingCollectionId,
  );

  return (
    <div
      className={`app ${railOpen ? "" : "rail-hidden"} ${draggedCollection ? "is-collection-dragging" : ""}`}
      aria-busy={busy}
      onDragEnd={clearDrag}
    >
      <div
        ref={nativeDragImage}
        className="native-drag-image"
        aria-hidden="true"
      />
      {draggedCollection && (
        <CollectionDragPreview
          ref={dragPreviewRef}
          collection={draggedCollection}
          count={
            data.links.filter((l) => l.collectionId === draggedCollection.id)
              .length
          }
          targetSpace={data.spaces.find((s) => s.id === spaceDragOver)?.name}
          sorting={Boolean(collectionDrop)}
          position={dragPosition.current}
        />
      )}
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            selectSpace(data.spaces[0].id);
          }}
          aria-label="Toby 中文版首页"
        >
          <span className="brand-symbol">t</span>
          <span>
            toby<span className="brand-dot">.</span>
          </span>
          <span className="local-badge">中文版</span>
        </a>
        <div className="search-box sidebar-search">
          <Search size={16} />
          <input
            ref={searchRef}
            aria-label="搜索合集或链接"
            placeholder="搜索当前空间…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button
              className="icon-button"
              aria-label="清空搜索"
              onClick={() => setSearch("")}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="nav-caption">
          空间
          <span>{draggedCollection ? "拖到其他空间" : data.spaces.length}</span>
        </div>
        <button
          className={`nav-item ${activeFilter === "starred" ? "active" : ""}`}
          onClick={() => {
            setFilter("starred");
            setSearch("");
            setOnlyStarred(false);
          }}
        >
          <Star size={17} />
          星标合集
          <span className="nav-count">
            {data.collections.filter((c) => c.starred).length}
          </span>
        </button>
        <nav className="spaces-list" aria-label="空间列表">
          {data.spaces.map((space) => {
            const canReceive = Boolean(
              draggedCollection && draggedCollection.spaceId !== space.id,
            );
            const hovering = canReceive && spaceDragOver === space.id;
            return (
              <button
                key={space.id}
                className={`nav-item space-nav ${activeFilter === space.id ? "active" : ""} ${canReceive ? "space-drop-ready" : ""} ${hovering ? "space-drop-hover" : ""}`}
                aria-current={activeFilter === space.id ? "page" : undefined}
                onClick={() => selectSpace(space.id)}
                onDragEnter={(e) => {
                  if (canReceive) {
                    e.preventDefault();
                    setSpaceDragOver(space.id);
                  }
                }}
                onDragOver={(e) => {
                  if (canReceive && dragItem.current?.type === "collection") {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setSpaceDragOver(space.id);
                    setDragOver(undefined);
                    collectionDropRef.current = undefined;
                    setCollectionDrop(undefined);
                  } else if (dragItem.current?.type === "collection") {
                    e.dataTransfer.dropEffect = "none";
                  }
                }}
                onDragLeave={(e) => {
                  if (
                    !e.currentTarget.contains(e.relatedTarget as Node | null)
                  ) {
                    setSpaceDragOver((current) =>
                      current === space.id ? undefined : current,
                    );
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const item = dragItem.current;
                  clearDrag();
                  if (item?.type === "collection" && canReceive)
                    void task(async () => {
                      await commit({
                        type: "updateCollection",
                        id: item.id,
                        spaceId: space.id,
                      });
                      setNotice({ text: `合集已移入「${space.name}」` });
                    });
                }}
              >
                <span className={`space-symbol ${space.color}`}>
                  {space.name.slice(0, 1)}
                </span>
                <span className="space-nav-label">
                  <span className="truncate">{space.name}</span>
                  {canReceive && (
                    <span className="space-drop-caption">
                      {hovering ? "松开移入此空间" : "拖到这里移动合集"}
                    </span>
                  )}
                </span>
                {canReceive ? (
                  <span className="space-drop-icon" aria-hidden="true">
                    <ArrowDownToLine size={16} />
                  </span>
                ) : (
                  <span className="nav-count">
                    {
                      data.collections.filter((c) => c.spaceId === space.id)
                        .length
                    }
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <button className="create-space" onClick={() => newSpace()}>
          <Plus size={17} />
          创建空间
        </button>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => setModal({ type: "settings" })}
          >
            <Settings size={17} />
            设置与备份
          </button>
          <div className="profile">
            <span className="profile-avatar">我</span>
            <span>
              我的浏览器空间
              <small>
                {isExtension ? "数据仅保存在本机" : "预览数据仅本地保存"}
              </small>
            </span>
            <LockKeyhole size={13} />
          </div>
        </div>
      </aside>
      <section className="main-shell">
        <header className="space-header">
          <div className="space-heading">
            <span
              className={`space-title-dot ${activeFilter === "starred" ? "amber" : activeSpace!.color}`}
            />
            <h1 aria-label={title}>
              {activeFilter === "starred" ? (
                title
              ) : (
                <InlineName
                  key={activeSpace!.id}
                  value={title}
                  label="空间"
                  disabled={busy}
                  onSave={(name) =>
                    rename({ type: "updateSpace", id: activeSpace!.id, name })
                  }
                />
              )}
            </h1>
            <div className="space-stats">
              <span>{scoped.length} 个合集</span>
              <span>{scopedLinkCount} 个标签</span>
            </div>
          </div>
          <div className="topbar-actions">
            {!isExtension && <span className="preview-badge">浏览器预览</span>}
            <span className="saved-indicator">
              {busy ? (
                "正在保存…"
              ) : (
                <>
                  <Check size={13} />
                  仅本地保存
                </>
              )}
            </span>
            {activeFilter !== "starred" && (
              <div className="collection-menu space-menu">
                <button
                  className="icon-button"
                  aria-label="空间更多操作"
                  aria-expanded={menu === "space"}
                  onClick={() =>
                    setMenu(menu === "space" ? undefined : "space")
                  }
                >
                  <MoreHorizontal size={19} />
                </button>
                {menu === "space" && (
                  <div className="dropdown">
                    <button onClick={() => newSpace(activeSpace)}>
                      <Pencil size={14} />
                      编辑空间
                    </button>
                    <button
                      className="danger-text"
                      disabled={data.spaces.length === 1}
                      title={
                        data.spaces.length === 1
                          ? "请至少保留一个空间"
                          : undefined
                      }
                      onClick={() => {
                        setMenu(undefined);
                        setModal({ type: "deleteSpace", space: activeSpace! });
                      }}
                    >
                      <Trash2 size={14} />
                      删除空间
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              className="icon-button"
              aria-label={railOpen ? "收起标签栏" : "展开标签栏"}
              onClick={() => setRailOpen(!railOpen)}
            >
              {railOpen ? (
                <PanelRightClose size={19} />
              ) : (
                <PanelRightOpen size={19} />
              )}
            </button>
          </div>
        </header>
        <div className="collection-toolbar">
          <div className="toolbar-options">
            <label className="sort-select">
              <GripVertical size={15} />
              <select
                aria-label="合集排序"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="manual">手动排序</option>
                <option value="recent">最近更新</option>
                <option value="name">名称排序</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <label className="sort-select">
              <Star size={14} />
              <select
                aria-label="筛选合集"
                value={onlyStarred ? "starred" : "all"}
                onChange={(e) => setOnlyStarred(e.target.value === "starred")}
              >
                <option value="all">全部合集</option>
                <option value="starred">仅星标</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <div className="view-toggle">
              <button
                aria-label="网格视图"
                aria-pressed={view === "grid"}
                className={view === "grid" ? "selected" : ""}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                aria-label="列表视图"
                aria-pressed={view === "list"}
                className={view === "list" ? "selected" : ""}
                onClick={() => setView("list")}
              >
                <List size={17} />
              </button>
            </div>
            <span className="toolbar-divider" />
            <button
              className="icon-button tooltip"
              aria-label="展开所有合集"
              data-tooltip="展开所有合集"
              onClick={() => setCollapsed(new Set())}
            >
              <Plus size={17} />
            </button>
            <button
              className="icon-button tooltip"
              aria-label="折叠所有合集"
              data-tooltip="折叠所有合集"
              onClick={() =>
                setCollapsed(new Set(collections.map((c) => c.id)))
              }
            >
              <span className="minus-icon">−</span>
            </button>
          </div>
          <button
            className="button primary"
            onClick={() => {
              if (activeFilter === "starred") selectSpace(activeSpace!.id);
              newCollection();
            }}
          >
            <Plus size={16} />
            新建合集
          </button>
        </div>
        <main className="main-content">
          {q && (
            <div className="search-summary">
              「{search}」· 找到 {collections.length} 个合集
              <button onClick={() => setSearch("")}>清空搜索</button>
            </div>
          )}
          <div ref={collectionsRef} className={`collections ${view}`}>
            {collections.map((c) => (
              <CollectionSection
                key={c.id}
                collection={c}
                links={data.links.filter((l) => l.collectionId === c.id)}
                query={q}
                busy={busy}
                collapsed={!q && collapsed.has(c.id)}
                canDrag={!q && sort === "manual"}
                dragOver={dragOver === c.id}
                dragging={draggingCollectionId === c.id}
                collectionDragActive={Boolean(draggingCollectionId)}
                dropEdge={
                  collectionDrop?.id === c.id ? collectionDrop.edge : undefined
                }
                settling={settledCollectionId === c.id}
                spaceName={
                  activeFilter === "starred"
                    ? data.spaces.find((s) => s.id === c.spaceId)?.name
                    : undefined
                }
                onToggle={() =>
                  setCollapsed((old) => {
                    const next = new Set(old);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    return next;
                  })
                }
                onEdit={() => newCollection(c)}
                onRename={(name) =>
                  rename({ type: "updateCollection", id: c.id, name })
                }
                onAdd={() => setModal({ type: "link", collectionId: c.id })}
                onStar={() =>
                  void task(async () => {
                    await commit({
                      type: "updateCollection",
                      id: c.id,
                      starred: !c.starred,
                    });
                  })
                }
                onDelete={() => setModal({ type: "delete", collection: c })}
                onMove={(direction) =>
                  void task(async () => {
                    const siblings = data.collections.filter(
                      (item) => item.spaceId === c.spaceId,
                    );
                    const index = siblings.findIndex(
                      (item) => item.id === c.id,
                    );
                    if (direction === -1 && index > 0)
                      await commit({
                        type: "reorderCollection",
                        id: c.id,
                        beforeId: siblings[index - 1].id,
                      });
                    if (direction === 1 && index < siblings.length - 1)
                      await commit({
                        type: "reorderCollection",
                        id: c.id,
                        beforeId: siblings[index + 2]?.id,
                      });
                  })
                }
                onOpen={() =>
                  void task(async () => {
                    const urls = data.links
                      .filter((l) => l.collectionId === c.id)
                      .map((l) => l.url);
                    await openLinks(urls, true);
                    setNotice({
                      text: isExtension
                        ? `已在新窗口打开 ${urls.length} 个链接`
                        : "已请求打开链接；预览模式可能受浏览器弹窗限制",
                    });
                  })
                }
                onEditLink={(link) =>
                  setModal({ type: "link", collectionId: c.id, link })
                }
                onDeleteLink={(link) => void deleteLink(link)}
                onDragStart={startDrag}
                onDrop={(event, beforeId) => drop(event, c.id, beforeId)}
                onDragOver={(event) => overCollection(event, c)}
                onDragLeave={() => {
                  setDragOver(undefined);
                  if (collectionDropRef.current?.id === c.id) {
                    collectionDropRef.current = undefined;
                    setCollectionDrop(undefined);
                  }
                }}
              />
            ))}
          </div>
          {!collections.length && (
            <div className="space-empty">
              {q ? (
                <Search size={30} />
              ) : activeFilter === "starred" ? (
                <Star size={30} />
              ) : (
                <FolderPlus size={34} />
              )}
              <h2>
                {q
                  ? "没有找到相关内容"
                  : activeFilter === "starred" || onlyStarred
                    ? "还没有星标合集"
                    : "为这个空间创建第一个合集"}
              </h2>
              <p>
                {q
                  ? "试试其他标题或网址，搜索仅在当前视图中进行。"
                  : activeFilter === "starred" || onlyStarred
                    ? "点击合集旁的星星，把常用内容留在手边。"
                    : "把同一个项目的网页放在一起，随时接着上次的思路。"}
              </p>
              {!q && activeFilter !== "starred" && !onlyStarred && (
                <button className="button" onClick={() => newCollection()}>
                  <Plus size={15} />
                  新建合集
                </button>
              )}
            </div>
          )}
        </main>
      </section>

      {railOpen && (
        <aside className="tabs-rail">
          <header>
            <div>
              <span className="rail-icon">
                <Monitor size={17} />
              </span>
              <h2>当前窗口</h2>
              <span className="link-count">{tabs.length}</span>
            </div>
            <button
              className="icon-button"
              aria-label="收起当前窗口"
              onClick={() => setRailOpen(false)}
            >
              <PanelRightClose size={18} />
            </button>
          </header>
          <p className="rail-description">收好打开的网页，为专注腾出空间。</p>
          <button
            className="button primary save-window"
            disabled={busy}
            onClick={() => saveTabs(tabs.filter((t) => !t.pinned))}
          >
            <ArrowDownToLine size={16} />
            保存当前窗口
          </button>
          <div className="rail-divider" />
          <div className="rail-selection">
            <label>
              <input
                type="checkbox"
                aria-label="全选当前标签"
                checked={tabs.length > 0 && selected.size === tabs.length}
                disabled={!tabs.length}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? new Set(tabs.map((t) => t.id))
                      : new Set(),
                  )
                }
              />
              <span>
                {selected.size
                  ? `已选择 ${selected.size} 个标签`
                  : "打开的标签"}
              </span>
            </label>
            <span title="仅显示 HTTP/HTTPS 网页">{tabs.length}</span>
          </div>
          <div className="search-box tab-search">
            <Search size={15} />
            <input
              aria-label="搜索当前标签"
              value={tabSearch}
              onChange={(e) => setTabSearch(e.target.value)}
              placeholder="查找打开的标签…"
            />
          </div>
          <div className="open-tabs">
            {visibleTabs.map((t) => (
              <div
                className="open-tab"
                key={t.id}
                draggable
                onDragStart={(e) =>
                  startDrag(e, { type: "tab", id: String(t.id) })
                }
              >
                <input
                  type="checkbox"
                  aria-label={`选择 ${t.title}`}
                  checked={selected.has(t.id)}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      return next;
                    })
                  }
                />
                <SiteIcon url={t.url} />
                <div>
                  <strong title={t.title}>{t.title}</strong>
                  <span>
                    {domain(t.url)}
                    {t.pinned ? " · 已固定" : ""}
                  </span>
                </div>
                <GripVertical size={14} className="tab-grip" />
              </div>
            ))}
            {!visibleTabs.length && (
              <div className="rail-empty">
                <span>
                  <BookOpen size={30} />
                </span>
                <h3>
                  {!isExtension
                    ? "准备好整理你的标签了吗？"
                    : tabs.length
                      ? "没有匹配的标签"
                      : "从一个网页开始"}
                </h3>
                <p>
                  {!isExtension
                    ? "当前是界面预览。将 dist 文件夹加载为 Chrome 扩展后，这里会显示真实的标签页。"
                    : tabs.length
                      ? "试试其他标题或网址。"
                      : "打开几个网页，再回到这里。Chrome 内置页面不会出现在列表中。"}
                </p>
                {!isExtension && (
                  <button onClick={() => setModal({ type: "settings" })}>
                    查看安装方法
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          {selectedTabs.length > 0 && (
            <button
              className="button save-selected"
              disabled={busy}
              onClick={() => saveTabs(selectedTabs)}
            >
              <FolderPlus size={16} />
              将所选标签保存到合集
            </button>
          )}
          <div className="rail-tip">
            <span className="tip-icon">
              <Sparkles size={15} />
            </span>
            <p>
              试着把标签拖进合集
              <br />
              <span>整理，也可以很轻松。</span>
            </p>
          </div>
        </aside>
      )}

      <input
        ref={importRef}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="导入备份文件"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{notice.text}</span>
          {notice.undo && (
            <button
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await commit(notice.undo!);
                  setNotice({ text: "已撤销删除" });
                })
              }
            >
              撤销
            </button>
          )}
          <button
            className="icon-button"
            aria-label="关闭通知"
            onClick={() => setNotice(undefined)}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {modal && (
        <Dialog
          title={
            modal.type === "space"
              ? modal.space
                ? "编辑空间"
                : "创建空间"
              : modal.type === "deleteSpace"
                ? "删除这个空间？"
                : modal.type === "collection"
                  ? modal.collection
                    ? "编辑合集"
                    : "创建新合集"
                  : modal.type === "link"
                    ? modal.link
                      ? "编辑链接"
                      : "添加链接"
                    : modal.type === "save"
                      ? "把灵感收进合集"
                      : modal.type === "delete"
                        ? "删除这个合集？"
                        : modal.type === "import"
                          ? "导入备份"
                          : "设置与备份"
          }
          onClose={() => {
            if (!busy) setModal(undefined);
          }}
        >
          {["space", "collection", "link", "save"].includes(modal.type) && (
            <form onSubmit={(e) => void submit(e)}>
              {(modal.type === "collection" || modal.type === "space") && (
                <>
                  <p className="dialog-description">
                    {modal.type === "space"
                      ? "用空间区分不同项目，每个空间里都可以创建多个合集。"
                      : "给相关的网页一个共同的归处。"}
                  </p>
                  <label className="field">
                    {modal.type === "space" ? "空间名称" : "合集名称"}
                    <input
                      name="name"
                      placeholder="例如：下一个好点子"
                      defaultValue={
                        modal.type === "space"
                          ? modal.space?.name
                          : modal.collection?.name
                      }
                      maxLength={120}
                      required
                      autoFocus
                    />
                  </label>
                  {modal.type === "collection" && modal.collection && (
                    <label className="field">
                      所属空间
                      <select
                        name="spaceId"
                        defaultValue={modal.collection.spaceId}
                      >
                        {data.spaces.map((space) => (
                          <option key={space.id} value={space.id}>
                            {space.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <fieldset className="color-field">
                    <legend>标记颜色</legend>
                    <div>
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`color-choice ${c} ${color === c ? "chosen" : ""}`}
                          aria-label={`颜色 ${c}`}
                          aria-pressed={color === c}
                          onClick={() => setColor(c)}
                        >
                          {color === c && <Check size={17} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              {modal.type === "link" && (
                <>
                  <label className="field">
                    网址
                    <input
                      name="url"
                      type="url"
                      placeholder="https://"
                      defaultValue={modal.link?.url}
                      required
                      autoFocus
                    />
                  </label>
                  <label className="field">
                    标题<span className="field-hint">选填，默认使用域名</span>
                    <input
                      name="title"
                      placeholder="给这个链接起个名字"
                      defaultValue={modal.link?.title}
                      maxLength={120}
                    />
                  </label>
                  {modal.link && (
                    <label className="field">
                      所属合集
                      <select
                        name="collectionId"
                        defaultValue={modal.link.collectionId}
                      >
                        {data.collections.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              {modal.type === "save" && (
                <>
                  <p className="dialog-description">
                    保存 {modal.tabs.length}{" "}
                    个标签。同一合集中的重复网址会自动跳过。
                  </p>
                  <label className="field">
                    保存到
                    <select
                      value={saveTarget}
                      onChange={(e) => setSaveTarget(e.target.value)}
                    >
                      {spaceCollections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__new">＋ 创建一个新合集</option>
                    </select>
                  </label>
                  {saveTarget === "__new" && (
                    <label className="field">
                      新合集名称
                      <input
                        name="name"
                        placeholder="例如：今天的工作"
                        maxLength={120}
                        required
                        autoFocus
                      />
                    </label>
                  )}
                  <label className="checkbox-field">
                    <input type="checkbox" name="close" />
                    保存成功后关闭这些标签
                  </label>
                  <p className="form-note">
                    固定标签和保存过程中已跳转的标签会保留。
                  </p>
                  <div className="save-preview">
                    {modal.tabs.slice(0, 4).map((t) => (
                      <div key={t.id}>
                        <SiteIcon url={t.url} />
                        <span>{t.title}</span>
                      </div>
                    ))}
                    {modal.tabs.length > 4 && (
                      <span>还有 {modal.tabs.length - 4} 个标签…</span>
                    )}
                  </div>
                </>
              )}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => setModal(undefined)}
                >
                  取消
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  {modal.type === "space" && !modal.space
                    ? "创建空间"
                    : modal.type === "collection" && !modal.collection
                      ? "创建合集"
                      : "保存"}
                </button>
              </div>
            </form>
          )}
          {modal.type === "deleteSpace" && (
            <>
              <p className="dialog-description">
                删除「{modal.space.name}」会同时删除其中的{" "}
                {
                  data.collections.filter((c) => c.spaceId === modal.space.id)
                    .length
                }{" "}
                个合集及其标签。删除后可在提示条中撤销。
              </p>
              <div className="dialog-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setModal(undefined)}
                >
                  保留空间
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const space = data.spaces.find(
                        (s) => s.id === modal.space.id,
                      );
                      if (!space) throw new Error("空间已被删除");
                      const collections = data.collections.filter(
                        (c) => c.spaceId === space.id,
                      );
                      const links = data.links.filter((l) =>
                        collections.some((c) => c.id === l.collectionId),
                      );
                      const next = await commit({
                        type: "deleteSpace",
                        id: space.id,
                      });
                      selectSpace(next.spaces[0].id);
                      setModal(undefined);
                      setNotice({
                        text: "空间已删除",
                        undo: {
                          type: "restore",
                          spaces: [space],
                          collections,
                          links,
                        },
                      });
                    })
                  }
                >
                  <Trash2 size={15} />
                  删除空间
                </button>
              </div>
            </>
          )}
          {modal.type === "delete" && (
            <>
              <p className="dialog-description">
                「{modal.collection.name}」及其中的{" "}
                {
                  data.links.filter(
                    (l) => l.collectionId === modal.collection.id,
                  ).length
                }{" "}
                个链接将被删除。删除后可在提示条中撤销。
              </p>
              <div className="dialog-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setModal(undefined)}
                >
                  保留合集
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      const collection = data.collections.find(
                        (c) => c.id === modal.collection.id,
                      );
                      if (!collection) throw new Error("合集已被删除");
                      const links = data.links.filter(
                        (l) => l.collectionId === collection.id,
                      );
                      await commit({
                        type: "deleteCollection",
                        id: collection.id,
                      });
                      setModal(undefined);
                      setNotice({
                        text: "合集已删除",
                        undo: {
                          type: "restore",
                          collections: [collection],
                          links,
                        },
                      });
                    })
                  }
                >
                  <Trash2 size={15} />
                  删除合集
                </button>
              </div>
            </>
          )}
          {modal.type === "import" && (
            <>
              <p className="dialog-description">
                检测到 {modal.data.spaces.length} 个空间、
                {modal.data.collections.length} 个合集、
                {modal.data.links.length}{" "}
                个链接。导入会创建新的空间并保留合集归属，现有内容会保留；重复导入同一文件也会创建副本。
              </p>
              <div className="dialog-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setModal(undefined)}
                >
                  取消
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await commit({ type: "import", data: modal.data });
                      setModal(undefined);
                      setNotice({ text: "备份已导入，现有内容已保留" });
                    })
                  }
                >
                  <Upload size={15} />
                  确认导入
                </button>
              </div>
            </>
          )}
          {modal.type === "settings" && (
            <>
              <div className="settings-privacy">
                <LockKeyhole size={23} />
                <div>
                  <strong>数据只保存在本机</strong>
                  <p>
                    空间、合集和标签保存在当前浏览器中。换电脑时，请先导出 JSON
                    备份，再在另一台电脑导入。卸载扩展或清除浏览器数据前，请保存备份文件。
                  </p>
                </div>
              </div>
              <div className="backup-stats">
                <span>
                  <strong>{data.collections.length}</strong> 个合集
                </span>
                <span>
                  <strong>{data.links.length}</strong> 个链接
                </span>
              </div>
              <div className="backup-actions">
                <button className="button" onClick={exportBackup}>
                  <Download size={17} />
                  导出 JSON 备份
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={17} />
                  导入备份
                </button>
              </div>
              {!isExtension && (
                <div className="install-guide">
                  <h3>
                    <Monitor size={16} />在 Chrome 中使用
                  </h3>
                  <ol>
                    <li>
                      在项目目录运行 <code>npm run build</code>。
                    </li>
                    <li>
                      打开 <code>chrome://extensions</code>，开启开发者模式。
                    </li>
                    <li>
                      点击「加载已解压的扩展程序」，选择项目的 <code>dist</code>{" "}
                      文件夹。
                    </li>
                    <li>打开新标签页，开始整理。</li>
                  </ol>
                  <p>预览模式和扩展模式的数据相互独立，可用 JSON 备份迁移。</p>
                </div>
              )}
              <p className="settings-footer">
                Toby 中文版 · v0.1.0<span>给好想法，一个位置。</span>
              </p>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
