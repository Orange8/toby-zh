import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Collection, SavedLink } from "./model";
import { domain, SiteIcon } from "./ui";
import { InlineName } from "./InlineName";

type Props = {
  collection: Collection;
  links: SavedLink[];
  query: string;
  busy: boolean;
  collapsed: boolean;
  canDrag: boolean;
  dragOver: boolean;
  dragging: boolean;
  collectionDragActive: boolean;
  dropEdge?: "before" | "after";
  settling: boolean;
  spaceName?: string;
  onToggle: () => void;
  onEdit: () => void;
  onRename: (name: string) => Promise<void>;
  onAdd: () => void;
  onStar: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onOpen: () => void;
  onEditLink: (link: SavedLink) => void;
  onDeleteLink: (link: SavedLink) => void;
  onDragStart: (
    event: DragEvent,
    item: { type: "link" | "collection"; id: string },
  ) => void;
  onDrop: (event: DragEvent, beforeId?: string) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
};

export function CollectionSection(props: Props) {
  const { collection: c, query, collapsed, links, busy } = props;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const visible = links.filter(
    (l) =>
      !query ||
      c.name.toLocaleLowerCase().includes(query) ||
      `${l.title} ${l.url}`.toLocaleLowerCase().includes(query),
  );
  const action = (fn: () => void) => {
    setMenu(false);
    fn();
  };
  return (
    <article
      className={`collection-card ${props.dragOver ? "drag-over" : ""} ${props.dragging ? "is-dragging" : ""} ${props.settling ? "is-settling" : ""}`}
      data-collection={c.id}
      onDragOver={(e) => {
        props.onDragOver(e);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          props.onDragLeave();
      }}
      onDrop={(e) => props.onDrop(e)}
    >
      {props.dropEdge && (
        <div
          className={`collection-drop-marker ${props.dropEdge}`}
          aria-hidden="true"
        >
          <span /> <em>放在这里</em>
        </div>
      )}
      {props.dragging && (
        <span className="collection-drag-origin-label">正在移动合集</span>
      )}
      <header className="card-header">
        <div className="collection-heading">
          <div
            className="card-title"
            draggable={props.canDrag}
            onDragStart={(e) => {
              if (e.currentTarget.querySelector("input")) {
                e.preventDefault();
                return;
              }
              props.onDragStart(e, { type: "collection", id: c.id });
            }}
            title="拖动标题可调整顺序，也可移入左侧其他空间"
          >
            <GripVertical size={15} className="grip" />
            <span className={`collection-color ${c.color}`} />
            <h2 aria-label={c.name}>
              <InlineName
                value={c.name}
                label="合集"
                disabled={busy}
                onSave={props.onRename}
              />
            </h2>
          </div>
          <button
            className="icon-button collection-collapse"
            aria-label={`${collapsed ? "展开" : "折叠"} ${c.name}`}
            aria-expanded={!collapsed}
            aria-controls={`links-${c.id}`}
            onClick={props.onToggle}
          >
            <ChevronDown
              size={15}
              style={{ transform: collapsed ? "rotate(-90deg)" : undefined }}
            />
          </button>
          {props.spaceName && (
            <span className="origin-space">{props.spaceName}</span>
          )}
        </div>
        <div className="card-header-actions">
          <button
            className="icon-button"
            aria-label={`${c.name} 打开全部`}
            title="在新窗口打开全部"
            disabled={busy || !links.length}
            onClick={props.onOpen}
          >
            <ArrowUpRight size={17} />
          </button>
          <button
            className="icon-button tooltip"
            aria-label={`${c.name} 添加链接`}
            data-tooltip="添加链接"
            onClick={props.onAdd}
          >
            <Plus size={17} />
          </button>
          <button
            className={`icon-button star-button ${c.starred ? "is-starred" : ""}`}
            aria-label={`${c.starred ? "取消星标" : "星标"} ${c.name}`}
            title={c.starred ? "取消星标" : "星标合集"}
            disabled={busy}
            onClick={props.onStar}
          >
            <Star size={16} fill={c.starred ? "currentColor" : "none"} />
          </button>
          <div className="collection-menu" ref={menuRef}>
            <button
              className="icon-button"
              aria-label={`${c.name} 更多操作`}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={19} />
            </button>
            {menu && (
              <div className="dropdown">
                <button onClick={() => action(props.onEdit)}>
                  <Pencil size={14} />
                  编辑合集
                </button>
                <button
                  disabled={busy}
                  onClick={() => action(() => props.onMove(-1))}
                >
                  <ArrowUp size={14} />
                  向上移动
                </button>
                <button
                  disabled={busy}
                  onClick={() => action(() => props.onMove(1))}
                >
                  <ArrowDown size={14} />
                  向下移动
                </button>
                <button
                  className="danger-text"
                  onClick={() => action(props.onDelete)}
                >
                  <Trash2 size={14} />
                  删除合集
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="collection-meta">
        {links.length} 个标签
        {query &&
          visible.length !== links.length &&
          ` · 匹配 ${visible.length} 个`}
      </div>
      <div className="collection-body" id={`links-${c.id}`} hidden={collapsed}>
        <div className="card-links">
          {visible.map((l) => (
            <div
              className="link-row"
              key={l.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                props.onDragStart(e, { type: "link", id: l.id });
              }}
              onDragOver={(e) => {
                if (props.collectionDragActive) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => props.onDrop(e, l.id)}
            >
              <a href={l.url} target="_blank" rel="noreferrer" title={l.url}>
                <div className="link-title">
                  <SiteIcon url={l.url} />
                  <strong>{l.title}</strong>
                </div>
                <span className="link-domain">{domain(l.url)}</span>
              </a>
              <div className="link-actions">
                <button
                  className="icon-button"
                  aria-label={`编辑 ${l.title}`}
                  onClick={() => props.onEditLink(l)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`删除 ${l.title}`}
                  disabled={busy}
                  onClick={() => props.onDeleteLink(l)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {!visible.length && (
          <div className="card-empty">
            <p>这个合集还没有标签</p>
            <span>将右侧标签拖到这里，或点击右上角 ＋ 添加链接</span>
          </div>
        )}
      </div>
    </article>
  );
}
