import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "./CreateEventModal";
import {
  fetchGuidesAvailabilityForDate,
  type AvailabilityShift,
  type DayGuideAvailability,
} from "../Availability/Services/Availability.adapter";
import GuideCard, { type GuideCardStatus } from "./Guidecard";
import CollapsibleSection from "./Collapsiblesection";

// ─── TIPOS Y CONSTANTES ─────────────────────────────────────────────────────

type Period = "AM" | "PM" | "NT";
type Half = "AM" | "PM";

interface GuideLite {
  id: string;
  name: string;
}

interface GuideAssignment {
  guideId: string;
  status: GuideCardStatus;
}

interface AssignedGuide {
  guide: GuideLite;
  role: string;
  assignment: GuideAssignment | null;
}

interface TourGroup {
  event: CalendarEvent;
  guides: AssignedGuide[];
}

const ROLES = [
  {
    key: "guideLead",
    label: "Guía lead",
    assignmentSlot: "guide_lead_id",
  },
  {
    key: "backup1",
    label: "Back-up 1",
    assignmentSlot: "backup_1_id",
  },
  {
    key: "backup2",
    label: "Back-up 2",
    assignmentSlot: "backup_2_id",
  },
] as const;

const SHIFT_LABEL: Record<AvailabilityShift, string> = {
  FULL: "Disponible",
  AM: "Disponible AM",
  PM: "Disponible PM",
};

function periodOf(event: CalendarEvent): Period {
  const p = event.meta?.period;

  return p === "AM" || p === "PM" ? p : "NT";
}

function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);

  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ─── COMPONENTE ─────────────────────────────────────────────────────────────

interface GuideAvailabilityPanelProps {
  selectedDate: string;
  events: CalendarEvent[];
}

export default function GuideAvailabilityPanel({
  selectedDate,
  events,
}: GuideAvailabilityPanelProps) {
  const [availability, setAvailability] = useState<DayGuideAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Disponibilidad del día ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setAvailability([]);

    fetchGuidesAvailabilityForDate(selectedDate)
      .then((rows) => {
        if (!cancelled) {
          setAvailability(rows);
        }
      })
      .catch((err) => {
        console.error("Error cargando disponibilidad de guías:", err);

        if (!cancelled) {
          setError("No se pudo cargar la disponibilidad.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // ── Tours del día ──────────────────────────────────────────────────────
  // Los cancelados no ocupan guías.

  const dayEvents = useMemo(
    () =>
      events.filter(
        (e) => e.date === selectedDate && e.meta?.status !== "Cancelado",
      ),
    [events, selectedDate],
  );

  // ── Obtener assignment de un slot concreto ────────────────────────────

  function getAssignment(
    event: CalendarEvent,
    slot: "guide_lead_id" | "backup_1_id" | "backup_2_id",
  ): GuideAssignment | null {
    const assignments =
      (event.meta?.assignments as
        | Partial<
            Record<
              "guide_lead_id" | "backup_1_id" | "backup_2_id",
              GuideAssignment
            >
          >
        | undefined) ?? {};

    const assignment = assignments[slot];

    if (!assignment) {
      return null;
    }

    return assignment;
  }

  // ── Guías asignados, agrupados por franja y por tour ───────────────────

  const groups = useMemo(() => {
    const out: Record<Period, TourGroup[]> = {
      AM: [],
      PM: [],
      NT: [],
    };

    for (const event of dayEvents) {
      const guides: AssignedGuide[] = [];

      for (const { key, label, assignmentSlot } of ROLES) {
        const g = event.meta?.[key] as GuideLite | null | undefined;

        if (!g) {
          continue;
        }

        guides.push({
          guide: {
            id: g.id,
            name: g.name,
          },
          role: label,
          assignment: getAssignment(event, assignmentSlot),
        });
      }

      if (guides.length) {
        out[periodOf(event)].push({
          event,
          guides,
        });
      }
    }

    for (const p of ["AM", "PM", "NT"] as const) {
      out[p].sort((a, b) => a.event.time.localeCompare(b.event.time));
    }

    return out;
  }, [dayEvents]);

  const countGuides = (list: TourGroup[]) =>
    list.reduce((sum, tour) => sum + tour.guides.length, 0);

  // ── Qué mitades del día tiene ya cubiertas cada guía ───────────────────
  // Un tour NT no ocupa ni AM ni PM.

  const covered = useMemo(() => {
    const map = new Map<string, Set<Half>>();

    for (const half of ["AM", "PM"] as const) {
      for (const tour of groups[half]) {
        for (const { guide } of tour.guides) {
          const set = map.get(guide.id) ?? new Set<Half>();

          set.add(half);
          map.set(guide.id, set);
        }
      }
    }

    return map;
  }, [groups]);

  // ── Guías disponibles ─────────────────────────────────────────────────

  const availableCards = useMemo(() => {
    const out: {
      guide: GuideLite;
      label: string;
    }[] = [];

    for (const row of availability) {
      if (row.status !== "available") {
        continue;
      }

      const base: Half[] = row.shift === "FULL" ? ["AM", "PM"] : [row.shift];

      const taken = covered.get(row.guide.id);

      const remaining = base.filter((h) => !taken?.has(h));

      if (remaining.length === 0) {
        continue;
      }

      out.push({
        guide: row.guide,
        label:
          remaining.length === 2 ? "Disponible" : `Disponible ${remaining[0]}`,
      });
    }

    return out;
  }, [availability, covered]);

  // ── Etiqueta de disponibilidad de un guía ya asignado ─────────────────

  const availabilityByGuide = useMemo(() => {
    const map = new Map<string, DayGuideAvailability>();

    for (const row of availability) {
      map.set(row.guide.id, row);
    }

    return map;
  }, [availability]);

  function assignedLabel(guideId: string): string {
    if (loading) {
      return "…";
    }

    const row = availabilityByGuide.get(guideId);

    if (!row) {
      return "Sin disponibilidad marcada";
    }

    if (row.status === "blocked") {
      return "Bloqueado";
    }

    return SHIFT_LABEL[row.shift];
  }

  // ── Render de una batería de asignados ─────────────────────────────────

  function renderAssigned(period: Period, title: string) {
    const tours = groups[period];

    return (
      <CollapsibleSection title={title} count={countGuides(tours)}>
        {tours.length === 0 ? (
          <p className="px-1 py-2 text-xs opacity-50">Ningún guía asignado.</p>
        ) : (
          tours.map(({ event, guides }) => (
            <div key={event.id} className="flex flex-col gap-1.5">
              <p className="px-1 pt-1 text-[11px] font-semibold opacity-70 truncate">
                {(event.meta?.serviceId as string | null) ?? "Sin ID"}
                {" · "}
                {event.tour || "Sin tipo"}
                {event.meta?.noTime ? "" : ` · ${event.time}`}
              </p>

              {guides.map(({ guide, role, assignment }) => (
                <GuideCard
                  key={`${event.id}-${role}`}
                  name={guide.name}
                  availabilityLabel={assignedLabel(guide.id)}
                  role={role}
                  status={assignment?.status ?? null}
                />
              ))}
            </div>
          ))
        )}
      </CollapsibleSection>
    );
  }

  // ── RENDER ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-semibold opacity-60 capitalize">
        Guías · {formatDay(selectedDate)}
      </p>

      {/* ── Guías disponibles ── */}

      <CollapsibleSection
        title="Guías disponibles"
        count={availableCards.length}
      >
        {loading ? (
          <div className="flex justify-center py-3">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : error ? (
          <p className="px-1 py-2 text-xs text-error">{error}</p>
        ) : availableCards.length === 0 ? (
          <p className="px-1 py-2 text-xs opacity-50">
            Ningún guía disponible este día.
          </p>
        ) : (
          availableCards.map(({ guide, label }) => (
            <GuideCard
              key={guide.id}
              name={guide.name}
              availabilityLabel={label}
            />
          ))
        )}
      </CollapsibleSection>

      {/* ── Guías asignados ── */}

      {renderAssigned("AM", "Guías asignados AM")}

      {renderAssigned("PM", "Guías asignados PM")}

      {groups.NT.length > 0 &&
        renderAssigned("NT", "Guías asignados sin franja")}
    </div>
  );
}
