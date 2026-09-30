export type GuideCardStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled";

interface GuideCardProps {
  name: string;

  /** "Disponible", "Disponible AM", "Disponible PM"... (segunda fila) */
  availabilityLabel: string;

  /** Solo en guías asignados: "Guía lead", "Back-up 1", "Back-up 2" */
  role?: string;

  /**
   * Estado de confirmación de la asignación.
   *
   * undefined → guía sin asignar: muestra "No confirmado"
   * null      → guía asignado pero sin dato: no muestra insignia
   * valor     → muestra el estado correspondiente
   */
  status?: GuideCardStatus | null;

  /** Si algún día la tabla `guides` tiene foto, se pasa aquí. */
  photoUrl?: string | null;
}

const STATUS_BADGE: Record<
  GuideCardStatus,
  { label: string; className: string }
> = {
  accepted: {
    label: "Confirmado",
    className: "bg-emerald-100 text-emerald-700",
  },

  pending: {
    label: "Pendiente",
    className: "bg-amber-100 text-amber-700",
  },

  rejected: {
    label: "Rechazó",
    className: "bg-red-100 text-red-700",
  },

  cancelled: {
    label: "Cancelado",
    className: "bg-slate-200 text-slate-600",
  },
};

const DEFAULT_BADGE = {
  label: "No confirmado",
  className: "bg-slate-200 text-slate-600",
};

// Primera letra real del nombre.
// Array.from evita partir emojis/unicode.
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : "?";
}

export default function GuideCard({
  name,
  availabilityLabel,
  role,
  status,
  photoUrl,
}: GuideCardProps) {
  /**
   * null     → no mostramos insignia
   * undefined → mostramos "No confirmado"
   * valor     → mostramos el estado correspondiente
   */
  const badge =
    status === null
      ? null
      : status
        ? STATUS_BADGE[status]
        : DEFAULT_BADGE;

  return (
    <div className="rounded-xl border border-base-content/10 bg-slate-50 px-3 py-2 flex flex-col gap-1">
      {/* Fila 1: icono, nombre, estado */}
      <div className="flex items-center gap-2 min-w-0">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="w-8 h-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600 text-sm font-bold">
            {initialOf(name)}
          </div>
        )}

        <span className="text-sm font-bold truncate flex-1 min-w-0">
          {name}
        </span>

        {badge && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
      </div>

      {/* Fila 2: disponibilidad y, si está asignado, su rol */}
      <div className="flex items-center justify-between gap-2 pl-10 text-[11px]">
        <span className="opacity-60 truncate">{availabilityLabel}</span>

        {role && (
          <span className="font-semibold text-indigo-600 shrink-0">
            {role}
          </span>
        )}
      </div>
    </div>
  );
}