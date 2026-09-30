import { useEffect, useState } from "react";
import {
  Truck,
  Building2,
  Tag,
  MapPin,
  Mail,
  Phone,
  StickyNote,
  Clock,
  Users,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import {
  supabase,
  fetchAvailableGuideIdsForDate,
  fetchCurrentGuideId,
  fetchIsAdmin,
  respondToAssignment,
  adminConfirmAssignment,
  type AssignmentStatus,
  type GuideRef,
  type GuideSlot,
  type SlotAssignment,
} from "../Services/Supabase.adapter";
import type { CalendarEvent } from "../CreateEventModal";
import type { TourFormState } from "./EventPage";
import GuideCombobox from "./GuideComboBox";
import TourAttachments from "./TourAttachments";

interface EventBodyProps {
  event: CalendarEvent;
  form: TourFormState;
  setForm: React.Dispatch<React.SetStateAction<TourFormState>>;
  editing: boolean;
  onAssignGuide: (
    tourId: string,
    guideId: string,
    slot: GuideSlot,
  ) => Promise<void>;
  onUnassignGuide: (tourId: string, slot: GuideSlot) => Promise<void>;
}

interface NamedRef {
  id: string;
  name: string;
}

const SLOTS: {
  slot: GuideSlot;
  label: string;
  metaKey: "guideLead" | "backup1" | "backup2";
}[] = [
  { slot: "guide_lead_id", label: "Guía titular", metaKey: "guideLead" },
  { slot: "backup_1_id", label: "Back-up 1", metaKey: "backup1" },
  { slot: "backup_2_id", label: "Back-up 2", metaKey: "backup2" },
];

// Siempre viene con prefijo de país, sin "+" y con espacios: "34 600 39 43 03"
function formatPhoneDisplay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return `+${raw.trim()}`;
}

function phoneToWhatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/\s+/g, "");
}

// ─── ICONO WHATSAPP (SVG inline) ────────────────────────────────────────────
function WhatsappIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.8a8.1 8.1 0 0 1 5.76 2.39 8.1 8.1 0 0 1 2.38 5.72c0 4.48-3.66 8.12-8.15 8.12a8.1 8.1 0 0 1-4.13-1.13l-.3-.17-3.14.82.84-3.06-.19-.32a8.07 8.07 0 0 1-1.24-4.31c0-4.48 3.65-8.06 8.17-8.06M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.55.12.16 1.72 2.7 4.24 3.68 2.1.82 2.53.66 2.99.62.46-.04 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.46-.28-.24-.12-1.47-.72-1.7-.8-.23-.08-.4-.12-.56.12-.16.24-.64.8-.78.97-.14.16-.29.18-.53.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.35-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.56-1.36-.78-1.86-.2-.5-.42-.42-.56-.43-.14 0-.3-.02-.46-.02Z" />
    </svg>
  );
}

// ─── FILA DATO (icono coloreado + label + valor/edición) ───────────────────
function InfoRow({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  editing,
  editField,
  extra,
  stackOnMobile = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | null;
  editing?: boolean;
  editField?: React.ReactNode;
  extra?: React.ReactNode;
  stackOnMobile?: boolean;
}) {
  return (
    <div className="flex items-start sm:items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-base-content/8 last:border-none">
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        {icon}
      </div>

      {stackOnMobile ? (
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2 min-w-0 sm:flex-1">
            <span className="text-[10px] sm:text-[11px] font-bold opacity-40 uppercase tracking-[0.08em] w-24 sm:w-28 shrink-0">
              {label}
            </span>
            <div className="min-w-0 flex-1">
              {editing && editField ? (
                editField
              ) : (
                <span className="text-sm font-semibold truncate block">
                  {value || "—"}
                </span>
              )}
            </div>
          </div>
          {!editing && extra && (
            <div className="pl-24 sm:pl-0 shrink-0">{extra}</div>
          )}
        </div>
      ) : (
        <>
          <span className="text-[10px] sm:text-[11px] font-bold opacity-40 uppercase tracking-[0.08em] w-24 sm:w-28 shrink-0">
            {label}
          </span>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {editing && editField ? (
              editField
            ) : (
              <span className="text-sm font-medium truncate">
                {value || "—"}
              </span>
            )}
            {!editing && extra}
          </div>
        </>
      )}
    </div>
  );
}

// ─── INSIGNIA DE ESTADO DE CONFIRMACIÓN ─────────────────────────────────────
function StatusBadge({ status }: { status: AssignmentStatus }) {
  const map = {
    pending: ["badge-warning", "Pendiente"],
    accepted: ["badge-success", "Confirmado"],
    rejected: ["badge-error", "Rechazó"],
    cancelled: ["badge-ghost", "Cancelado"],
  } as const;
  const [cls, text] = map[status];
  return <span className={`badge badge-sm ${cls} shrink-0`}>{text}</span>;
}

// ─── FILA DE GUÍA (lead / back-up) ──────────────────────────────────────────
// Campo de texto con autocompletado (GuideCombobox). `guides` ya llega
// filtrada por disponibilidad y por ocupación desde getGuidesForSlot.
// `loading` solo cambia el placeholder mientras se calcula la disponibilidad,
// para que no parezca que no hay guías disponibles cuando aún se está cargando.
//
// Confirmación: si el guía asignado es quien está viendo la pantalla (`isMine`)
// y su asignación está pendiente, ve Aceptar / Rechazar en vez de la X.
function GuideSlotRow({
  label,
  current,
  guides,
  loading,
  assignment,
  isMine,
  rejectedName,
  canAdminConfirm,
  onAssign,
  onUnassign,
  onRespond,
  onAdminConfirm,
}: {
  label: string;
  current: GuideRef | null;
  guides: GuideRef[];
  loading?: boolean;
  assignment?: SlotAssignment;
  isMine: boolean;
  rejectedName: string | null;
  onAssign: (guideId: string) => Promise<void>;
  onUnassign: () => Promise<void>;
  canAdminConfirm: boolean;
  onRespond: (assignmentId: string, accept: boolean) => Promise<void>;
  onAdminConfirm: (assignmentId: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function run(fn: () => Promise<void>) {
    setSaving(true);
    try {
      await fn();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  function handleChange(guideId: string) {
    if (!guideId) return;
    return run(() => onAssign(guideId));
  }

  function handleRemove() {
    return run(() => onUnassign());
  }

  function handleRespond(accept: boolean) {
    if (!assignment) return;
    return run(() => onRespond(assignment.id, accept));
  }

  function handleAdminConfirm() {
    if (!assignment) return;
    return run(() => onAdminConfirm(assignment.id));
  }

  // El propio guía acepta / rechaza lo suyo.
  const canRespond = isMine && assignment?.status === "pending";
  // La coordinadora puede confirmar cualquier asignación pendiente ajena.
  const showAdminConfirm =
    canAdminConfirm && !isMine && assignment?.status === "pending";

  return (
    <div className="flex items-start sm:items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-base-content/8 last:border-none hover:bg-base-content/[0.018] transition-colors">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
        <Users size={15} />
      </div>
      <span className="text-[10px] sm:text-[11px] font-bold opacity-40 uppercase tracking-[0.08em] w-24 sm:w-28 shrink-0 pt-1 sm:pt-0">
        {label}
      </span>

      {current ? (
        <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0 flex-wrap ">
          <span className="text-sm font-bold truncate">{current.name}</span>
          {assignment && <StatusBadge status={assignment.status} />}
          {current.phone && (
            <span className="text-xs opacity-50 flex items-center gap-1 shrink-0">
              <Phone size={11} /> {current.phone}
            </span>
          )}

          {canRespond ? (
            <div className="ml-auto flex gap-1 shrink-0">
              <button
                onClick={() => handleRespond(true)}
                disabled={saving}
                className="btn btn-success btn-xs"
              >
                Aceptar
              </button>
              <button
                onClick={() => handleRespond(false)}
                disabled={saving}
                className="btn btn-outline btn-error btn-xs"
              >
                Rechazar
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {showAdminConfirm && (
                <button
                  onClick={handleAdminConfirm}
                  disabled={saving}
                  className="btn btn-success btn-xs"
                >
                  Confirmar
                </button>
              )}
              <button
                onClick={handleRemove}
                disabled={saving}
                className="btn btn-ghost btn-xs btn-square disabled:opacity-40"
                aria-label={`Quitar ${label}`}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {assignment?.status === "rejected" && (
            <span className="text-[11px] font-semibold text-error">
              Rechazó: {rejectedName ?? "un guía"}
            </span>
          )}
          <GuideCombobox
            guides={guides}
            disabled={saving}
            placeholder={loading ? "Cargando disponibilidad..." : undefined}
            onSelect={handleChange}
          />
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function EventBody({
  event,
  form,
  setForm,
  editing,
  onAssignGuide,
  onUnassignGuide,
}: EventBodyProps) {
  const [guides, setGuides] = useState<GuideRef[]>([]);
  const [providers, setProviders] = useState<NamedRef[]>([]);
  const [operators, setOperators] = useState<NamedRef[]>([]);
  const [tourLeaders, setTourLeaders] = useState<
    (NamedRef & { phone: string | null })[]
  >([]);
  const [guidesExpanded, setGuidesExpanded] = useState(true);

  // Guías que dieron disponibilidad para este día/franja.
  const [availableGuideIds, setAvailableGuideIds] = useState<Set<string>>(
    new Set(),
  );
  const [loadingGuideAvailability, setLoadingGuideAvailability] =
    useState(true);

  // Guías ya ocupados en OTROS tours de la misma fecha y franja.
  const [assignedGuideIds, setAssignedGuideIds] = useState<Set<string>>(
    new Set(),
  );

  // Guía de la cuenta que está viendo la pantalla (null si es solo admin o no
  // está vinculada a ningún guía). Sirve para saber qué asignación es "mía".
  const [currentGuideId, setCurrentGuideId] = useState<string | null>(null);

  // ¿La cuenta actual es la coordinadora? Puede confirmar a cualquier guía.
  const [isAdmin, setIsAdmin] = useState(false);

  const meta = event.meta ?? {};
  const providerName = (meta.providerName as string) ?? null;
  const operatorName = (meta.operatorName as string) ?? null;
  const tourLeaderName = (meta.tourLeaderName as string) ?? null;
  const phoneDisplay = formatPhoneDisplay(
    form.tour_leader_phone ?? (meta.leaderPhone as string),
  );
  const whatsappDigits = phoneToWhatsappDigits(meta.leaderPhone as string);
  const [leaderOperatorMap, setLeaderOperatorMap] = useState<
    Map<string, Set<string>>
  >(new Map());

  // Estado de confirmación de cada puesto (viene de fetchTours → adaptTours).
  const assignments =
    (meta.assignments as
      | Partial<Record<GuideSlot, SlotAssignment>>
      | undefined) ?? {};

  // ── Guía de la cuenta actual ────────────────────────────────────────────
  useEffect(() => {
    fetchCurrentGuideId()
      .then(setCurrentGuideId)
      .catch(() => setCurrentGuideId(null));

    fetchIsAdmin()
      .then(setIsAdmin)
      .catch(() => setIsAdmin(false));
  }, []);

  // ── Datos de referencia (guías, proveedores, operadores, tour leaders) ──
  useEffect(() => {
    (async () => {
      const [
        { data: g },
        { data: p },
        { data: o },
        { data: tl },
        { data: history },
      ] = await Promise.all([
        supabase.from("guides").select("id, name, phone, email").order("name"),
        supabase.from("providers").select("id, name").order("name"),
        supabase.from("tour_operators").select("id, name").order("name"),
        supabase.from("tour_leaders").select("id, name, phone").order("name"),
        supabase
          .from("tours")
          .select("tour_leader_id, tour_operator_id")
          .not("tour_leader_id", "is", null)
          .not("tour_operator_id", "is", null),
      ]);
      if (g) setGuides(g as GuideRef[]);
      if (p) setProviders(p as NamedRef[]);
      if (o) setOperators(o as NamedRef[]);
      if (tl) setTourLeaders(tl as (NamedRef & { phone: string | null })[]);

      if (history) {
        const map = new Map<string, Set<string>>();
        for (const row of history as {
          tour_leader_id: string;
          tour_operator_id: string;
        }[]) {
          const set = map.get(row.tour_leader_id) ?? new Set<string>();
          set.add(row.tour_operator_id);
          map.set(row.tour_leader_id, set);
        }
        setLeaderOperatorMap(map);
      }
    })();
  }, []);

  // ── Disponibilidad de guías para este día / franja ──────────────────────
  // Se mantiene la versión que ya usabas (fetchAvailableGuideIdsForDate del
  // adapter). La consulta inline a guide_availability del trozo que me
  // pasaste hacía lo mismo, así que no se duplica aquí.
  useEffect(() => {
    let cancelled = false;

    async function loadGuideAvailability() {
      setLoadingGuideAvailability(true);

      try {
        const period =
          (event.meta?.period as "AM" | "PM" | "NT" | undefined) ?? "NT";

        const ids = await fetchAvailableGuideIdsForDate(event.date, period);

        if (!cancelled) {
          setAvailableGuideIds(ids);
        }
      } catch (error) {
        console.error("Error cargando disponibilidad de guías:", error);

        if (!cancelled) {
          setAvailableGuideIds(new Set());
        }
      } finally {
        if (!cancelled) {
          setLoadingGuideAvailability(false);
        }
      }
    }

    loadGuideAvailability();

    return () => {
      cancelled = true;
    };
  }, [event.date, event.meta?.period]);

  // ── Guías ya ocupados en otros tours de la misma fecha / franja ─────────
  useEffect(() => {
    let cancelled = false;

    async function loadAssignedGuides() {
      const period =
        (event.meta?.period as "AM" | "PM" | "NT" | undefined) ?? "NT";

      const { data, error } = await supabase
        .from("tours")
        .select("id, period, status, guide_lead_id, backup_1_id, backup_2_id")
        .eq("date", event.date)
        .eq("period", period)
        .neq("id", event.id);

      if (cancelled) return;

      if (error) {
        console.error("Error obteniendo guías ya asignados:", error);
        setAssignedGuideIds(new Set());
        return;
      }

      const ids = new Set<string>();

      for (const tour of data ?? []) {
        // Los tours cancelados no consumen guías.
        if (tour.status === "Cancelado") continue;

        if (tour.guide_lead_id) ids.add(tour.guide_lead_id);
        if (tour.backup_1_id) ids.add(tour.backup_1_id);
        if (tour.backup_2_id) ids.add(tour.backup_2_id);
      }

      setAssignedGuideIds(ids);
    }

    loadAssignedGuides();

    return () => {
      cancelled = true;
    };
  }, [event.date, event.id, event.meta?.period]);

  function handleTourLeaderChange(id: string) {
    const leader = tourLeaders.find((l) => l.id === id);
    setForm((f) => ({
      ...f,
      tour_leader_id: id || null,
      tour_leader_phone: leader?.phone ?? f.tour_leader_phone,
    }));
  }

  // ── Guías que se pueden elegir en cada slot ─────────────────────────────
  function getGuidesForSlot(slot: GuideSlot): GuideRef[] {
    const current =
      slot === "guide_lead_id"
        ? ((meta.guideLead as GuideRef | null) ?? null)
        : slot === "backup_1_id"
          ? ((meta.backup1 as GuideRef | null) ?? null)
          : ((meta.backup2 as GuideRef | null) ?? null);

    const currentId = current?.id ?? null;

    // Guías que ya ocupan OTRO slot de este mismo tour.
    const guidesAlreadyInThisTour = new Set<string>();

    if (slot !== "guide_lead_id") {
      const lead = meta.guideLead as GuideRef | null;
      if (lead?.id) guidesAlreadyInThisTour.add(lead.id);
    }

    if (slot !== "backup_1_id") {
      const backup1 = meta.backup1 as GuideRef | null;
      if (backup1?.id) guidesAlreadyInThisTour.add(backup1.id);
    }

    if (slot !== "backup_2_id") {
      const backup2 = meta.backup2 as GuideRef | null;
      if (backup2?.id) guidesAlreadyInThisTour.add(backup2.id);
    }

    return guides.filter((guide) => {
      // Tiene que haber dado disponibilidad ese día/franja.
      if (!availableGuideIds.has(guide.id)) return false;

      // El guía que ya ocupa ESTE slot debe seguir apareciendo.
      if (guide.id === currentId) return true;

      // No puede aparecer si ya está en otro slot del mismo tour.
      if (guidesAlreadyInThisTour.has(guide.id)) return false;

      // No puede aparecer si ya está ocupado en otro tour de la misma
      // fecha/franja.
      if (assignedGuideIds.has(guide.id)) return false;

      return true;
    });
  }

  // `event.meta` es un objeto sin tipo fijo: se castea igual que en el resto
  // del componente para poder leer `.id` sin que TypeScript proteste.
  const leadId = (meta.guideLead as GuideRef | null)?.id ?? null;
  const backup1Id = (meta.backup1 as GuideRef | null)?.id ?? null;
  const backup2Id = (meta.backup2 as GuideRef | null)?.id ?? null;

  return (
    <div className="w-full min-w-0 bg-base-100">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-3 lg:gap-4 p-0 lg:p-4">
        {/* ── Columna izquierda: datos del tour ── */}
        <section className="min-w-0 overflow-hidden rounded-none lg:rounded-2xl border-y lg:border border-base-content/10 bg-base-100 [html[data-theme='light']_&]:bg-white shadow-none lg:shadow-sm">
          <div className="px-4 sm:px-5 pt-4 pb-2">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] opacity-45">
              Tour info
            </h2>
          </div>

          <div className="flex flex-col">
            <InfoRow
              icon={<Truck size={16} />}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              label="Proveedor"
              value={providerName}
              editing={editing}
              editField={
                <select
                  value={form.provider_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      provider_id: e.target.value || null,
                    }))
                  }
                  className="select select-bordered select-sm flex-1 min-h-10 rounded-xl bg-base-100"
                >
                  <option value="">Sin asignar</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              }
            />

            <InfoRow
              icon={<Building2 size={16} />}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
              label="Operador"
              value={operatorName}
              editing={editing}
              editField={
                <select
                  value={form.tour_operator_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tour_operator_id: e.target.value || null,
                    }))
                  }
                  className="select select-bordered select-sm flex-1 min-h-10 rounded-xl bg-base-100"
                >
                  <option value="">Sin asignar</option>
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              }
            />

            <InfoRow
              icon={<Tag size={16} />}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
              label="Tipo de tour"
              value={event.tour}
              editing={editing}
              editField={
                <input
                  type="text"
                  value={form.tour_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tour_type: e.target.value }))
                  }
                  className="input input-bordered input-sm flex-1 min-h-10 rounded-xl bg-base-100"
                />
              }
            />

            <InfoRow
              icon={<MapPin size={16} />}
              iconBg="bg-pink-100"
              iconColor="text-pink-600"
              label="Punto encuentro"
              value={form.meeting_point}
              editing={editing}
              editField={
                <input
                  type="text"
                  placeholder="Punto de encuentro"
                  value={form.meeting_point}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, meeting_point: e.target.value }))
                  }
                  className="input input-bordered input-sm flex-1 min-h-10 rounded-xl bg-base-100"
                />
              }
            />

            <InfoRow
              icon={<Mail size={16} />}
              iconBg="bg-sky-100"
              iconColor="text-sky-600"
              label="Guía correo"
              stackOnMobile
              value={tourLeaderName}
              editing={editing}
              editField={
                <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full min-w-0">
                  <select
                    value={form.tour_leader_id ?? ""}
                    onChange={(e) => handleTourLeaderChange(e.target.value)}
                    className="select select-bordered select-sm flex-1 w-full min-h-10 rounded-xl bg-base-100"
                  >
                    <option value="">Sin asignar</option>
                    {(() => {
                      const currentOperator = form.tour_operator_id;
                      if (!currentOperator) {
                        return tourLeaders.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ));
                      }
                      const withOperator = tourLeaders.filter((l) =>
                        leaderOperatorMap.get(l.id)?.has(currentOperator),
                      );
                      const rest = tourLeaders.filter(
                        (l) => !withOperator.includes(l),
                      );
                      return (
                        <>
                          {withOperator.length > 0 && (
                            <optgroup label="Trabajan con este operador">
                              {withOperator.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {rest.length > 0 && (
                            <optgroup label="Otros guías correo">
                              {rest.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <input
                    type="text"
                    placeholder="Teléfono (34 600...)"
                    value={form.tour_leader_phone ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        tour_leader_phone: e.target.value,
                      }))
                    }
                    className="input input-bordered input-sm w-full sm:w-40 min-h-10 rounded-xl bg-base-100"
                  />
                </div>
              }
              extra={
                whatsappDigits && (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={
                      phoneDisplay
                        ? `Contactar por WhatsApp: ${phoneDisplay}`
                        : "Contactar por WhatsApp"
                    }
                    aria-label="Contactar por WhatsApp"
                    className="flex items-center gap-2 group"
                  >
                    {phoneDisplay && (
                      <span className="text-xs font-semibold text-base-content/65 group-hover:text-base-content transition-colors">
                        {phoneDisplay}
                      </span>
                    )}
                    <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                      <WhatsappIcon />
                    </span>
                  </a>
                )
              }
            />

            <InfoRow
              icon={<StickyNote size={16} />}
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
              label="Observaciones"
              value={form.notes || "Sin notas"}
              editing={editing}
              editField={
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Notas..."
                  className="textarea textarea-bordered textarea-sm flex-1 rounded-xl bg-base-100"
                  rows={2}
                />
              }
            />

            <InfoRow
              icon={<Clock size={16} />}
              iconBg="bg-slate-100"
              iconColor="text-slate-500"
              label="Pax"
              value={String(form.pax ?? 0)}
              editing={editing}
              editField={
                <input
                  type="number"
                  min={0}
                  value={form.pax}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pax: Number(e.target.value) }))
                  }
                  className="input input-bordered input-sm w-24"
                />
              }
            />
          </div>
        </section>

        {/* ── Columna derecha: guías + multimedia ── */}
        <section className="min-w-0 flex flex-col overflow-hidden rounded-none lg:rounded-2xl border-y lg:border border-base-content/10 bg-base-100 shadow-none lg:shadow-sm bg-base-100 [html[data-theme='light']_&]:bg-white">
          {/* ── Guías asignados (colapsable) ── */}
          <div>
            <button
              onClick={() => setGuidesExpanded((v) => !v)}
              className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-base-content/8 hover:bg-base-content/[0.025] transition-colors"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-50 text-indigo-600">
                <Users size={16} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-xs font-extrabold uppercase tracking-[0.1em] block">
                  Guías asignados
                </span>
                <span className="text-[11px] opacity-40 block mt-0.5">
                  Titular y back-ups del tour
                </span>
              </div>
              {guidesExpanded ? (
                <ChevronUp size={17} className="opacity-45" />
              ) : (
                <ChevronDown size={17} className="opacity-45" />
              )}
            </button>

            {guidesExpanded && (
              <div className="flex flex-col">
                {SLOTS.map(({ slot, label, metaKey }) => {
                  const assignment = assignments[slot];
                  return (
                    <GuideSlotRow
                      key={slot}
                      label={label}
                      current={(meta[metaKey] as GuideRef | null) ?? null}
                      guides={getGuidesForSlot(slot)}
                      loading={loadingGuideAvailability}
                      assignment={assignment}
                      isMine={
                        !!assignment &&
                        currentGuideId !== null &&
                        assignment.guideId === currentGuideId
                      }
                      rejectedName={
                        assignment?.status === "rejected"
                          ? (guides.find((g) => g.id === assignment.guideId)
                              ?.name ?? null)
                          : null
                      }
                      onAssign={(guideId) =>
                        onAssignGuide(event.id, guideId, slot)
                      }
                      onUnassign={() => onUnassignGuide(event.id, slot)}
                      canAdminConfirm={isAdmin}
                      onRespond={respondToAssignment}
                      onAdminConfirm={adminConfirmAssignment}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Multimedia y finalizar ── */}
          <div className="border-t border-base-content/10 mt-1">
            <TourAttachments
              key={`${leadId}-${backup1Id}-${backup2Id}`}
              tourId={event.id}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
