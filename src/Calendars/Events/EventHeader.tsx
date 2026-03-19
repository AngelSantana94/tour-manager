import { ArrowLeft, X, Pencil, Trash2, ChevronDown } from "lucide-react";

interface EventHeaderProps {
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  // móvil: toggle entre info del tour y reservas
  mobileView: "info" | "reservations";
  onToggleMobileView: () => void;
}

export default function EventHeader({
  onBack,
  onEdit,
  onDelete,
  mobileView,
  onToggleMobileView,
}: EventHeaderProps) {
  return (
    <>
      {/* ── DESKTOP ── */}
      <header className="hidden md:flex items-center justify-between px-6 py-4 border-b border-base-content/10 bg-base-100 flex-none">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft size={16} />
          Volver al calendario
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="btn btn-outline btn-sm gap-2 border-base-content/20"
          >
            <Pencil size={14} />
            Editar
          </button>
          <button
            onClick={onDelete}
            className="btn btn-sm gap-2 bg-red-50 hover:bg-red-100 text-red-500 border-red-200"
          >
            <Trash2 size={14} />
            Eliminar
          </button>
        </div>
      </header>

      {/* ── MÓVIL ── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-primary text-white flex-none">
        {/* X volver */}
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-white/20 transition-colors">
          <X size={18} />
        </button>

        {/* Toggle Ver evento / Colapsar */}
        <button
          onClick={onToggleMobileView}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors rounded-lg px-3 py-1.5 text-sm font-semibold"
        >
          {mobileView === "info" ? "Colapsar" : "Ver evento"}
          <ChevronDown
            size={14}
            className={[
              "transition-transform duration-200",
              mobileView === "info" ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>

        {/* Acciones */}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Editar"
          >
            <Pencil size={17} />
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