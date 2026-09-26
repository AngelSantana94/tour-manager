import {
  ArrowLeft,
  X,
  Pencil,
  Trash2,
  Check,
  Ban,
  CheckCircle2,
} from "lucide-react";

interface EventHeaderProps {
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editing: boolean;
  isCancelled: boolean;
  onToggleCancel: () => void;
  togglingCancel?: boolean;
}

export default function EventHeader({
  onBack,
  onEdit,
  onDelete,
  editing,
  isCancelled,
  onToggleCancel,
  togglingCancel,
}: EventHeaderProps) {
  return (
    <>
      {/* ── DESKTOP (sticky + z-50 para que nunca lo tape o desplace el sidebar) ── */}
      <header className="hidden md:flex sticky top-0 z-50 items-center justify-between px-6 py-4 border-b border-base-content/10 bg-base-100 flex-none w-full">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold opacity-70 hover:opacity-100 transition-opacity cursor-pointer shrink-0"
        >
          <ArrowLeft size={16} />
          <span>Volver al calendario</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleCancel}
            disabled={togglingCancel}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer disabled:opacity-40"
          >
            {togglingCancel ? (
              <span className="loading loading-spinner loading-xs" />
            ) : isCancelled ? (
              <CheckCircle2 size={14} />
            ) : (
              <Ban size={14} />
            )}
            {isCancelled ? "Reactivar tour" : "Cancelar tour"}
          </button>

          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer"
          >
            {editing ? <Check size={14} /> : <Pencil size={14} />}
            {editing ? "Guardar" : "Editar"}
          </button>

          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      </header>

      {/* ── MÓVIL ── */}
      <header className="md:hidden sticky top-0 flex items-center justify-between px-4 py-3 bg-primary text-white flex-none w-full">
        <button
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
        >
          <X size={18} />
        </button>

        <span className="text-sm font-semibold opacity-90">
          Detalle del tour
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCancel}
            disabled={togglingCancel}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors disabled:opacity-40"
            aria-label={isCancelled ? "Reactivar tour" : "Cancelar tour"}
          >
            {togglingCancel ? (
              <span className="loading loading-spinner loading-xs" />
            ) : isCancelled ? (
              <CheckCircle2 size={17} />
            ) : (
              <Ban size={17} />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
            aria-label={editing ? "Guardar" : "Editar"}
          >
            {editing ? <Check size={17} /> : <Pencil size={17} />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Eliminar"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </header>
    </>
  );
}
