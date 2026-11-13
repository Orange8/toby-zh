import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { faviconUrl } from "./platform";
export function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SiteIcon({ url }: { url: string }) {
  const src = faviconUrl(url);
  const [image, setImage] = useState<{
    src: string;
    status: "loaded" | "failed";
  }>();
  const loaded = Boolean(
    src && image?.src === src && image.status === "loaded",
  );
  const failed = Boolean(
    src && image?.src === src && image.status === "failed",
  );
  const host = domain(url);
  const hue =
    [...host].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span
      className={`site-icon ${loaded ? "has-logo" : ""}`}
      aria-hidden="true"
      style={
        loaded
          ? undefined
          : {
              background: `hsl(${hue} 45% 94%)`,
              color: `hsl(${hue} 40% 37%)`,
            }
      }
    >
      {!loaded && host.slice(0, 1).toUpperCase()}
      {src && !failed && (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setImage({ src, status: "loaded" })}
          onError={() => setImage({ src, status: "failed" })}
        />
      )}
    </span>
  );
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-content">
        <header>
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭对话框"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
