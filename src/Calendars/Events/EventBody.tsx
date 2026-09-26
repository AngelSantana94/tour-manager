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
  type GuideRef,
  type GuideSlot,
} from "../Services/Supabase.adapter";
import type { CalendarEvent } from "../CreateEventModal";
import type { TourFormState } from "./EventPage";

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
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string | null;
  editing?: boolean;
  editField?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-base-content/5 last:border-none">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        {icon}
      </div>
      <span className="text-[11px] font-bold opacity-40 uppercase tracking-wide w-28 shrink-0">
        {label}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing && editField ? (
          editField
        ) : (
          <span className="text-sm font-medium truncate">{value || "—"}</span>
        )}
        {!editing && extra}
      </div>
    </div>
  );
}

// ─── FILA DE GUÍA (lead / back-up) ──────────────────────────────────────────
function GuideSlotRow({
  label,
  current,
  guides,
  onAssign,
  onUnassign,
}: {
  label: string;
  current: GuideRef | null;
  guides: GuideRef[];
  onAssign: (guideId: string) => void;
  onUnassign: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(guideId: string) {
    if (!guideId) return;
    setSaving(true);
    try {
      await onAssign(guideId);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await onUnassign();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-base-content/5 last:border-none">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
        <Users size={15} />
      </div>
      <span className="text-[11px] font-bold opacity-40 uppercase tracking-wide w-28 shrink-0">
        {label}
      </span>

      {current ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-bold truncate">{current.name}</span>
          {current.phone && (
            <span className="text-xs opacity-50 flex items-center gap-1 shrink-0">
              <Phone size={11} /> {current.phone}
            </span>
          )}
          <button
            onClick={handleRemove}
            disabled={saving}
            className="ml-auto btn btn-ghost btn-xs btn-square disabled:opacity-40"
            aria-label={`Quitar ${label}`}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <select
          defaultValue=""
          disabled={saving}
          onChange={(e) => handleChange(e.target.value)}
          className="select select-bordered select-sm flex-1 text-sm"
        >
          <option value="">Sin asignar — elegir guía...</option>
          {guides.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
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

  function handleTourLeaderChange(id: string) {
    const leader = tourLeaders.find((l) => l.id === id);
    setForm((f) => ({
      ...f,
      tour_leader_id: id || null,
      tour_leader_phone: leader?.phone ?? f.tour_leader_phone,
    }));
  }

  return (
    <div className="bg-base-100">
      {/* ── Datos del tour ── */}
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
                setForm((f) => ({ ...f, provider_id: e.target.value || null }))
              }
              className="select select-bordered select-sm flex-1"
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
              className="select select-bordered select-sm flex-1"
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
              className="input input-bordered input-sm flex-1"
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
              className="input input-bordered input-sm flex-1"
            />
          }
        />

        <InfoRow
          icon={<Mail size={16} />}
          iconBg="bg-sky-100"
          iconColor="text-sky-600"
          label="Guía correo"
          value={tourLeaderName}
          editing={editing}
          editField={
            <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full min-w-0">
              <select
                value={form.tour_leader_id ?? ""}
                onChange={(e) => handleTourLeaderChange(e.target.value)}
                className="select select-bordered select-sm flex-1 w-full"
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
                  setForm((f) => ({ ...f, tour_leader_phone: e.target.value }))
                }
                className="input input-bordered input-sm w-full sm:w-40"
              />
            </div>
          }
          extra={
            whatsappDigits && (
              <div className="ml-auto flex flex-col items-end shrink-0">
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  title={phoneDisplay ?? undefined}
                >
                  <WhatsappIcon />
                  <span>WhatsApp</span>
                </a>
                {phoneDisplay && (
                  <span className="text-[11px] text-base-content/60 font-medium">
                    {phoneDisplay}
                  </span>
                )}
              </div>
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
              className="textarea textarea-bordered textarea-sm flex-1"
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

      {/* ── Guías asignados (colapsable) ── */}
      <div className="border-t-8 border-base-200/40">
        <button
          onClick={() => setGuidesExpanded((v) => !v)}
          className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-600">
            <Users size={15} />
          </div>
          <span className="text-sm font-bold uppercase tracking-wide flex-1 text-left">
            Guías asignados
          </span>
          {guidesExpanded ? (
            <ChevronUp size={16} className="opacity-40" />
          ) : (
            <ChevronDown size={16} className="opacity-40" />
          )}
        </button>

        {guidesExpanded && (
          <div className="flex flex-col">
            {SLOTS.map(({ slot, label, metaKey }) => (
              <GuideSlotRow
                key={slot}
                label={label}
                current={(meta[metaKey] as GuideRef | null) ?? null}
                guides={guides}
                onAssign={(guideId) => onAssignGuide(event.id, guideId, slot)}
                onUnassign={() => onUnassignGuide(event.id, slot)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
