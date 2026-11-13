import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  label: string;
  disabled?: boolean;
  onSave: (name: string) => Promise<void>;
};

export function InlineName({ value, label, disabled, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const finished = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  function cancel() {
    if (inFlight.current) return;
    finished.current = true;
    setEditing(false);
    setError("");
  }

  async function save() {
    if (finished.current || inFlight.current) return;
    const name = draft.trim();
    if (!name) {
      setError("名称不能为空");
      return;
    }
    if (name === value) {
      cancel();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(name);
      finished.current = true;
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试");
      input.current?.focus();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <span className="inline-name">
      {editing ? (
        <input
          ref={input}
          className="inline-name-input"
          aria-label={`${label}名称`}
          aria-invalid={Boolean(error)}
          title="Enter 保存 · Esc 取消"
          value={draft}
          maxLength={120}
          readOnly={saving}
          draggable={false}
          onDragStart={(e) => e.stopPropagation()}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void save();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="inline-name-button"
          aria-label={`重命名${label} ${value}`}
          title={`点击重命名${label}`}
          disabled={disabled}
          onClick={() => {
            finished.current = false;
            setDraft(value);
            setError("");
            setEditing(true);
          }}
        >
          {value}
        </button>
      )}
      {error && (
        <span className="inline-name-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
