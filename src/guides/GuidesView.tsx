import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import GuideButton from "./GuideButton";
import GuideDetailView from "./GuideDetailView";

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

interface GuidesViewProps {
  onSelectGuide?: (id: string) => void;
}

export default function GuidesView({ onSelectGuide }: GuidesViewProps) {
  // 1. Estado DENTRO del componente
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGuides = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("guides")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error cargando guías:", error);
        setError("No se pudieron cargar las guías.");
        setGuides([]);
      } else {
        setGuides((data as Guide[]) ?? []);
      }

      setLoading(false);
    };

    fetchGuides();
  }, []);

  // Manejador del click en la tarjeta
  const handleSelectGuide = (id: string) => {
    setSelectedGuideId(id);
    if (onSelectGuide) {
      onSelectGuide(id);
    }
  };

  // 2. Muestra la vista de detalle cuando hay un ID seleccionado
  if (selectedGuideId) {
    return (
      <GuideDetailView
        guideId={selectedGuideId}
        onBack={() => setSelectedGuideId(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 opacity-30">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm">Cargando guías...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-base-content tracking-tight">
            Guías
          </h1>

          <p className="text-xs opacity-40 mt-0.5">
            {guides.length} guía{guides.length !== 1 ? "s" : ""} registrada
            {guides.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Preparado para la siguiente fase */}
        <button
          type="button"
          disabled
          className="btn btn-primary btn-sm gap-2"
          title="Disponible en la siguiente fase"
        >
          <Plus size={16} />
          Añadir nuevo guía
        </button>
      </div>

      {/* Lista */}
      {guides.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 opacity-20">
          <span className="text-4xl">👤</span>
          <span className="text-sm">Sin guías registradas</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map((guide, index) => (
            <GuideButton
              key={guide.id}
              id={guide.id}
              name={guide.name}
              email={guide.email}
              index={index}
              onClick={handleSelectGuide}
            />
          ))}
        </div>
      )}
    </div>
  );
}