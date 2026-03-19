import { useState, useEffect } from "react";
import { Calendar, Clock, Users, Globe, UserPlus, X, ChevronDown } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "../../login/AuthContext";
import type { CalendarEvent } from "../CreateEventModal";
import type { Reservation } from "./AddReservationModal";
import {
  assignGuideToTour, removeGuideFromTour, assignGuideToReservation,
} from "../Services/Supabase.adapter";

import guruwalkLogo    from "../../assets/platforms-logos/guruwalk.png";
import freetourLogo    from "../../assets/platforms-logos/freetour.png";
import turixeLogo      from "../../assets/platforms-logos/turixe.png";
import tripadvisorLogo from "../../assets/platforms-logos/tripadvisor.png";

const PLATFORM_LOGO: Record<string, string> = {
  guruwalk: guruwalkLogo, freetour: freetourLogo,
  turixe: turixeLogo,     tripadvisor: tripadvisorLogo,
};

const supabase = createClient(
  "https://hccxpmnraefgccowdwri.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY3hwbW5yYWVmZ2Njb3dkd3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MjAyNzQsImV4cCI6MjA4ODE5NjI3NH0.QwfoDxbMDXPrCmfGPLsKVzhfLpQBKBVmNwbNm_dIX1E"
);

interface GuideProfile { id: string; name: string; email: string; avatarUrl: string | null; }

interface EventBodyProps {
  event:               CalendarEvent;
  allEvents:           CalendarEvent[];
  reservations:        Reservation[];
  mobileView:          "info" | "reservations";
  onRemoveReservation: (resId: string) => void;
  onRefetch:           () => void;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ─── AVATAR GUÍA ─────────────────────────────────────────────────────────────
function GuideAvatar({ guide, size = 7 }: { guide: GuideProfile; size?: number }) {
  const initials = guide.name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className={`w-${size} h-${size} rounded-full bg-primary/15 border border-primary/20 overflow-hidden flex items-center justify-center text-primary text-xs font-bold shrink-0`}>
      {guide.avatarUrl
        ? <img src={guide.avatarUrl} alt={guide.name} className="w-full h-full object-cover" />
        : initials
      }
    </div>
  );
}

// ─── PANEL ASIGNACIÓN DE GUÍAS ────────────────────────────────────────────────
function GuideAssignPanel({ event, allEvents, onRefresh }: {
  event:      CalendarEvent;
  allEvents:  CalendarEvent[];
  onRefresh:  () => void;
}) {
  const { isAdmin } = useAuth();
  const [allGuides,     setAllGuides]     = useState<GuideProfile[]>([]);
  const [assignedGuides, setAssignedGuides] = useState<GuideProfile[]>([]);
  const [distributing,  setDistributing]  = useState(false);

  // Cargar todos los perfiles y guías asignados
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id, name, email, avatar_url").order("name");
      setAllGuides((data ?? []).map((p: any) => ({ id: p.id, name: p.name, email: p.email, avatarUrl: p.avatar_url })));
    })();

    const guides = (event.meta?.tourGuides as GuideProfile[]) ?? [];
    setAssignedGuides(guides);
  }, [event]);

  // IDs de guías ya asignados al tour completo (todos los eventos de la hora)
  const allAssignedIds = allEvents.flatMap(
    (e) => ((e.meta?.tourGuides as GuideProfile[]) ?? []).map((g) => g.id)
  );
  const uniqueAssignedIds = [...new Set(allAssignedIds)];

  // Pax por guía
  const paxByGuide = (guideId: string) => {
    const allRes = allEvents.flatMap((e) => (e.meta?.reservations as any[]) ?? []);
    return allRes
      .filter((r) => r.guideId === guideId && r.status !== "cancelled")
      .reduce((acc: number, r: any) => acc + r.adults + r.children, 0);
  };

  const handleAssign = async (guideId: string) => {
    // Asignar a todos los tours de esta hora
    for (const e of allEvents) {
      await assignGuideToTour(e.id, guideId);
    }
    const guide = allGuides.find((g) => g.id === guideId);
    if (guide) setAssignedGuides((prev) => [...prev, guide]);
  };

  const handleRemove = async (guideId: string) => {
    for (const e of allEvents) {
      await removeGuideFromTour(e.id, guideId);
    }
    setAssignedGuides((prev) => prev.filter((g) => g.id !== guideId));
  };

  // Distribución — equitativa con 2+ guías, asignación total con 1 guía
  const handleDistribute = async () => {
    if (assignedGuides.length === 0) return;
    setDistributing(true);

    const allRes = allEvents
      .flatMap((e) => (e.meta?.reservations as any[]) ?? [])
      .filter((r) => r.status !== "cancelled")
      .sort((a: any, b: any) => (b.adults + b.children) - (a.adults + a.children));

    if (assignedGuides.length === 1) {
      // Con 1 guía — asignar todas las reservas a ella
      for (const res of allRes) {
        await assignGuideToReservation(res.id, assignedGuides[0].id);
      }
    } else {
      // Con 2+ guías — repartir equitativamente por pax
      const paxCount: Record<string, number> = {};
      assignedGuides.forEach((g) => { paxCount[g.id] = 0; });

      for (const res of allRes) {
        const guideId = assignedGuides.reduce((min, g) =>
          paxCount[g.id] < paxCount[min] ? g.id : min,
          assignedGuides[0].id
        );
        paxCount[guideId] += res.adults + res.children;
        await assignGuideToReservation(res.id, guideId);
      }
    }

    setDistributing(false);
    onRefresh();
  };

  const availableGuides = allGuides.filter((g) => !uniqueAssignedIds.includes(g.id));

  return (
    <div className="border border-base-content/10 rounded-2xl p-4">
      <h3 className="text-sm font-bold mb-3">Guías del tour</h3>

      {/* Guías asignados */}
      {assignedGuides.length === 0 ? (
        <p className="text-xs opacity-40 mb-3">Sin guías asignadas</p>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {assignedGuides.map((guide) => (
            <div key={guide.id} className="flex items-center gap-2 bg-base-200/50 rounded-xl px-3 py-2">
              <GuideAvatar guide={guide} size={7} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{guide.name}</p>
                <p className="text-[10px] opacity-40">pax: {paxByGuide(guide.id)}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleRemove(guide.id)}
                  className="btn btn-ghost btn-circle btn-xs text-base-content/30 hover:text-error"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selector para añadir guía — solo admin */}
      {isAdmin && availableGuides.length > 0 && (
        <div className="relative">
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) { handleAssign(e.target.value); e.target.value = ""; } }}
            className="select select-sm w-full bg-base-200 border-none text-sm appearance-none pr-8"
          >
            <option value="" disabled>+ Añadir guía</option>
            {availableGuides.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
        </div>
      )}

      {/* Botón asignar (1 guía) o distribuir (2+ guías) — solo admin */}
      {isAdmin && assignedGuides.length === 1 && (
        <button
          onClick={handleDistribute}
          disabled={distributing}
          className="btn btn-xs w-full mt-3 bg-base-content text-base-100 border-none hover:bg-base-content/80 disabled:opacity-30 gap-1.5"
        >
          {distributing
            ? <span className="loading loading-spinner loading-xs" />
            : <><UserPlus size={12} /> Asignar a todos los clientes</>
          }
        </button>
      )}
      {isAdmin && assignedGuides.length >= 2 && (
        <button
          onClick={handleDistribute}
          disabled={distributing}
          className="btn btn-xs w-full mt-3 bg-base-content text-base-100 border-none hover:bg-base-content/80 disabled:opacity-30 gap-1.5"
        >
          {distributing
            ? <span className="loading loading-spinner loading-xs" />
            : <><UserPlus size={12} /> Distribuir automáticamente</>
          }
        </button>
      )}
    </div>
  );
}

// ─── ASISTENCIA ───────────────────────────────────────────────────────────────
type AttendanceState = "none" | "all" | "partial" | "absent";

function AttendanceSelector({ reservation, onConfirm, tourGuides }: {
  reservation: Reservation;
  onConfirm:   (id: string, attended: boolean, attendedCount: number) => void;
  tourGuides:  GuideProfile[];
}) {
  const { profile, isAdmin } = useAuth();
  const guideId = (reservation as any).guideId as string | null;
  const canEdit = isAdmin || profile?.id === guideId;

  // Bloquear SOLO si no hay guías asignados al tour (aún no se ha configurado)
  if (tourGuides.length === 0) return null;
  // Bloquear si no es tu reserva y no eres admin
  if (!canEdit) return null;

  const [state,        setState]        = useState<AttendanceState>("none");
  const [partialCount, setPartialCount] = useState(reservation.adults + reservation.children);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  const totalPax = reservation.adults + reservation.children;

  const handleSubmit = async () => {
    if (state === "none") return;
    setSaving(true); setSaved(false);
    const attended      = state !== "absent";
    const attendedCount = state === "all" ? totalPax : state === "partial" ? partialCount : 0;
    await supabase.from("reservations")
      .update({ attended, attended_count: attendedCount })
      .eq("id", reservation.id);
    setSaving(false); setSaved(true);
    onConfirm(reservation.id, attended, attendedCount);
  };

  return (
    <div className="mt-3 pt-3 border-t border-base-content/5">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`att-${reservation.id}`} checked={state === "all"}
            onChange={() => { setState("all"); setSaved(false); }} className="radio radio-xs border-base-content/30" />
          <span className="text-xs opacity-60">Todos</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`att-${reservation.id}`} checked={state === "partial"}
            onChange={() => { setState("partial"); setSaved(false); }} className="radio radio-xs border-base-content/30" />
          <span className="text-xs opacity-60">Parcial</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={`att-${reservation.id}`} checked={state === "absent"}
            onChange={() => { setState("absent"); setSaved(false); }} className="radio radio-xs border-base-content/30" />
          <span className="text-xs text-error/70">No asistieron</span>
        </label>
        {state !== "none" && (
          <button onClick={handleSubmit} disabled={saving}
            className="btn btn-xs bg-base-content text-base-100 border-none hover:bg-base-content/80 disabled:opacity-30 ml-auto">
            {saving ? <span className="loading loading-spinner loading-xs" /> : saved ? "✓ Guardado" : "Guardar"}
          </button>
        )}
      </div>
      {state === "partial" && (
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => setPartialCount((v) => Math.max(0, v - 1))} className="btn btn-xs btn-outline btn-square border-base-content/20">−</button>
          <span className="text-sm font-bold w-6 text-center">{partialCount}</span>
          <button onClick={() => setPartialCount((v) => Math.min(totalPax, v + 1))} className="btn btn-xs btn-outline btn-square border-base-content/20">+</button>
          <span className="text-[10px] opacity-40">de {totalPax}</span>
        </div>
      )}
    </div>
  );
}

// ─── CARD RESERVA ─────────────────────────────────────────────────────────────
function ReservationCard({ reservation, isCancelled, tourGuides, onGuideChange, onAttendanceConfirm }: {
  reservation:          Reservation;
  isCancelled:          boolean;
  tourGuides:           GuideProfile[];
  onGuideChange:        (resId: string, guideId: string | null) => void;
  onAttendanceConfirm:  (id: string, attended: boolean, count: number) => void;
}) {
  const { isAdmin } = useAuth();
  const platform = (reservation as any).platform as string ?? "other";
  const guideId  = (reservation as any).guideId as string | null;
  const logo     = PLATFORM_LOGO[platform];
  const assignedGuide = tourGuides.find((g) => g.id === guideId);

  return (
    <div className={[
      "rounded-xl p-3 flex flex-col",
      isCancelled
        ? "border border-error/20 bg-error/5 border-l-4 border-l-error"
        : "border border-base-content/5 bg-base-200/40",
    ].join(" ")}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-base-300">
          {logo
            ? <img src={logo} alt={platform} className="w-full h-full object-cover" />
            : <span className="text-xs font-bold opacity-40">{platform[0]?.toUpperCase()}</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-bold truncate ${isCancelled ? "line-through opacity-50" : ""}`}>
              {reservation.name || <span className="opacity-40 italic text-xs">Sin nombre</span>}
            </span>
            <span className="text-xs opacity-60 shrink-0">
              {reservation.adults} adulto{reservation.adults !== 1 ? "s" : ""}
              {reservation.children > 0 && ` / ${reservation.children} niño${reservation.children !== 1 ? "s" : ""}`}
            </span>
          </div>
          {reservation.phone && <span className="text-xs opacity-40">📱 {reservation.phone}</span>}
        </div>
      </div>

      {/* Guía asignada */}
      {tourGuides.length > 0 && !isCancelled && (
        <div className="mt-2 pt-2 border-t border-base-content/5 flex items-center gap-2">
          {assignedGuide && <GuideAvatar guide={assignedGuide} size={5} />}
          {isAdmin ? (
            <select
              value={guideId ?? ""}
              onChange={(e) => onGuideChange(reservation.id, e.target.value || null)}
              className="text-xs bg-transparent outline-none opacity-60 hover:opacity-100 flex-1 cursor-pointer"
            >
              <option value="">Sin asignar</option>
              {tourGuides.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs opacity-50">{assignedGuide?.name ?? "Sin asignar"}</span>
          )}
        </div>
      )}

      {/* Asistencia — oculta si no hay guías asignados al tour */}
      {!isCancelled && (
        <AttendanceSelector reservation={reservation} onConfirm={onAttendanceConfirm} tourGuides={tourGuides} />
      )}
    </div>
  );
}

// ─── LISTA RESERVAS agrupada por guía ─────────────────────────────────────────
function ReservationList({ reservations, tourGuides, onGuideChange, onAttendanceConfirm }: {
  reservations:        Reservation[];
  tourGuides:          GuideProfile[];
  onGuideChange:       (resId: string, guideId: string | null) => void;
  onAttendanceConfirm: (id: string, attended: boolean, count: number) => void;
}) {
  const active    = reservations.filter((r) => r.status !== "cancelled");
  const cancelled = reservations.filter((r) => r.status === "cancelled");

  const renderActive = () => {
    if (tourGuides.length === 0) {
      return active.map((r) => (
        <ReservationCard key={r.id} reservation={r} isCancelled={false}
          tourGuides={tourGuides} onGuideChange={onGuideChange} onAttendanceConfirm={onAttendanceConfirm} />
      ));
    }
    const sorted = [...active].sort((a, b) => {
      const aIdx = tourGuides.findIndex((g) => g.id === (a as any).guideId);
      const bIdx = tourGuides.findIndex((g) => g.id === (b as any).guideId);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
    return sorted.map((r) => (
      <ReservationCard key={r.id} reservation={r} isCancelled={false}
        tourGuides={tourGuides} onGuideChange={onGuideChange} onAttendanceConfirm={onAttendanceConfirm} />
    ));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
          <h3 className="font-bold text-base">Reservas confirmadas</h3>
          <span className="text-sm opacity-40 ml-1">
            {active.reduce((a, r) => a + r.adults, 0)} adultos
            {active.some((r) => r.children > 0) && ` · ${active.reduce((a, r) => a + r.children, 0)} niños`}
          </span>
        </div>
        {active.length === 0
          ? <div className="flex flex-col items-center py-10 opacity-25 gap-2"><span className="text-3xl">🎟️</span><span className="text-sm">Sin reservas</span></div>
          : <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{renderActive()}</div>
        }
      </div>

      {cancelled.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-error shrink-0" />
            <h3 className="font-bold text-base">Reservas canceladas</h3>
            <span className="text-sm opacity-40 ml-1">{cancelled.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {cancelled.map((r) => (
              <ReservationCard key={r.id} reservation={r} isCancelled={true}
                tourGuides={tourGuides} onGuideChange={onGuideChange} onAttendanceConfirm={onAttendanceConfirm} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PANEL IZQUIERDO ─────────────────────────────────────────────────────────
function EventInfo({ event, allEvents, reservations, onRefresh }: {
  event:        CalendarEvent;
  allEvents:    CalendarEvent[];
  reservations: Reservation[];
  onRefresh:    () => void;
}) {
  const active        = reservations.filter((r) => r.status !== "cancelled");
  const cancelled     = reservations.filter((r) => r.status === "cancelled");
  const totalPax      = active.reduce((a, r) => a + r.adults + r.children, 0);
  const totalAdults   = active.reduce((a, r) => a + r.adults, 0);
  const totalChildren = active.reduce((a, r) => a + r.children, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Info del tour */}
      <div className="border border-base-content/10 rounded-2xl overflow-hidden">
        <div className="bg-teal-700 text-white p-5">
          <p className="text-lg font-black leading-snug">{event.tour}</p>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3 text-sm">
            <Globe size={15} className="opacity-40 shrink-0" />
            <span className="font-medium">Español</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar size={15} className="opacity-40 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold opacity-40 uppercase tracking-wide">Fecha</span>
              <span className="font-medium capitalize">{formatDate(event.date)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock size={15} className="opacity-40 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold opacity-40 uppercase tracking-wide">Horario</span>
              <span className="font-medium">{event.time}h</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Users size={15} className="opacity-40 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold opacity-40 uppercase tracking-wide">Personas</span>
              <span className="font-medium">{totalPax} persona{totalPax !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Panel guías */}
      <GuideAssignPanel event={event} allEvents={allEvents} onRefresh={onRefresh} />

      {/* Resumen */}
      <div className="border border-base-content/10 rounded-2xl p-4">
        <h3 className="text-sm font-bold mb-3">Resumen</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-60">Total adultos</span>
            <span className="font-bold">{totalAdults}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-60">Total niños</span>
            <span className="font-bold">{totalChildren}</span>
          </div>
        </div>

        {/* Guías con asistencia confirmada */}
        {(() => {
          const guides = allEvents.flatMap((e) => (e.meta?.tourGuides as GuideProfile[]) ?? []);
          const unique: GuideProfile[] = [];
          const seen = new Set<string>();
          for (const g of guides) { if (!seen.has(g.id)) { unique.push(g); seen.add(g.id); } }
          if (unique.length === 0) return null;

          return (
            <>
              <div className="border-t border-base-content/10 my-2" />
              <div className="flex flex-col gap-2">
                {unique.map((guide) => {
                  const guideRes = reservations.filter(
                    (r) => (r as any).guideId === guide.id && r.status !== "cancelled"
                  );
                  const confirmedCount = guideRes.filter((r) => r.attended).length;
                  const confirmedPax   = guideRes.reduce((a, r) => a + ((r as any).attended_count ?? 0), 0);
                  const total          = guideRes.length;
                  return (
                    <div key={guide.id} className="flex items-center gap-2">
                      <GuideAvatar guide={guide} size={7} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{guide.name}</p>
                        <p className="text-[10px] opacity-40">
                          {confirmedCount}/{total} reservas · {confirmedPax} pax confirmados
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function EventBody({ event, allEvents, reservations, mobileView, onRemoveReservation, onRefetch }: EventBodyProps) {
  const [localReservations, setLocalReservations] = useState(reservations);

  useEffect(() => { setLocalReservations(reservations); }, [reservations]);

  const tourGuides: GuideProfile[] = [];
  const seenIds = new Set<string>();
  for (const e of allEvents) {
    for (const g of ((e.meta?.tourGuides as GuideProfile[]) ?? [])) {
      if (!seenIds.has(g.id)) { tourGuides.push(g); seenIds.add(g.id); }
    }
  }

  const handleGuideChange = async (resId: string, guideId: string | null) => {
    await assignGuideToReservation(resId, guideId);
    setLocalReservations((prev) =>
      prev.map((r) => r.id === resId ? { ...r, guideId } as any : r)
    );
  };

  // Actualizar asistencia en estado local — actualiza resumen en tiempo real
  const handleAttendanceConfirm = (id: string, attended: boolean, attendedCount: number) => {
    setLocalReservations((prev) =>
      prev.map((r) => r.id === id
        ? { ...r, attended, attended_count: attendedCount } as any
        : r
      )
    );
  };

  return (
    <>
      {/* DESKTOP */}
      <div className="hidden md:grid grid-cols-3 gap-6 flex-1 overflow-hidden p-6">
        <div className="col-span-1 overflow-y-auto">
          <EventInfo event={event} allEvents={allEvents} reservations={localReservations} onRefresh={onRefetch} />
        </div>
        <div className="col-span-2 overflow-y-auto">
          <ReservationList
            reservations={localReservations}
            tourGuides={tourGuides}
            onGuideChange={handleGuideChange}
            onAttendanceConfirm={handleAttendanceConfirm}
          />
        </div>
      </div>

      {/* MÓVIL */}
      <div className="md:hidden flex-1 overflow-y-auto pb-24">
        {mobileView === "info"
          ? <div className="p-4"><EventInfo event={event} allEvents={allEvents} reservations={localReservations} onRefresh={onRefetch} /></div>
          : <div className="px-0 py-2">
              <ReservationList
                reservations={localReservations}
                tourGuides={tourGuides}
                onGuideChange={handleGuideChange}
                onAttendanceConfirm={handleAttendanceConfirm}
              />
            </div>
        }
      </div>
    </>
  );
}