import { useState } from "react";
import { X, Tag, Calendar } from "lucide-react";
import {
  ALL_PLATFORMS,
  updateManualBillingEntry,
  type ManualBillingEntry,
  type Platform,
} from "./UseBillingData";

const PLATFORM_LABELS: Record<string, string> = {
  guruwalk: "GuruWalk",
  freetour: "FreeTour",
  plaza: "Plaza",
  turixe: "Turixe",
  viator: "Viator",
  taro: "Taro",
  tripadvisor: "TripAdvisor",
};

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface EditTourModalProps {
  entry: ManualBillingEntry;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTourModal({
  entry,
  onClose,
  onSaved,
}: EditTourModalProps) {
  const [platform, setPlatform] = useState<Platform>(
    entry.platform as Platform,
  );
  const [adults, setAdults] = useState(entry.adults);
  const [children, setChildren] = useState(entry.children);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    if (adults === 0 && children === 0) {
      setError("Introduce al menos 1 pax.");
      return;
    }

    setSaving(true);
    try {
      await updateManualBillingEntry(entry.id, { platform, adults, children });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error al guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-base-100 rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-lg font-bold">Editar tour</h2>
          <button onClick={onClose} className="btn btn-ghost btn-xs btn-square">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          {/* ── PLATAFORMA (editable) ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Tag size={14} /> Plataforma
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={[
                    "btn btn-xs rounded-full px-3 font-semibold border-none",
                    platform === p
                      ? "bg-base-content text-base-100"
                      : "bg-base-200 text-base-content/60 hover:bg-base-300",
                  ].join(" ")}
                >
                  {PLATFORM_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          </div>

          {/* ── FECHA (bloqueada — solo lectura) ── */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold opacity-60">
              <Calendar size={14} /> Fecha
            </label>
            <div
              className="input input-bordered w-full text-sm flex items-center gap-2 text-left opacity-50 cursor-not-allowed bg-base-200/40"
              aria-disabled="true"
            >
              <Calendar size={15} className="opacity-40 shrink-0" />
              <span className="capitalize">{formatDateLabel(entry.entry_date)}</span>
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider opacity-60">
                No editable
              </span>
            </div>
          </div>

          {/* ── ADULTOS / NIÑOS (contador +/-) ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold opacity-60">Adultos</span>
              <div className="flex items-center gap-3 bg-base-200/50 rounded-xl px-3 py-2 justify-between">
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm disabled:opacity-30"
                  onClick={() => setAdults((n) => Math.max(0, n - 1))}
                  disabled={adults <= 0}
                >
                  −
                </button>
                <span className="font-bold text-base w-4 text-center">
                  {adults}
                </span>
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm"
                  onClick={() => setAdults((n) => n + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold opacity-60">
                Niños (&lt;12)
              </span>
              <div className="flex items-center gap-3 bg-base-200/50 rounded-xl px-3 py-2 justify-between">
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm disabled:opacity-30"
                  onClick={() => setChildren((n) => Math.max(0, n - 1))}
                  disabled={children <= 0}
                >
                  −
                </button>
                <span className="font-bold text-base w-4 text-center">
                  {children}
                </span>
                <button
                  type="button"
                  className="btn btn-circle btn-xs bg-base-100 shadow-sm"
                  onClick={() => setChildren((n) => n + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-base-200 border border-base-content/10 text-xs rounded-xl px-3 py-2 font-medium opacity-80">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onClose}
              className="btn btn-outline border-base-content/20"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn bg-base-content text-base-100 hover:bg-base-content/85 border-none disabled:opacity-40"
            >
              {saving ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Guardar cambios"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}