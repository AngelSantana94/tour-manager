import { useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, Pencil, X } from "lucide-react";
import {
  renameDirectoryItem,
  type DirectoryItem,
} from "./Services/Directory.adapter";
import DirectoryMergeModal from "./DirectoryMergeModal";
import {
  errorMessage,
  findSimilarIds,
  KIND_LABEL,
  type ListKind,
} from "./DirectoryUtils";

export interface DirectoryListProps {
  kind: ListKind;
  items: DirectoryItem[];
  /** Se llama tras renombrar o fusionar para recargar el directorio. */
  onChanged: () => Promise<void>;
}

export default function DirectoryList({
  kind,
  items,
  onChanged,
}: DirectoryListProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false);

  const similarIds = useMemo(() => findSimilarIds(items), [items]);
  const chosen = items.filter((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(item: DirectoryItem) {
    setEditingId(item.id);
    setDraft(item.name);
  }

  async function saveRename(item: DirectoryItem) {
    const name = draft.trim();
    if (!name || name === item.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await renameDirectoryItem(kind, item.id, name);
      setEditingId(null);
      await onChanged();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm opacity-50 px-1 py-6">
        No hay {KIND_LABEL[kind]}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {similarIds.size > 0 && (
        <p className="text-xs text-amber-700 flex items-center gap-1.5 px-1">
          <AlertTriangle size={13} />
          Hay nombres parecidos. Márcalos y pulsa «Fusionar» si son el mismo.
        </p>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-xl border border-base-content/10 bg-base-100 px-3 py-2"
        >
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={selected.has(item.id)}
            onChange={() => toggle(item.id)}
            aria-label={`Seleccionar ${item.name}`}
          />

          {editingId === item.id ? (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename(item);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="input input-bordered input-sm flex-1 min-w-0"
            />
          ) : (
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-sm font-bold truncate">{item.name}</span>
              {similarIds.has(item.id) && (
                <span className="badge badge-warning badge-sm shrink-0">
                  Posible duplicado
                </span>
              )}
              {item.phone && (
                <span className="text-xs opacity-50 truncate hidden sm:inline">
                  +{item.phone}
                </span>
              )}
            </div>
          )}

          <span className="text-xs opacity-50 shrink-0">
            {item.tours} tours
          </span>

          {editingId === item.id ? (
            <div className="flex gap-1 shrink-0">
              <button
                className="btn btn-success btn-xs btn-square"
                onClick={() => saveRename(item)}
                disabled={busy}
                aria-label="Guardar nombre"
              >
                <Check size={14} />
              </button>
              <button
                className="btn btn-ghost btn-xs btn-square"
                onClick={() => setEditingId(null)}
                disabled={busy}
                aria-label="Cancelar"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-xs btn-square shrink-0"
              onClick={() => startEdit(item)}
              aria-label={`Renombrar ${item.name}`}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      ))}

      {chosen.length >= 2 && (
        <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-xl bg-base-100 border border-primary/30 shadow-lg px-4 py-2">
          <span className="text-sm font-semibold">
            {chosen.length} seleccionados
          </span>
          <button
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => setMerging(true)}
          >
            <GitMerge size={15} />
            Fusionar
          </button>
        </div>
      )}

      {merging && chosen.length >= 2 && (
        <DirectoryMergeModal
          kind={kind}
          items={chosen}
          onClose={() => setMerging(false)}
          onDone={async () => {
            setSelected(new Set());
            setMerging(false);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}