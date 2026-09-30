import { useState } from "react";
import {
  mergeDirectoryItems,
  renameDirectoryItem,
  type DirectoryItem,
} from "./Services/Directory.adapter";
import { errorMessage, KIND_LABEL, type ListKind } from "./DirectoryUtils";

interface DirectoryMergeModalProps {
  kind: ListKind;
  /** Los elementos seleccionados para fusionar (2 o más). */
  items: DirectoryItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

export default function DirectoryMergeModal({
  kind,
  items,
  onClose,
  onDone,
}: DirectoryMergeModalProps) {
  const [keepId, setKeepId] = useState(items[0].id);
  const [name, setName] = useState(items[0].name);
  const [busy, setBusy] = useState(false);

  const keep = items.find((i) => i.id === keepId) ?? items[0];

  function pick(item: DirectoryItem) {
    setKeepId(item.id);
    setName(item.name);
  }

  async function confirm() {
    setBusy(true);
    try {
      await mergeDirectoryItems(
        kind,
        keepId,
        items.filter((i) => i.id !== keepId).map((i) => i.id),
      );
      const finalName = name.trim();
      if (finalName && finalName !== keep.name) {
        await renameDirectoryItem(kind, keepId, finalName);
      }
      await onDone();
    } catch (err) {
      alert(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        <h3 className="font-bold text-lg">
          Fusionar {items.length} {KIND_LABEL[kind]}
        </h3>
        <p className="text-sm opacity-70 mt-1">
          Elige cuál es el correcto. Los tours de los demás pasarán a él y los
          demás se borrarán.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {items.map((i) => (
            <label
              key={i.id}
              className="flex items-center gap-3 rounded-lg border border-base-content/10 px-3 py-2 cursor-pointer"
            >
              <input
                type="radio"
                className="radio radio-sm"
                checked={keepId === i.id}
                onChange={() => pick(i)}
              />
              <span className="flex-1 min-w-0 truncate text-sm font-semibold">
                {i.name}
              </span>
              <span className="text-xs opacity-50 shrink-0">
                {i.tours} tours
              </span>
            </label>
          ))}
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[11px] font-bold opacity-40 uppercase tracking-wide">
            Nombre final
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input input-bordered input-sm"
          />
        </label>

        <p className="text-xs opacity-60 mt-3">
          Los nombres descartados quedan guardados como alias del correcto.
        </p>

        <div className="modal-action">
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={confirm}
            disabled={busy || !name.trim()}
          >
            {busy ? "Fusionando..." : "Fusionar"}
          </button>
        </div>
      </div>
    </div>
  );
}