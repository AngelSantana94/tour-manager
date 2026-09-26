import { useEffect, useState } from "react";
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
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

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
}

interface GuideDetailViewProps {
  guideId: string;
  onBack: () => void;
}

function formatPhoneForWhatsApp(phone: string) {
  return phone.replace(/\D/g, "");
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-35">
        {icon}
        {label}
      </div>

      <div className="text-sm text-base-content min-h-[24px] flex items-center">
        {value || <span className="opacity-30">No indicado</span>}
      </div>
    </div>
  );
}

export default function GuideDetailView({
  guideId,
  onBack,
}: GuideDetailViewProps) {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de edición y formulario
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    city: "",
    languages: "",
    email: "",
    phone: "",
    fixed_days: "",
    notes: "",
  });

  useEffect(() => {
    const fetchGuide = async () => {
      if (!guideId) {
        setError("No se ha indicado el guía.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("guides")
        .select("*")
        .eq("id", guideId)
        .single();

      if (error) {
        console.error("Error cargando guía:", error);
        setError("No se pudo cargar la información del guía.");
        setGuide(null);
      } else {
        const fetchedGuide = data as Guide;
        setGuide(fetchedGuide);
        populateFormData(fetchedGuide);
      }

      setLoading(false);
    };

    fetchGuide();
  }, [guideId]);

  // Carga los datos del guía en el estado local del formulario
  const populateFormData = (g: Guide) => {
    setFormData({
      name: g.name || "",
      city: g.city || "",
      languages: g.languages ? g.languages.join(", ") : "",
      email: g.email || "",
      phone: g.phone || "",
      fixed_days: g.fixed_days ? g.fixed_days.join(", ") : "",
      notes: g.notes || "",
    });
  };

  const handleCancel = () => {
    if (guide) populateFormData(guide);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!guide) return;

    if (!formData.name.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }

    setSaving(true);

    // Formatear arrays de texto
    const languagesArray = formData.languages
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const fixedDaysArray = formData.fixed_days
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const updatedPayload = {
      name: formData.name.trim(),
      city: formData.city.trim() || null,
      languages: languagesArray.length > 0 ? languagesArray : null,
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      fixed_days: fixedDaysArray.length > 0 ? fixedDaysArray : null,
      notes: formData.notes.trim() || null,
    };

    const { data, error } = await supabase
      .from("guides")
      .update(updatedPayload)
      .eq("id", guide.id)
      .select()
      .single();

    if (error) {
      console.error("Error guardando guía:", error);
      alert("No se pudieron guardar los cambios.");
    } else {
      setGuide(data as Guide);
      populateFormData(data as Guide);
      setIsEditing(false);
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm">Cargando guía...</span>
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <span className="text-sm text-error">
          {error ?? "Guía no encontrada."}
        </span>

        <button
          type="button"
          onClick={onBack}
          className="btn btn-ghost btn-sm"
        >
          Volver a guías
        </button>
      </div>
    );
  }

  const whatsappPhone = guide.phone
    ? formatPhoneForWhatsApp(guide.phone)
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Botones de acción superior */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="btn btn-ghost btn-sm gap-2 px-2"
        >
          <ArrowLeft size={16} />
          Volver a guías
        </button>

        {!isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="btn btn-outline btn-sm gap-2"
          >
            <Pencil size={15} />
            Editar datos
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="btn btn-ghost btn-sm gap-1 text-error"
            >
              <X size={16} />
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary btn-sm gap-2"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Guardar cambios
            </button>
          </div>
        )}
      </div>

      {/* Cabecera / Nombre */}
      <div className="bg-base-100 border border-base-content/10 rounded-2xl p-6">
        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest opacity-35">
              Nombre Completo *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="input input-bordered w-full font-bold text-lg"
              placeholder="Nombre del guía"
            />
          </div>
        ) : (
          <h1 className="text-2xl font-black text-base-content tracking-tight">
            {guide.name}
          </h1>
        )}
      </div>

      {/* Información principal */}
      <div className="bg-base-100 border border-base-content/10 rounded-2xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
          {/* Nombre (en modo visualización) */}
          {!isEditing && <Field label="Nombre" value={guide.name} />}

          {/* Origen */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-35 flex items-center gap-1.5">
                <MapPin size={12} /> Origen
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="input input-bordered input-sm w-full"
                placeholder="Ej. Brujas"
              />
            </div>
          ) : (
            <Field
              label="Origen"
              value={guide.city}
              icon={<MapPin size={12} />}
            />
          )}

          {/* Idiomas */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-35 flex items-center gap-1.5">
                <Languages size={12} /> Idiomas (separados por coma)
              </label>
              <input
                type="text"
                value={formData.languages}
                onChange={(e) =>
                  setFormData({ ...formData, languages: e.target.value })
                }
                className="input input-bordered input-sm w-full"
                placeholder="Español, Inglés, Holandés"
              />
            </div>
          ) : (
            <Field
              label="Idioma"
              value={
                guide.languages?.length ? guide.languages.join(", ") : null
              }
              icon={<Languages size={12} />}
            />
          )}

          {/* Email */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-35 flex items-center gap-1.5">
                <Mail size={12} /> Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="input input-bordered input-sm w-full"
                placeholder="ejemplo@correo.com"
              />
            </div>
          ) : (
            <Field
              label="Email"
              value={
                guide.email ? (
                  <a href={`mailto:${guide.email}`} className="link link-hover">
                    <span className="inline-flex items-center gap-2">
                      <Mail size={15} />
                      {guide.email}
                    </span>
                  </a>
                ) : null
              }
            />
          )}

          {/* Teléfono */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-35">
                Teléfono
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="input input-bordered input-sm w-full"
                placeholder="+32 123 45 67 89"
              />
            </div>
          ) : (
            <Field
              label="Teléfono"
              value={
                guide.phone ? (
                  <div className="flex items-center gap-2">
                    <span>{guide.phone}</span>
                    {whatsappPhone && (
                      <a
                        href={`https://wa.me/${whatsappPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-success btn-xs btn-circle"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </a>
                    )}
                  </div>
                ) : null
              }
            />
          )}

          {/* Días fijos */}
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-35">
                Días fijos (separados por coma)
              </label>
              <input
                type="text"
                value={formData.fixed_days}
                onChange={(e) =>
                  setFormData({ ...formData, fixed_days: e.target.value })
                }
                className="input input-bordered input-sm w-full"
                placeholder="Lunes, Miércoles, Viernes"
              />
            </div>
          ) : (
            <Field
              label="Días fijos"
              value={
                guide.fixed_days?.length ? guide.fixed_days.join(", ") : null
              }
            />
          )}
        </div>
      </div>

      {/* Observaciones */}
      <div className="bg-base-100 border border-base-content/10 rounded-2xl p-6">
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-35 mb-2">
          Observaciones
        </div>

        {isEditing ? (
          <textarea
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            className="textarea textarea-bordered w-full h-32 text-sm"
            placeholder="Añade observaciones sobre el guía..."
          />
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {guide.notes || (
              <span className="opacity-30">Sin observaciones.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}