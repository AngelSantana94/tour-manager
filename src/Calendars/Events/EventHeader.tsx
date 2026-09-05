import { useEffect, useState } from "react";
import {
  ArrowLeft,
  X,
  Pencil,
  Trash2,
  ChevronDown,
  Edit3,
  Ban,
  Lock,
} from "lucide-react";

interface EventHeaderProps {
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  source?: string; // ej: "tgb" | "ota" | "guruwalk" | ...
  isTuGuia?: boolean;
  mobileView: "info" | "reservations";
  onToggleMobileView: () => void;
  // Acciones exclusivas de TGB — solo se muestran cuando isTuGuia es true
  onOpenCapacity?: () => void;
  onToggleAvailability?: () => void;
  hasException?: boolean; // decide si el botón dice "Quitar disponibilidad" o "Habilitar"
  togglingAvailability?: boolean;
}

// Modal informativo: eliminar tours TGB aún no está soportado desde aquí
// (requiere decidir qué pasa con sus bookings — soft delete, etc.). De momento
// se explica al usuario en vez de dejar el botón sin reacción visible.
function NoPermissionModal({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 180);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className={[
          "absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      <div
        className={[
          "relative w-full max-w-sm bg-base-100 rounded-2xl shadow-2xl p-5 flex flex-col gap-4",
          "transform transition-all duration-200 ease-out",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-base-200 text-base-content/60">
            <Lock size={16} />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <h3 className="text-base font-bold leading-tight">
              Acción no disponible
            </h3>
            <p className="text-sm opacity-70 leading-snug">
              No tienes los permisos necesarios para eliminar este tour.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={handleClose} className="btn btn-sm btn-neutral">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventHeader({
  onBack,
  onEdit,
  onDelete,
  source,
  isTuGuia,
  mobileView,
  onToggleMobileView,
  onOpenCapacity,
  onToggleAvailability,
  hasException,
  togglingAvailability,
}: EventHeaderProps) {
  // Determina si es TGB por prop directa o por el source del evento
  const isTuGuiaSource = isTuGuia ?? source === "tgb";
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);

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
          {isTuGuiaSource ? (
            <>
              {onOpenCapacity && (
                <button
                  onClick={onOpenCapacity}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer"
                >
                  <Edit3 size={14} />
                  Aforo
                </button>
              )}
              {onToggleAvailability && (
                <button
                  onClick={onToggleAvailability}
                  disabled={togglingAvailability}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer disabled:opacity-40"
                >
                  <Ban size={14} />
                  {hasException ? "Habilitar" : "Quitar disponibilidad"}
                </button>
              )}
              <button
                onClick={() => setPermissionModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer"
              >
                <Pencil size={14} />
                Editar
              </button>
              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all border border-slate-800 shadow-xs cursor-pointer"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── MÓVIL ── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-primary text-white flex-none">
        {/* X volver */}
        <button
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
        >
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
          {isTuGuiaSource ? (
            <>
              {onOpenCapacity && (
                <button
                  onClick={onOpenCapacity}
                  className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                  aria-label="Aforo"
                  title="Aforo"
                >
                  <Edit3 size={17} />
                </button>
              )}
              {onToggleAvailability && (
                <button
                  onClick={onToggleAvailability}
                  disabled={togglingAvailability}
                  className="p-1.5 rounded-full hover:bg-white/20 transition-colors disabled:opacity-40"
                  aria-label={
                    hasException ? "Habilitar" : "Quitar disponibilidad"
                  }
                  title={hasException ? "Habilitar" : "Quitar disponibilidad"}
                >
                  <Ban size={17} />
                </button>
              )}
              <button
                onClick={() => setPermissionModalOpen(true)}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                aria-label="Eliminar"
              >
                <Trash2 size={17} />
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </header>

      {permissionModalOpen && (
        <NoPermissionModal onClose={() => setPermissionModalOpen(false)} />
      )}
    </>
  );
}
