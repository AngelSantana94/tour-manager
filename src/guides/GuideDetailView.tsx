import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  MapPin,
  Languages,
  Pencil,
  Save,
  X,
  Loader2,
  Calendar as CalendarIcon,
  User,
  Clock,
  CalendarPlus,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Info,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../login/AuthContext";
import {
  fetchAvailabilityForRange,
  type AvailabilityStatus,
  type GuideAvailability,
} from "../Availability/Services/Availability.adapter";
import AvailabilityPickerModal from "../Availability/AvailabilityPickerModal";

interface Guide {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  languages: string[] | null;
  phone: string | null;
  fixed_days: string[] | null;
  notes: string | null;
  user_id: string | null;
  created_at: string | null;
  avatar_url?: string | null;
}

type ProfileRole = "admin" | "guide";

interface GuideDetailViewProps {
  guideId: string;
  onBack: () => void;
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DIAS = ["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getTodayString(): string {
  return toDateString(new Date());
}

function getMonthRange(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    from: toDateString(firstDay),
    to: toDateString(lastDay),
  };
}

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);

  // JS: domingo = 0. Convertimos a lunes = 0.
  const mondayOffset = (firstDay.getDay() + 6) % 7;

  const gridStart = new Date(year, month, 1 - mondayOffset);
  const days: Date[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push(date);
  }

  return days;
}

function formatPhoneForWhatsApp(phone: string | null): string | null {
  if (!phone) return null;

  const cleaned = phone.replace(/[^\d+]/g, "");

  if (!cleaned) return null;

  return cleaned.startsWith("+") ? cleaned : `32${cleaned.replace(/^0+/, "")}`;
}

function availabilityLabel(
  availability: GuideAvailability | undefined,
): string {
  if (!availability) return "Sin marcar";

  if (availability.status === "blocked") {
    return "Bloqueado";
  }

  if (availability.shift === "FULL") {
    return "Disponible todo el día";
  }

  if (availability.shift === "AM") {
    return "Disponible mañana";
  }

  return "Disponible tarde";
}

function GuideDetailView({ guideId, onBack }: GuideDetailViewProps) {
  const { isAdmin } = useAuth();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    city: "",
    phone: "",
    languages: "",
    fixed_days: "",
    notes: "",
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ROL DEL PERFIL
  // ─────────────────────────────────────────────────────────────────────────

  const [guideRole, setGuideRole] = useState<ProfileRole>("guide");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // CALENDARIO
  // ─────────────────────────────────────────────────────────────────────────

  const today = useMemo(() => getTodayString(), []);

  const [calendarDate, setCalendarDate] = useState(() => {
    const now = new Date();

    return {
      year: now.getFullYear(),
      month: now.getMonth(),
    };
  });

  const [availability, setAvailability] = useState<
    Record<string, GuideAvailability>
  >({});

  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );

  const [pickerMode, setPickerMode] = useState<AvailabilityStatus | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // CARGAR GUÍA + PERFIL
  // ─────────────────────────────────────────────────────────────────────────

  const loadGuide = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRoleError(null);

    const { data, error: guideError } = await supabase
      .from("guides")
      .select("*")
      .eq("id", guideId)
      .single();

    if (guideError) {
      console.error("Error cargando guía:", guideError.message);
      setError("No se pudo cargar la información del guía.");
      setLoading(false);
      return;
    }

    const loadedGuide = data as Guide;

    setGuide(loadedGuide);

    setForm({
      name: loadedGuide.name ?? "",
      email: loadedGuide.email ?? "",
      city: loadedGuide.city ?? "",
      phone: loadedGuide.phone ?? "",
      languages: loadedGuide.languages?.join(", ") ?? "",
      fixed_days: loadedGuide.fixed_days?.join(", ") ?? "",
      notes: loadedGuide.notes ?? "",
    });

    // El rol vive en profiles, no en guides.
    // guides.user_id → profiles.id
    if (loadedGuide.user_id) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", loadedGuide.user_id)
        .maybeSingle();

      if (profileError) {
        console.error("Error cargando rol del perfil:", profileError.message);
      }

      setGuideRole(profileData?.role === "admin" ? "admin" : "guide");
    } else {
      setGuideRole("guide");
    }

    setLoading(false);
  }, [guideId]);

  useEffect(() => {
    void loadGuide();
  }, [loadGuide]);

  // ─────────────────────────────────────────────────────────────────────────
  // CARGAR DISPONIBILIDAD DEL MES
  // ─────────────────────────────────────────────────────────────────────────

  const loadAvailability = useCallback(async () => {
    setAvailabilityLoading(true);
    setAvailabilityError(null);

    const { from, to } = getMonthRange(calendarDate.year, calendarDate.month);

    try {
      const data = await fetchAvailabilityForRange(guideId, from, to);

      setAvailability(data);
    } catch (err) {
      console.error("Error cargando disponibilidad:", err);

      setAvailabilityError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la disponibilidad.",
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, [guideId, calendarDate.year, calendarDate.month]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  // ─────────────────────────────────────────────────────────────────────────
  // NAVEGACIÓN DEL MES
  // ─────────────────────────────────────────────────────────────────────────

  function goToPreviousMonth() {
    setCalendarDate((current) => {
      if (current.month === 0) {
        return {
          year: current.year - 1,
          month: 11,
        };
      }

      return {
        year: current.year,
        month: current.month - 1,
      };
    });
  }

  function goToNextMonth() {
    setCalendarDate((current) => {
      if (current.month === 11) {
        return {
          year: current.year + 1,
          month: 0,
        };
      }

      return {
        year: current.year,
        month: current.month + 1,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GUARDAR DATOS DEL GUÍA
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSaveProfile() {
    if (!guide) return;

    setSaving(true);
    setError(null);

    const languages = form.languages
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const fixedDays = form.fixed_days
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const { data, error: updateError } = await supabase
      .from("guides")
      .update({
        name: form.name.trim(),
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        phone: form.phone.trim() || null,
        languages: languages.length ? languages : null,
        fixed_days: fixedDays.length ? fixedDays : null,
        notes: form.notes.trim() || null,
      })
      .eq("id", guide.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error actualizando guía:", updateError.message);

      setError(`No se pudo guardar la información: ${updateError.message}`);

      setSaving(false);
      return;
    }

    setGuide(data as Guide);
    setEditing(false);
    setSaving(false);
  }

  function handleCancelEdit() {
    if (!guide) return;

    setForm({
      name: guide.name ?? "",
      email: guide.email ?? "",
      city: guide.city ?? "",
      phone: guide.phone ?? "",
      languages: guide.languages?.join(", ") ?? "",
      fixed_days: guide.fixed_days?.join(", ") ?? "",
      notes: guide.notes ?? "",
    });

    setEditing(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAMBIAR ROL ADMIN / GUÍA
  // ─────────────────────────────────────────────────────────────────────────

  async function handleRoleToggle(event: React.ChangeEvent<HTMLInputElement>) {
    if (!guide?.user_id || !isAdmin || roleSaving) {
      return;
    }

    const nextRole: ProfileRole = event.target.checked ? "admin" : "guide";

    const previousRole = guideRole;

    setRoleSaving(true);
    setRoleError(null);
    setGuideRole(nextRole);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        role: nextRole,
      })
      .eq("id", guide.user_id);

    if (updateError) {
      console.error("Error actualizando rol:", updateError.message);

      setGuideRole(previousRole);
      setRoleError(`No se pudo cambiar el rol: ${updateError.message}`);
    }

    setRoleSaving(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ESTADÍSTICAS DE DISPONIBILIDAD
  // ─────────────────────────────────────────────────────────────────────────

  const availabilityStats = useMemo(() => {
    let available = 0;
    let blocked = 0;
    let full = 0;

    Object.values(availability).forEach((item) => {
      if (item.status === "blocked") {
        blocked++;
        return;
      }

      available++;

      if (item.shift === "FULL") {
        full++;
      }
    });

    return {
      available,
      blocked,
      full,
    };
  }, [availability]);

  const calendarDays = useMemo(
    () => getCalendarDays(calendarDate.year, calendarDate.month),
    [calendarDate.year, calendarDate.month],
  );

  const whatsappPhone = formatPhoneForWhatsApp(guide?.phone ?? null);

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-base-content/50">
          <Loader2 className="h-7 w-7 animate-spin" />
          <span className="text-sm">Cargando guía...</span>
        </div>
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="flex h-full min-h-[500px] flex-col items-center justify-center gap-4">
        <div className="rounded-full bg-error/10 p-4 text-error">
          <Info className="h-6 w-6" />
        </div>

        <p className="text-sm text-base-content/60">
          {error ?? "No se encontró el guía."}
        </p>

        <button type="button" onClick={onBack} className="btn btn-sm btn-ghost">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-base-200/30">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* HEADER                                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      <header className="flex shrink-0 items-center gap-3 border-b border-base-content/10 bg-base-100 px-4 py-3 md:px-6">
        {isAdmin && (
          <button
            type="button"
            onClick={onBack}
            className="btn btn-sm btn-ghost btn-circle"
            title="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
              {guide.avatar_url ? (
                <img
                  src={guide.avatar_url}
                  alt={guide.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{guide.name}</h1>

              {/* ROL + TOGGLE ADMIN */}
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={[
                    "text-xs font-medium",
                    guideRole === "admin"
                      ? "text-primary"
                      : "text-base-content/50",
                  ].join(" ")}
                >
                  {guideRole}
                </span>

                {isAdmin && guide.user_id && (
                  <>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-xs"
                      checked={guideRole === "admin"}
                      disabled={roleSaving}
                      onChange={handleRoleToggle}
                      aria-label="Cambiar rol de administrador"
                    />

                    {roleSaving && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-base-content/40" />
                    )}
                  </>
                )}
              </div>

              {roleError && (
                <p className="mt-1 text-xs text-error">{roleError}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {whatsappPhone && (
            <a
              href={`https://wa.me/${whatsappPhone}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-ghost text-success"
              title="WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden lg:inline">WhatsApp</span>
            </a>
          )}

          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn btn-sm btn-outline"
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="btn btn-sm btn-ghost"
                disabled={saving}
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>

              <button
                type="button"
                onClick={handleSaveProfile}
                className="btn btn-sm btn-primary"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                <span className="hidden sm:inline">Guardar</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ERROR                                                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {error && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-error/20 bg-error/5 px-4 py-2 text-sm text-error md:px-6">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError(null)}
            className="btn btn-xs btn-ghost text-error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BODY                                                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto pt-3 px-0 pb-0 md:p-6 ">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 ">
          {/* ─────────────────────────────────────────────────────────────── */}
          {/* PROFILE CARD                                                   */}
          {/* ─────────────────────────────────────────────────────────────── */}

          <section className="rounded-2xl border border-base-content/10 bg-base-100 [html[data-theme='light']_&]:bg-white shadow-sm ">
            <div className="border-b border-base-content/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Información del guía</h2>
              </div>
            </div>

            {editing ? (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                <label className="form-control">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Nombre
                  </span>

                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-control">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Email
                  </span>

                  <input
                    type="email"
                    className="input input-bordered w-full"
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-control">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Ciudad
                  </span>

                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={form.city}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-control">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Teléfono
                  </span>

                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-control md:col-span-2">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Idiomas
                  </span>

                  <input
                    type="text"
                    className="input input-bordered w-full"
                    placeholder="Español, Inglés, Francés"
                    value={form.languages}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        languages: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-control md:col-span-2">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Días fijos
                  </span>

                  <input
                    type="text"
                    className="input input-bordered w-full"
                    placeholder="Lunes, Miércoles, Viernes"
                    value={form.fixed_days}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fixed_days: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-control md:col-span-2 xl:col-span-4">
                  <span className="mb-1 text-xs font-medium text-base-content/60">
                    Notas
                  </span>

                  <textarea
                    className="textarea textarea-bordered min-h-24 w-full"
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-base-content/50">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </div>

                  <p className="text-sm font-medium">{guide.email || "—"}</p>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-base-content/50">
                    <MapPin className="h-3.5 w-3.5" />
                    Ciudad
                  </div>

                  <p className="text-sm font-medium">{guide.city || "—"}</p>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-base-content/50">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Teléfono
                  </div>

                  <p className="text-sm font-medium">{guide.phone || "—"}</p>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-base-content/50">
                    <Languages className="h-3.5 w-3.5" />
                    Idiomas
                  </div>

                  {guide.languages?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {guide.languages.map((language) => (
                        <span
                          key={language}
                          className="badge badge-sm badge-ghost"
                        >
                          {language}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-medium">—</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 flex items-center gap-2 text-xs text-base-content/50">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Días fijos
                  </div>

                  <p className="text-sm font-medium">
                    {guide.fixed_days?.length
                      ? guide.fixed_days.join(", ")
                      : "—"}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 flex items-center gap-2 text-xs text-base-content/50">
                    <Info className="h-3.5 w-3.5" />
                    Notas
                  </div>

                  <p className="whitespace-pre-wrap text-sm font-medium">
                    {guide.notes || "—"}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* AVAILABILITY                                                    */}
          {/* ─────────────────────────────────────────────────────────────── */}

          <section className="rounded-2xl border border-base-content/10 bg-base-100 [html[data-theme='light']_&]:bg-white shadow-sm">
            {/* HEADER CALENDARIO */}
            <div className="flex flex-col gap-4 border-b border-base-content/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" />

                  <h2 className="font-semibold">
                    Gestión de Disponibilidad & Calendario
                  </h2>
                </div>

                <p className="mt-1 text-xs text-base-content/50">
                  Gestiona la disponibilidad de {guide.name}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="stats stats-horizontal border border-base-content/10 bg-base-200/40 shadow-none">
                  <div className="stat px-3 py-2">
                    <div className="stat-title text-[10px]">Disponibles</div>

                    <div className="stat-value text-lg text-success">
                      {availabilityStats.available}
                    </div>
                  </div>

                  <div className="stat px-3 py-2">
                    <div className="stat-title text-[10px]">Bloqueados</div>

                    <div className="stat-value text-lg text-error">
                      {availabilityStats.blocked}
                    </div>
                  </div>

                  <div className="stat px-3 py-2">
                    <div className="stat-title text-[10px]">FULL</div>

                    <div className="stat-value text-lg text-primary">
                      {availabilityStats.full}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setPickerMode("available")}
                >
                  <CalendarPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Añadir disponibilidad
                  </span>
                  <span className="sm:hidden">Añadir</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-outline btn-error"
                  onClick={() => setPickerMode("blocked")}
                >
                  <CalendarX className="h-4 w-4" />
                  <span className="hidden sm:inline">Bloquear fechas</span>
                  <span className="sm:hidden">Bloquear</span>
                </button>
              </div>
            </div>

            {/* CALENDARIO */}
            <div className="p-4 md:p-5">
              {/* Navegación */}
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="btn btn-sm btn-ghost btn-circle"
                  title="Mes anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="text-center">
                  <h3 className="text-base font-semibold">
                    {MESES[calendarDate.month]} {calendarDate.year}
                  </h3>

                  <p className="text-xs text-base-content/40">
                    Disponibilidad mensual
                  </p>
                </div>

                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="btn btn-sm btn-ghost btn-circle"
                  title="Mes siguiente"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* Error */}
              {availabilityError && (
                <div className="mb-4 flex items-center justify-between rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
                  <span>{availabilityError}</span>

                  <button
                    type="button"
                    onClick={() => void loadAvailability()}
                    className="btn btn-xs btn-ghost text-error"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {/* Leyenda */}
              <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-base-content/60">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Disponible FULL
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                  AM / PM
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  Bloqueado
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-base-content/20" />
                  Sin marcar
                </div>
              </div>

              {/* Grid */}
              <div className="relative overflow-hidden rounded-xl border border-base-content/10">
                {availabilityLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-base-100/70 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-4 py-3 shadow-lg">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm">
                        Cargando disponibilidad...
                      </span>
                    </div>
                  </div>
                )}

                {/* Días de la semana */}
                <div className="grid grid-cols-7 border-b border-base-content/10 bg-base-200/50">
                  {DIAS.map((day) => (
                    <div
                      key={day}
                      className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-base-content/50 sm:text-xs"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Días */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((date) => {
                    const dateString = toDateString(date);
                    const isCurrentMonth =
                      date.getMonth() === calendarDate.month;
                    const isToday = dateString === today;
                    const isPast = dateString < today;

                    const item = availability[dateString];

                    const statusClass = !item
                      ? "bg-base-100"
                      : item.status === "blocked"
                        ? "bg-rose-500/10"
                        : item.shift === "FULL"
                          ? "bg-emerald-500/10"
                          : "bg-teal-500/10";

                    const accentClass = !item
                      ? "bg-base-content/10"
                      : item.status === "blocked"
                        ? "bg-rose-500"
                        : item.shift === "FULL"
                          ? "bg-emerald-500"
                          : "bg-teal-500";

                    return (
                      <div
                        key={dateString}
                        className={[
                          "group relative min-h-[82px] border-b border-r border-base-content/10 p-1.5 transition-colors sm:min-h-[100px] sm:p-2",
                          statusClass,
                          !isCurrentMonth ? "opacity-35" : "",
                          isPast ? "cursor-default" : "hover:bg-base-200/30",
                        ].join(" ")}
                        title={
                          item
                            ? availabilityLabel(item)
                            : "Sin disponibilidad marcada"
                        }
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span
                            className={[
                              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                              isToday
                                ? "ring-2 ring-primary ring-offset-1 ring-offset-base-100"
                                : "",
                              !isCurrentMonth ? "text-base-content/40" : "",
                            ].join(" ")}
                          >
                            {date.getDate()}
                          </span>

                          {item && (
                            <span
                              className={[
                                "mt-1 h-2 w-2 shrink-0 rounded-full",
                                accentClass,
                              ].join(" ")}
                            />
                          )}
                        </div>

                        {item && (
                          <div className="mt-2">
                            <div
                              className={[
                                "rounded-md px-1.5 py-1 text-[9px] font-semibold leading-tight sm:text-[10px]",
                                item.status === "blocked"
                                  ? "text-rose-600 dark:text-rose-300"
                                  : item.shift === "FULL"
                                    ? "text-emerald-600 dark:text-emerald-300"
                                    : "text-teal-600 dark:text-teal-300",
                              ].join(" ")}
                            >
                              {item.status === "blocked"
                                ? "BLOQUEADO"
                                : item.shift === "FULL"
                                  ? "FULL"
                                  : item.shift}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info inferior */}
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-base-200/50 px-3 py-3 text-xs text-base-content/50">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                <p>
                  Los días históricos permanecen visibles para consultar el
                  registro. Las nuevas disponibilidades y bloqueos se gestionan
                  mediante los botones superiores.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PICKER                                                              */}
      {/* ─────────────────────────────────────────────────────────────────── */}

      {pickerMode && (
        <AvailabilityPickerModal
          guideId={guideId}
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onSaved={() => {
            void loadAvailability();
          }}
        />
      )}
    </div>
  );
}

export default GuideDetailView;
