import { forwardRef } from "react";
import { Folder, GripVertical } from "lucide-react";
import type { Collection } from "./model";

export const CollectionDragPreview = forwardRef<
  HTMLDivElement,
  {
    collection: Collection;
    count: number;
    targetSpace?: string;
    sorting: boolean;
    position: { x: number; y: number };
  }
>(function CollectionDragPreview(
  { collection, count, targetSpace, sorting, position },
  ref,
) {
  return (
    <div
      ref={ref}
      className="collection-drag-preview"
      aria-hidden="true"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <div
        className={`drag-preview-card ${targetSpace || sorting ? "has-target" : ""}`}
      >
        <div className="drag-preview-heading">
          <span className={`drag-preview-folder ${collection.color}`}>
            <Folder size={20} />
          </span>
          <strong>{collection.name}</strong>
          <GripVertical size={16} />
        </div>
        <div className="drag-preview-count">{count} 个标签将一起移动</div>
        <div className="drag-preview-hint">
          {targetSpace
            ? `松开移入「${targetSpace}」`
            : sorting
              ? "松开调整合集顺序"
              : "拖到合集之间排序，或移入左侧空间"}
        </div>
      </div>
    </div>
  );
});
